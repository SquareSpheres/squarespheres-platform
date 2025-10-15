import type { FileTransferAckProgress } from '../types/fileTransfer';
import type { Logger } from '../types/logger';
import type { ProgressManager } from '../types/progressManager';
import type { FileTransferConfig } from '../types/fileTransferConfig';
import { FILE_SIZE_THRESHOLDS, TRANSFER_TIMEOUTS, MIN_ACK_INTERVAL_MS } from '../utils/fileTransferConstants';
import { MESSAGE_TYPES } from '../constants/messageTypes';
import { MessageQueue } from '../utils/MessageQueue';
import { calculateAdaptiveTimeout } from '../utils/transferTimeoutUtils';
import { shouldSendAck as shouldSendAckUtil } from '../utils/ackStrategy';

export function createStreamHandlersCore(params: {
  logger: Logger;
  progressManager: ProgressManager;
  transferBuffersRef: React.RefObject<Map<string, Uint8Array>>;
  transferInfoRef: React.RefObject<Map<string, {
    fileName: string;
    fileSize: number;
    bytesReceived: number;
    startTime: number;
    lastLoggedPercentage?: number;
    lastAckTime?: number;
  }>>;
  transferTimeoutsRef: React.RefObject<Map<string, NodeJS.Timeout>>;
  resetTimeout: (transferId: string, ms: number, callback: () => void) => void;
  setReceivedFile: React.Dispatch<React.SetStateAction<Blob | null>>;
  setReceivedFileName: React.Dispatch<React.SetStateAction<string | null>>;
  setAckProgress: React.Dispatch<React.SetStateAction<FileTransferAckProgress | null>>;
  config: FileTransferConfig;
  sendAckWithPeers: (transferId: string, progress: number, messageType?: number) => void;
  onIceStateChange?: (state: RTCIceConnectionState) => void;
}) {
  const {
    logger,
    progressManager,
    transferBuffersRef,
    transferInfoRef,
    transferTimeoutsRef,
    resetTimeout,
    setReceivedFile,
    setReceivedFileName,
    setAckProgress,
    config,
    sendAckWithPeers,
    onIceStateChange,
  } = params;

  const cleanupTransfer = (transferId: string) => {
    transferBuffersRef.current?.delete(transferId);
    transferInfoRef.current?.delete(transferId);

    const timeout = transferTimeoutsRef.current?.get(transferId);
    if (timeout) {
      clearTimeout(timeout);
      transferTimeoutsRef.current?.delete(transferId);
    }
  };


  const handleFileError = (transferId: string, error: string) => {
    logger.error(`Stream transfer error for ${transferId}: ${error}`);
    progressManager.errorTransfer(error);
    
    setAckProgress(prev => prev ? { ...prev, status: 'error' as const } : null);
    cleanupTransfer(transferId);
  };

  const handleFileStart = async (transferId: string, fileName: string, fileSize: number) => {
    try {
      console.log('[FileTransfer] handleFileStart called with:', { fileName, fileSize, transferId });
      logger.log('Starting stream-based file transfer:', { fileName, fileSize, transferId });
      
      try {
        progressManager.startTransfer(fileName, fileSize);
      } catch (error) {
        console.error('[FileTransfer] Error starting transfer progress:', error);
      }
    
      const transferBuffer = new Uint8Array(fileSize);
      transferBuffersRef.current?.set(transferId, transferBuffer);
      
      transferInfoRef.current?.set(transferId, {
        fileName,
        fileSize,
        bytesReceived: 0,
        startTime: Date.now()
      });
      
      const baseTimeoutMs = fileSize > FILE_SIZE_THRESHOLDS.SMALL ? TRANSFER_TIMEOUTS.LARGE : TRANSFER_TIMEOUTS.DEFAULT;
      const adaptiveTimeoutMs = calculateAdaptiveTimeout(fileSize, 0, Date.now(), baseTimeoutMs);
      
      resetTimeout(transferId, adaptiveTimeoutMs, () => {
        logger.error(`Transfer timeout for ${transferId} after ${adaptiveTimeoutMs}ms (adaptive, base: ${baseTimeoutMs}ms)`);
        handleFileError(transferId, `Transfer timeout after ${adaptiveTimeoutMs}ms - no progress detected`);
      });
      
      logger.log('Stream transfer initialized:', { 
        transferId, 
        fileSize,
        timeoutMs: adaptiveTimeoutMs,
        baseTimeoutMs,
        hasBuffer: transferBuffersRef.current?.has(transferId),
        hasInfo: transferInfoRef.current?.has(transferId)
      });
    } catch (error) {
      logger.error('Error in handleFileStart:', error);
      handleFileError(transferId, `Failed to start transfer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleFileData = async (transferId: string, data: Uint8Array, offset: number) => {
    try {
      const buffer = transferBuffersRef.current?.get(transferId);
      const transferInfo = transferInfoRef.current?.get(transferId);
      
      if (!buffer || !transferInfo) {
        logger.error(`No buffer or transfer info found for transfer ${transferId}`);
        return;
      }
    
      if (offset + data.length > buffer.length) {
        logger.error(`Data exceeds buffer bounds: offset ${offset}, dataSize ${data.length}, bufferSize ${buffer.length}`);
        handleFileError(transferId, 'Data exceeds expected file size');
        return;
      }
      
      buffer.set(data, offset);
      transferInfo.bytesReceived += data.length;
      
      if (progressManager?.updateBytesTransferred) {
        progressManager.updateBytesTransferred(data.length);
      }
      
      const { send, reason, currentPercentage } = shouldSendAckUtil(transferInfo);

      if (send && currentPercentage > (transferInfo.lastLoggedPercentage || 0)) {
        const now = Date.now();
        const lastAckTime = transferInfo.lastAckTime || transferInfo.startTime;
        const timeSinceLastAck = now - lastAckTime;
        
        if (timeSinceLastAck >= MIN_ACK_INTERVAL_MS || currentPercentage >= 100) {
          logger.log(`Progress milestone: ${currentPercentage}% (${transferInfo.bytesReceived}/${transferInfo.fileSize} bytes) - ${reason}`);
          transferInfo.lastLoggedPercentage = currentPercentage;
          transferInfo.lastAckTime = now;
          
          sendAckWithPeers(transferId, currentPercentage);
        }
      }
      
      const baseTimeoutMs = transferInfo.fileSize > FILE_SIZE_THRESHOLDS.SMALL ? TRANSFER_TIMEOUTS.LARGE : TRANSFER_TIMEOUTS.DEFAULT;
      const adaptiveTimeoutMs = calculateAdaptiveTimeout(
        transferInfo.fileSize,
        transferInfo.bytesReceived,
        transferInfo.startTime,
        baseTimeoutMs
      );
      
      resetTimeout(transferId, adaptiveTimeoutMs, () => {
        logger.error(`Transfer timeout for ${transferId} after ${adaptiveTimeoutMs}ms (adaptive, base: ${baseTimeoutMs}ms) - no progress`);
        handleFileError(transferId, `Transfer timeout after ${adaptiveTimeoutMs}ms - no progress detected`);
      });
    } catch (error) {
      logger.error('Error in handleFileData:', error);
      handleFileError(transferId, `Failed to process file data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleFileComplete = async (transferId: string, completionData?: { 
    totalBytes?: number; 
    checksum?: string; 
    transferTime?: number;
  }) => {
    try {
      logger.log('Completing stream-based file transfer:', transferId);
      
      const buffer = transferBuffersRef.current?.get(transferId);
      const transferInfo = transferInfoRef.current?.get(transferId);
      
      if (!buffer || !transferInfo) {
        logger.log(`Transfer ${transferId} already completed or not found - this is expected for duplicate completion calls`);
        return;
      }
    
      if (completionData?.totalBytes && transferInfo.bytesReceived !== completionData.totalBytes) {
        logger.warn(`Byte count mismatch: received ${transferInfo.bytesReceived}, expected ${completionData.totalBytes}`);
      }
      
      if (transferInfo.bytesReceived < transferInfo.fileSize) {
        logger.warn(`Incomplete transfer: received ${transferInfo.bytesReceived}/${transferInfo.fileSize} bytes`);
      }
      
      const blob = new Blob([buffer.slice(0, transferInfo.bytesReceived)]);
      setReceivedFile(blob);
      setReceivedFileName(transferInfo.fileName);
      
      if (config.onComplete) {
        config.onComplete(blob, transferInfo.fileName);
      }
      
      progressManager.completeTransfer();
      
      const transferTime = Date.now() - transferInfo.startTime;
      const transferRate = transferInfo.bytesReceived / (transferTime / 1000);
      logger.log('Transfer completed successfully:', {
        transferId,
        fileName: transferInfo.fileName,
        bytesReceived: transferInfo.bytesReceived,
        fileSize: transferInfo.fileSize,
        transferTime,
        transferRate: `${(transferRate / 1024 / 1024).toFixed(2)} MB/s`,
        completionData
      });
      
      cleanupTransfer(transferId);
    } catch (error) {
      logger.error('Error in handleFileComplete:', error);
      handleFileError(transferId, `Failed to complete transfer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleFileEnd = async (transferId: string) => {
    try {
      logger.log('Received FILE_END for transfer:', transferId);
      
      // Send FILE_END_ACK to confirm receipt
      sendAckWithPeers(transferId, 100, MESSAGE_TYPES.FILE_END_ACK);
      
      // Client side: Complete the transfer immediately
      if (config.role === 'client') {
        await handleFileComplete(transferId);
        logger.log('Sent FILE_END_ACK and completed transfer:', transferId);
      } else {
        logger.log('Sent FILE_END_ACK, waiting for completion confirmation:', transferId);
      }
    } catch (error) {
      logger.error('Error in handleFileEnd:', error);
      handleFileError(transferId, `Failed to handle file end: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleFileEndAck = async (transferId: string) => {
    try {
      logger.log('Received FILE_END_ACK for transfer:', transferId);
      
      // Host side: FILE_END_ACK confirms the client received the FILE_END
      // Now we can complete the transfer on the host side
      if (config.role === 'host') {
        await handleFileComplete(transferId);
        logger.log('Transfer completion confirmed and completed:', transferId);
      } else {
        logger.log('Transfer completion already handled by client:', transferId);
      }
    } catch (error) {
      logger.error('Error in handleFileEndAck:', error);
      handleFileError(transferId, `Failed to handle file end ack: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleIceStateChange = (state: RTCIceConnectionState) => {
    if (state === 'disconnected' || state === 'failed') {
      // Check if there are active transfers
      const activeTransfers = Array.from(transferInfoRef.current?.keys() || []);
      if (activeTransfers.length > 0) {
        logger.warn(`ICE connection ${state} during active transfers:`, activeTransfers);
        
        // For failed connections, error out active transfers
        if (state === 'failed') {
          activeTransfers.forEach(transferId => {
            handleFileError(transferId, `ICE connection failed during transfer`);
          });
        }
      }
    }
    
    onIceStateChange?.(state);
  };

  return {
    handleFileError,
    handleFileStart,
    handleFileData,
    handleFileComplete,
    handleFileEnd,
    handleFileEndAck,
    handleIceStateChange,
    MessageQueue
  };
}

