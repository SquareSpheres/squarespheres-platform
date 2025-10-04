import { useCallback } from 'react';
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

  // Cleanup helper for a transfer
  const cleanupTransfer = useCallback((transferId: string) => {
    transferBuffersRef.current?.delete(transferId);
    transferInfoRef.current?.delete(transferId);

    const timeout = transferTimeoutsRef.current?.get(transferId);
    if (timeout) {
      clearTimeout(timeout);
      transferTimeoutsRef.current?.delete(transferId);
    }
  }, [transferBuffersRef, transferInfoRef, transferTimeoutsRef]);

  /**
   * Determines if an ACK should be sent based on transfer info
   */
  const shouldSendAck = useCallback((
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
  }, []);

  const handleFileError = useCallback((transferId: string, error: string) => {
    logger.error(`Stream transfer error for ${transferId}: ${error}`);
    progressManager.errorTransfer(error);
    
    // Update ACK progress to error state
    setAckProgress(prev => prev ? { ...prev, status: 'error' as const } : null);
    
    // Cleanup
    cleanupTransfer(transferId);
  }, [logger, progressManager, setAckProgress, cleanupTransfer]);

  const handleFileStart = useCallback(async (transferId: string, fileName: string, fileSize: number) => {
    try {
      console.log('[FileTransfer] handleFileStart called with:', { fileName, fileSize, transferId });
      logger.log('Starting stream-based file transfer:', { fileName, fileSize, transferId });
      
      // Start progress tracking
      try {
        progressManager.startTransfer(fileName, fileSize);
      } catch (error) {
        console.error('[FileTransfer] Error starting transfer progress:', error);
      }
    
      // Initialize stream buffer
      const transferBuffer = new Uint8Array(fileSize);
      transferBuffersRef.current?.set(transferId, transferBuffer);
      
      // Initialize transfer info
      transferInfoRef.current?.set(transferId, {
        fileName,
        fileSize,
        bytesReceived: 0,
        startTime: Date.now()
      });
      
      // Set up transfer timeout (30 seconds for large files, 10 seconds for small files)
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
  }, [logger, progressManager, resetTimeout, handleFileError, transferBuffersRef, transferInfoRef]);

  const handleFileData = useCallback(async (transferId: string, data: Uint8Array, offset: number) => {
    try {
      // Process stream data (logging removed to reduce spam)
      
      const buffer = transferBuffersRef.current?.get(transferId);
      const transferInfo = transferInfoRef.current?.get(transferId);
      
      if (!buffer || !transferInfo) {
        logger.error(`No buffer or transfer info found for transfer ${transferId}`);
        return;
      }
    
      // Validate bounds
      if (offset + data.length > buffer.length) {
        logger.error(`Data exceeds buffer bounds: offset ${offset}, dataSize ${data.length}, bufferSize ${buffer.length}`);
        handleFileError(transferId, 'Data exceeds expected file size');
        return;
      }
      
      // Write data to buffer at specified offset
      buffer.set(data, offset);
      transferInfo.bytesReceived += data.length;
      
      // Update progress
      if (progressManager?.updateBytesTransferred) {
        progressManager.updateBytesTransferred(data.length);
      }
      
      // Smart ACK frequency based on file size and transfer speed
      const { send, reason, currentPercentage } = shouldSendAck(transferInfo);

      if (send && currentPercentage > (transferInfo.lastLoggedPercentage || 0)) {
        // Throttle ACKs with minimum interval (200ms) to prevent network spam
        const now = Date.now();
        const lastAckTime = transferInfo.lastAckTime || transferInfo.startTime;
        const timeSinceLastAck = now - lastAckTime;
        
        if (timeSinceLastAck >= MIN_ACK_INTERVAL_MS || currentPercentage >= 100) {
          logger.log(`Progress milestone: ${currentPercentage}% (${transferInfo.bytesReceived}/${transferInfo.fileSize} bytes) - ${reason}`);
          transferInfo.lastLoggedPercentage = currentPercentage;
          transferInfo.lastAckTime = now;
          
          // Send ACK to host for progress tracking
          sendAckWithPeers(transferId, currentPercentage);
        }
      }
      
      // Reset timeout on data progress
      const timeoutMs = transferInfo.fileSize > FILE_SIZE_THRESHOLDS.SMALL ? TRANSFER_TIMEOUTS.LARGE : TRANSFER_TIMEOUTS.DEFAULT;
      resetTimeout(transferId, timeoutMs, () => {
        logger.error(`Transfer timeout for ${transferId} after ${timeoutMs}ms - no progress`);
        handleFileError(transferId, `Transfer timeout after ${timeoutMs}ms - no progress detected`);
      });
      
      // Only log detailed data storage for debugging if needed
      // logger.log(`Stored stream data for transfer ${transferId}`, { dataSize: data.length, offset });
    } catch (error) {
      logger.error('Error in handleFileData:', error);
      handleFileError(transferId, `Failed to process file data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [logger, progressManager, resetTimeout, sendAckWithPeers, handleFileError, transferBuffersRef, transferInfoRef, shouldSendAck]);

  const handleFileComplete = useCallback(async (transferId: string, completionData?: { 
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
    
      // Validate completion
      if (completionData?.totalBytes && transferInfo.bytesReceived !== completionData.totalBytes) {
        logger.warn(`Byte count mismatch: received ${transferInfo.bytesReceived}, expected ${completionData.totalBytes}`);
      }
      
      // Check if we have all expected data
      if (transferInfo.bytesReceived < transferInfo.fileSize) {
        logger.warn(`Incomplete transfer: received ${transferInfo.bytesReceived}/${transferInfo.fileSize} bytes`);
        // Still proceed - might be compression or other valid reasons
      }
      
      // Create blob from buffer and set received file info
      const blob = new Blob([buffer.slice(0, transferInfo.bytesReceived)]);
      setReceivedFile(blob);
      setReceivedFileName(transferInfo.fileName);
      
      // Call completion callback
      if (config.onComplete) {
        config.onComplete(blob, transferInfo.fileName);
      }
      
      progressManager.completeTransfer();
      
      // Log transfer statistics
      const transferTime = Date.now() - transferInfo.startTime;
      const transferRate = transferInfo.bytesReceived / (transferTime / 1000); // bytes per second
      logger.log('Transfer completed successfully:', {
        transferId,
        fileName: transferInfo.fileName,
        bytesReceived: transferInfo.bytesReceived,
        fileSize: transferInfo.fileSize,
        transferTime,
        transferRate: `${(transferRate / 1024 / 1024).toFixed(2)} MB/s`,
        completionData
      });
      
      // Cleanup
      cleanupTransfer(transferId);
    } catch (error) {
      logger.error('Error in handleFileComplete:', error);
      handleFileError(transferId, `Failed to complete transfer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [logger, progressManager, config, handleFileError, cleanupTransfer, setReceivedFile, setReceivedFileName]);

  return {
    handleFileError,
    handleFileStart,
    handleFileData,
    handleFileComplete
  };
}
