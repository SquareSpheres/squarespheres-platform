'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { useWebRTCHostPeer } from './useWebRTCHostPeer';
import { useWebRTCClientPeer } from './useWebRTCClientPeer';
import { useTransferProgress } from './useTransferProgress';
// Removed complex message handler - using simple direct message handling
import { WebRTCPeerConfig } from './webrtcTypes';
import { 
  getOptimalChunkSize, 
  isMobileDevice, 
  createLogger
} from './fileTransferUtils';
import {
  BACKPRESSURE_THRESHOLDS,
  TRANSFER_TIMEOUTS,
  MIN_ACK_INTERVAL_MS,
  YIELD_CHUNK_INTERVAL,
  MAX_BUFFER_SIZES,
  FILE_SIZE_THRESHOLDS,
  PROGRESS_MILESTONES,
} from '../utils/fileTransferConstants';
import { MESSAGE_TYPES } from '../constants/messageTypes';
import { encodeMessage, decodeMessage } from '../utils/binaryMessageCodec';
import {
  ClientConnection,
  WebRTCPeer,
  WebRTCHostPeer,
  WebRTCClientPeer,
  FileTransferProgress,
  FileTransferAckProgress,
  FileTransferApi
} from '../types/fileTransfer';
import { useBackpressureManager } from './useBackpressureManager';

// Type definitions now imported from types file

// Public API interface now imported from types file

export function useFileTransfer(config: WebRTCPeerConfig & { 
  debug?: boolean;
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;
}): FileTransferApi {
  const logger = createLogger(config.role, config.debug);
  
  // Stream-based in-memory storage
  const [receivedFile, setReceivedFile] = useState<Blob | null>(null);
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null);
  
  // Stream transfer state
  const transferBuffersRef = useRef<Map<string, Uint8Array>>(new Map());
  const transferInfoRef = useRef<Map<string, { 
    fileName: string; 
    fileSize: number; 
    bytesReceived: number;
    startTime: number;
    lastLoggedPercentage?: number;
    lastAckTime?: number;
  }>>(new Map());
  
  // Transfer timeout tracking
  const transferTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // ACK progress tracking (separate from regular progress)
  const [ackProgress, setAckProgress] = useState<FileTransferAckProgress | null>(null);
  
  // Fixed chunk size
  const CHUNK_SIZE = getOptimalChunkSize();
  
  // Helper function for timeout management
  const resetTimeout = useCallback((transferId: string, ms: number, callback: () => void) => {
    const existing = transferTimeoutsRef.current.get(transferId);
    if (existing) clearTimeout(existing);
    const timeout = setTimeout(callback, ms);
    transferTimeoutsRef.current.set(transferId, timeout);
  }, []);

  
  // Progress management - use stable manager pattern
  const {
    transferProgress,
    isTransferring,
    progressManager,
    startTransfer,
    updateBytesTransferred,
    completeTransfer,
    errorTransfer,
    clearTransfer: clearProgressTransfer
  } = useTransferProgress({
    onProgress: config.onProgress,
    onComplete: (file?: Blob, fileName?: string) => {
      if (config.onComplete) {
        config.onComplete(file || null, fileName || null);
      }
    },
    onError: config.onError
  });

  // File error handler (declared early to avoid hoisting issues)
  const handleFileError = useCallback((transferId: string, error: string) => {
    logger.error(`Stream transfer error for ${transferId}: ${error}`);
    progressManager.errorTransfer(error);
    
    // Update ACK progress to error state
    setAckProgress(prev => prev ? { ...prev, status: 'error' as const } : null);
    
    // Cleanup
    transferBuffersRef.current.delete(transferId);
    transferInfoRef.current.delete(transferId);
    
    // Clear timeout
    const timeout = transferTimeoutsRef.current.get(transferId);
    if (timeout) {
      clearTimeout(timeout);
      transferTimeoutsRef.current.delete(transferId);
    }
  }, [logger, progressManager, resetTimeout]);

  // Send ACK helper function (will be updated with peers later)
  const sendAck = useCallback((transferId: string, progress: number) => {
    const ackMessage = JSON.stringify({
      type: MESSAGE_TYPES.FILE_ACK,
      transferId,
      progress
    });
    
    logger.log(`Sent ACK for transfer ${transferId}: ${progress}%`);
  }, [logger]);

  // Placeholder for sendAckWithPeers - will be defined after peers are available
  let sendAckWithPeers = sendAck;
  
  // Progress manager initialized

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
  }, [logger, progressManager, resetTimeout, handleFileError]);

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
  }, [logger, progressManager, resetTimeout, sendAckWithPeers, handleFileError]);

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
    transferBuffersRef.current.delete(transferId);
    transferInfoRef.current.delete(transferId);
    
      // Clear timeout
      const timeout = transferTimeoutsRef.current.get(transferId);
      if (timeout) {
        clearTimeout(timeout);
        transferTimeoutsRef.current.delete(transferId);
      }
    } catch (error) {
      logger.error('Error in handleFileComplete:', error);
      handleFileError(transferId, `Failed to complete transfer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [logger, progressManager, config, resetTimeout, handleFileError]);

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
  }, [logger]);


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

  // WebRTC peers
  const hostPeer = useWebRTCHostPeer({
    ...config,
    onChannelMessage: handleMessage
  });
  
  const clientPeer = useWebRTCClientPeer({
    ...config,
    onChannelMessage: handleMessage
  });

  const activePeer = config.role === 'host' ? hostPeer : clientPeer;

  // Update sendAckWithPeers to use the actual peers
  sendAckWithPeers = useCallback((transferId: string, progress: number) => {
    const ackMessage = JSON.stringify({
      type: MESSAGE_TYPES.FILE_ACK,
      transferId,
      progress
    });
    
    if (config.role === 'host') {
      hostPeer.send(ackMessage);
    } else if (config.role === 'client') {
      clientPeer.send(ackMessage);
    }
    
    logger.log(`Sent ACK for transfer ${transferId}: ${progress}%`);
  }, [config.role, hostPeer, clientPeer, logger]);


  // Backpressure management handled by dedicated hook
  const { waitForBackpressure } = useBackpressureManager(config, logger, hostPeer);


  // Send file (host only) - stream-based
  const sendFile = useCallback(async (file: File, clientId?: string) => {
    if (config.role !== 'host') {
      throw new Error('sendFile can only be called on host');
    }

    const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    logger.log('Starting stream-based file transfer:', {
      fileName: file.name,
      fileSize: file.size,
      transferId,
      clientId: clientId || 'all clients'
    });
    
    // Start transfer progress tracking
    progressManager.startTransfer(file.name, file.size);
    
    // Initialize ACK progress for host
    if (config.role === 'host') {
      setAckProgress({
        fileName: file.name,
        fileSize: file.size,
        bytesAcknowledged: 0,
        percentage: 0,
        status: 'waiting'
      });
    }

    try {
      // Send file start message
      const startMessage = JSON.stringify({
        type: MESSAGE_TYPES.FILE_START,
        transferId,
        fileName: file.name,
        fileSize: file.size
      });
      
      if (clientId) {
        hostPeer.send(startMessage, clientId);
      } else {
        hostPeer.send(startMessage);
      }

      // Stream file data in chunks
      let bytesTransferred = 0;
      
      while (bytesTransferred < file.size) {
        const start = bytesTransferred;
        const end = Math.min(start + CHUNK_SIZE, file.size);
          
        const fileSlice = file.slice(start, end);
        const chunkArrayBuffer = await fileSlice.arrayBuffer();
        const chunkData = new Uint8Array(chunkArrayBuffer);
        
        // Create stream data message: [4 bytes: type][4 bytes: transferId length][4 bytes: offset][transferId][data]
        const transferIdBytes = new TextEncoder().encode(transferId);
        const buffer = new ArrayBuffer(12 + transferIdBytes.length + chunkData.length);
        const view = new DataView(buffer);
        
        view.setUint32(0, MESSAGE_TYPES.FILE_DATA, true);
        view.setUint32(4, transferIdBytes.length, true);
        view.setUint32(8, start, true); // offset
        
        new Uint8Array(buffer, 12).set(transferIdBytes);
        new Uint8Array(buffer, 12 + transferIdBytes.length).set(chunkData);

        if (clientId) {
          hostPeer.send(buffer, clientId);
        } else {
          hostPeer.send(buffer);
        }

        // Update progress for this chunk
        if (progressManager?.updateBytesTransferred) {
          progressManager.updateBytesTransferred(chunkData.length);
        }
        bytesTransferred += chunkData.length;
        
        // Log milestone progress updates (10%, 30%, 50%, 70%, 90%, 100%)
        const currentPercentage = Math.round((bytesTransferred / file.size) * 100);
        const lastLoggedPercentage = (file as any).lastLoggedPercentage || 0;
        
        if (PROGRESS_MILESTONES.includes(currentPercentage as any) && currentPercentage > lastLoggedPercentage) {
          logger.log(`Host progress milestone: ${currentPercentage}% (${bytesTransferred}/${file.size} bytes)`);
          (file as any).lastLoggedPercentage = currentPercentage;
        }

        await waitForBackpressure(clientId || 'default');
        
        // Yield to UI every 10 chunks to prevent blocking
        if (bytesTransferred % (CHUNK_SIZE * YIELD_CHUNK_INTERVAL) === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
        
      // Send explicit completion message
      const transferTime = Date.now() - startTime;
      const completionMessage = JSON.stringify({
        type: MESSAGE_TYPES.FILE_COMPLETE,
        transferId,
        totalBytes: bytesTransferred,
        transferTime,
        checksum: undefined // Can be added later for integrity verification
      });
      
      if (clientId) {
        hostPeer.send(completionMessage, clientId);
      } else {
        hostPeer.send(completionMessage);
      }
      
      logger.log('Stream file transfer completed successfully:', {
        transferId,
        bytesTransferred,
        transferTime,
        transferRate: `${(bytesTransferred / (transferTime / 1000) / 1024 / 1024).toFixed(2)} MB/s`
      });
      
      progressManager.completeTransfer();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Stream file transfer failed:', error);
      
      const errorMessage_str = JSON.stringify({
        type: MESSAGE_TYPES.FILE_ERROR,
        transferId,
        error: errorMessage
      });
      
      if (clientId) {
        hostPeer.send(errorMessage_str, clientId);
      } else {
        hostPeer.send(errorMessage_str);
      }
      
      progressManager.errorTransfer(errorMessage);
    }
  }, [config.role, logger, progressManager, hostPeer, waitForBackpressure, CHUNK_SIZE]);
  
  // Cancel transfer
  const cancelTransfer = useCallback((transferId?: string) => {
    logger.log('Cancelling transfer:', transferId || 'current');
    
    if (config.role === 'host') {
      const cancelData = JSON.stringify({
        transferId: transferId || 'current',
        error: 'Transfer cancelled by host'
      });
      const cancelMessage = encodeMessage(MESSAGE_TYPES.FILE_ERROR, cancelData);
      
      hostPeer.send(cancelMessage);
    }
    
    progressManager.errorTransfer('Transfer cancelled');
  }, [config.role, logger, hostPeer, progressManager]);
  
  // Clear transfer state
  const clearTransfer = useCallback(() => {
    logger.log('Clearing stream transfer state');
    
    // Clear all timeouts
    transferTimeoutsRef.current.forEach((timeout) => {
      clearTimeout(timeout);
    });
    transferTimeoutsRef.current.clear();
    
    setReceivedFile(null);
    setReceivedFileName(null);
    transferBuffersRef.current.clear();
    transferInfoRef.current.clear();
    setAckProgress(null);
    progressManager.clearTransfer();
  }, [logger, progressManager]);
  
  // Return file transfer API

  return {
    // Transfer operations
    sendFile,
    cancelTransfer,
    clearTransfer,
    
    // Transfer state
    transferProgress: transferProgress,
    ackProgress: ackProgress,
    isTransferring: isTransferring,
    receivedFile,
    receivedFileName,
    
    // Fixed chunk size
    getCurrentChunkSize: () => CHUNK_SIZE,
    
    // WebRTC connection
    connectionState: activePeer.connectionState,
    dataChannelState: activePeer.dataChannelState,
    createOrEnsureConnection: activePeer.createOrEnsureConnection,
    close: activePeer.close,
    disconnect: activePeer.disconnect,
    role: activePeer.role,
    peerId: activePeer.peerId,
    connectedClients: 'connectedClients' in activePeer ? activePeer.connectedClients : undefined,
    clientConnections: 'clientConnections' in activePeer ? activePeer.clientConnections : undefined,
    
    // Callbacks
    onProgress: config.onProgress,
    onComplete: config.onComplete,
    onError: config.onError,
  };
}
