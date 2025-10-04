import type { FileTransferAckProgress } from '../types/fileTransfer';
import type { Logger } from '../types/logger';
import type { ProgressManager } from '../types/progressManager';
import type { FileTransferConfig } from '../types/fileTransferConfig';
import { FILE_SIZE_THRESHOLDS, TRANSFER_TIMEOUTS, MIN_ACK_INTERVAL_MS } from '../utils/fileTransferConstants';

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
  sendAckWithPeers: (transferId: string, progress: number) => void;
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

  const shouldSendAck = (
    transferInfo: {
      fileSize: number;
      bytesReceived: number;
      startTime: number;
      lastLoggedPercentage?: number;
      lastAckTime?: number;
    }
  ): { send: boolean; reason: string; currentPercentage: number } => {
    const currentPercentage = Math.round((transferInfo.bytesReceived / transferInfo.fileSize) * 100);
    let send = false;
    let reason = '';

    if (transferInfo.fileSize < FILE_SIZE_THRESHOLDS.SMALL) {
      send = currentPercentage > (transferInfo.lastLoggedPercentage || 0);
      reason = '1% interval (small file)';
    } else if (transferInfo.fileSize < FILE_SIZE_THRESHOLDS.MEDIUM) {
      send = currentPercentage > (transferInfo.lastLoggedPercentage || 0) &&
             currentPercentage % 2 === 0;
      reason = '2% interval (medium file)';
    } else {
      const lastAckTime = transferInfo.lastAckTime || transferInfo.startTime;
      const timeSinceLastAck = Date.now() - lastAckTime;
      const sendByTime = timeSinceLastAck >= 500;
      const sendByPercentage = currentPercentage > (transferInfo.lastLoggedPercentage || 0) &&
                               currentPercentage % 5 === 0;

      send = sendByTime || sendByPercentage;
      reason = sendByTime ? '500ms interval (large file)' : '5% interval (large file)';
    }

    if (currentPercentage >= 100 && (transferInfo.lastLoggedPercentage || 0) < 100) {
      send = true;
      reason = '100% completion';
    }

    return { send, reason, currentPercentage };
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
      
      const timeoutMs = fileSize > FILE_SIZE_THRESHOLDS.SMALL ? TRANSFER_TIMEOUTS.LARGE : TRANSFER_TIMEOUTS.DEFAULT;
      
      resetTimeout(transferId, timeoutMs, () => {
        logger.error(`Transfer timeout for ${transferId} after ${timeoutMs}ms`);
        handleFileError(transferId, `Transfer timeout after ${timeoutMs}ms - no progress detected`);
      });
      
      logger.log('Stream transfer initialized:', { 
        transferId, 
        fileSize,
        timeoutMs,
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
      
      const { send, reason, currentPercentage } = shouldSendAck(transferInfo);

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
      
      const timeoutMs = transferInfo.fileSize > FILE_SIZE_THRESHOLDS.SMALL ? TRANSFER_TIMEOUTS.LARGE : TRANSFER_TIMEOUTS.DEFAULT;
      resetTimeout(transferId, timeoutMs, () => {
        logger.error(`Transfer timeout for ${transferId} after ${timeoutMs}ms - no progress`);
        handleFileError(transferId, `Transfer timeout after ${timeoutMs}ms - no progress detected`);
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
        logger.error(`No buffer or transfer info found for transfer ${transferId}`);
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

  return {
    handleFileError,
    handleFileStart,
    handleFileData,
    handleFileComplete
  };
}
