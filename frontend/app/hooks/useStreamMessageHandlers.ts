// src/hooks/useStreamMessageHandlers.ts

import { useCallback } from 'react';
import { MESSAGE_TYPES } from '../constants/messageTypes';
import { TRANSFER_TIMEOUTS, FILE_SIZE_THRESHOLDS, MIN_ACK_INTERVAL_MS } from '../utils/fileTransferConstants';
import type {
  FileTransferProgress,
  FileTransferAckProgress,
} from '../types/fileTransfer';
import type { Logger } from '../types/logger';
import type { ProgressManager } from '../types/progressManager';
import type { FileTransferConfig } from '../types/fileTransferConfig';

/**
 * Hook providing file transfer message handlers for both sender and receiver roles.
 * Handles stream-based file transfers with transfer IDs and proper buffering.
 */
export function useStreamMessageHandlers({
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
}: {
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

  // Cleanup helper for a transfer
  const cleanupTransfer = useCallback((transferId: string) => {
    transferBuffersRef.current.delete(transferId);
    transferInfoRef.current.delete(transferId);

    const timeout = transferTimeoutsRef.current.get(transferId);
    if (timeout) {
      clearTimeout(timeout);
      transferTimeoutsRef.current.delete(transferId);
    }
  }, [transferBuffersRef, transferInfoRef, transferTimeoutsRef]);

  // File error handler
  const handleFileError = useCallback((transferId: string, error: string) => {
    logger.error(`Stream transfer error for ${transferId}: ${error}`);
    progressManager.errorTransfer(error);
    
    // Update ACK progress to error state
    setAckProgress(prev => prev ? { ...prev, status: 'error' as const } : null);
    
    // Cleanup
    cleanupTransfer(transferId);
  }, [logger, progressManager, setAckProgress, cleanupTransfer]);

  // File start handler - stream-based
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
    transferBuffersRef.current.set(transferId, transferBuffer);
    
    // Initialize transfer info
    transferInfoRef.current.set(transferId, {
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
      hasBuffer: transferBuffersRef.current.has(transferId),
      hasInfo: transferInfoRef.current.has(transferId)
    });
    } catch (error) {
      logger.error('Error in handleFileStart:', error);
      handleFileError(transferId, `Failed to start transfer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [logger, progressManager, resetTimeout, handleFileError, transferBuffersRef, transferInfoRef]);

  // File data handler - stream-based
  const handleFileData = useCallback(async (transferId: string, data: Uint8Array, offset: number) => {
    try {
      // Process stream data (logging removed to reduce spam)
      
      const buffer = transferBuffersRef.current.get(transferId);
      const transferInfo = transferInfoRef.current.get(transferId);
      
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
    const currentPercentage = Math.round((transferInfo.bytesReceived / transferInfo.fileSize) * 100);
    const elapsedMs = Date.now() - transferInfo.startTime;
    const transferRate = transferInfo.bytesReceived / (elapsedMs / 1000); // bytes per second
    
    // Determine ACK frequency based on file size and transfer speed
    let shouldSendAck = false;
    let ackReason = '';
    
    if (transferInfo.fileSize < FILE_SIZE_THRESHOLDS.SMALL) {
      // Small files (< 10MB): Every 1% for smooth progress
      shouldSendAck = currentPercentage > (transferInfo.lastLoggedPercentage || 0);
      ackReason = '1% interval (small file)';
    } else if (transferInfo.fileSize < FILE_SIZE_THRESHOLDS.MEDIUM) {
      // Medium files (10-100MB): Every 2% for balanced updates
      shouldSendAck = currentPercentage > (transferInfo.lastLoggedPercentage || 0) && 
                     (currentPercentage % 2 === 0);
      ackReason = '2% interval (medium file)';
    } else {
      // Large files (> 100MB): Time-based (500ms) or 5% intervals for efficiency
      const lastAckTime = transferInfo.lastAckTime || transferInfo.startTime;
      const timeSinceLastAck = Date.now() - lastAckTime;
      const shouldSendByTime = timeSinceLastAck >= 500; // 500ms minimum
      const shouldSendByPercentage = currentPercentage > (transferInfo.lastLoggedPercentage || 0) && 
                                   (currentPercentage % 5 === 0); // Every 5%
      
      shouldSendAck = shouldSendByTime || shouldSendByPercentage;
      ackReason = shouldSendByTime ? '500ms interval (large file)' : '5% interval (large file)';
    }
    
    // Always send ACK at 100% completion
    if (currentPercentage >= 100 && (transferInfo.lastLoggedPercentage || 0) < 100) {
      shouldSendAck = true;
      ackReason = '100% completion';
    }
    
    if (shouldSendAck && currentPercentage > (transferInfo.lastLoggedPercentage || 0)) {
      // Throttle ACKs with minimum interval (200ms) to prevent network spam
      const now = Date.now();
      const lastAckTime = transferInfo.lastAckTime || transferInfo.startTime;
      const timeSinceLastAck = now - lastAckTime;
      
      if (timeSinceLastAck >= MIN_ACK_INTERVAL_MS || currentPercentage >= 100) {
        logger.log(`Progress milestone: ${currentPercentage}% (${transferInfo.bytesReceived}/${transferInfo.fileSize} bytes) - ${ackReason}`);
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
  }, [logger, progressManager, resetTimeout, sendAckWithPeers, handleFileError, transferBuffersRef, transferInfoRef]);

  // File complete handler - explicit completion strategy
  const handleFileComplete = useCallback(async (transferId: string, completionData?: { 
    totalBytes?: number; 
    checksum?: string; 
    transferTime?: number;
  }) => {
    try {
      logger.log('Completing stream-based file transfer:', transferId);
      
      const buffer = transferBuffersRef.current.get(transferId);
      const transferInfo = transferInfoRef.current.get(transferId);
      
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

  // File ACK handler - updates ACK progress for host
  const handleFileAck = useCallback((transferId: string, progress: number) => {
    logger.log(`Received ACK for transfer ${transferId}: ${progress}%`);
    
    // Update ACK progress state
    setAckProgress(prev => {
      if (!prev) {
        // Initialize ACK progress if not set
        const transferInfo = transferInfoRef.current.get(transferId);
        if (transferInfo) {
          return {
            fileName: transferInfo.fileName,
            fileSize: transferInfo.fileSize,
            bytesAcknowledged: Math.round((progress / 100) * transferInfo.fileSize),
            percentage: progress,
            status: 'acknowledging' as const
          };
        }
        return prev;
      }
      
      // Update existing ACK progress
      const bytesAcknowledged = Math.round((progress / 100) * prev.fileSize);
      return {
        ...prev,
        bytesAcknowledged,
        percentage: progress,
        status: progress >= 100 ? 'completed' as const : 'acknowledging' as const
      };
    });
  }, [logger, transferInfoRef, setAckProgress]);

  // Stream-based message handler - WebRTC guarantees delivery and ordering
  const handleMessage = useCallback(async (data: string | ArrayBuffer | Blob) => {
    if (typeof data === 'string') {
      // Handle string messages (control messages)
      try {
        const message = JSON.parse(data);
        
        switch (message.type) {
          case MESSAGE_TYPES.FILE_START:
            await handleFileStart(message.transferId, message.fileName, message.fileSize);
            break;
          case MESSAGE_TYPES.FILE_COMPLETE:
            await handleFileComplete(message.transferId, {
              totalBytes: message.totalBytes,
              checksum: message.checksum,
              transferTime: message.transferTime
            });
            break;
          case MESSAGE_TYPES.FILE_ERROR:
            handleFileError(message.transferId, message.error);
            break;
          case MESSAGE_TYPES.FILE_ACK:
            handleFileAck(message.transferId, message.progress);
            break;
          default:
            logger.warn('Unknown string message type:', message.type);
        }
      } catch (error) {
        logger.error('Failed to parse string message:', error);
      }
    } else if (data instanceof ArrayBuffer) {
      // Handle binary data messages
      if (data.byteLength < 4) {
        logger.error('Binary data message too short');
        return;
      }
      
      const view = new DataView(data);
      const type = view.getUint32(0, true);
      
      if (type === MESSAGE_TYPES.FILE_DATA) {
        // Stream data message format: [4 bytes: type][4 bytes: transferId length][4 bytes: offset][transferId][data]
        if (data.byteLength < 12) {
          logger.error('File data message too short');
          return;
        }
        
        const transferIdLength = view.getUint32(4, true);
        const offset = view.getUint32(8, true);
        
        if (data.byteLength < 12 + transferIdLength) {
          logger.error('File data message invalid length');
          return;
        }
        
        const transferIdBytes = new Uint8Array(data, 12, transferIdLength);
        const transferId = new TextDecoder().decode(transferIdBytes);
        const fileData = new Uint8Array(data, 12 + transferIdLength);
        
        await handleFileData(transferId, fileData, offset);
      } else {
        logger.warn('Unknown binary message type:', type);
      }
    } else if (data instanceof Blob) {
      // Convert blob to array buffer and handle
      try {
        const arrayBuffer = await data.arrayBuffer();
        await handleMessage(arrayBuffer);
      } catch (error) {
        logger.error('Failed to convert blob to array buffer:', error);
      }
    }
  }, [handleFileStart, handleFileData, handleFileComplete, handleFileError, handleFileAck, logger]);

  return {
    handleMessage,
    handleFileStart,
    handleFileData,
    handleFileComplete,
    handleFileAck,
    handleFileError,
  };
}
