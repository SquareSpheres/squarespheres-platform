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

// Stream-based binary message format - optimized for reliability
const MESSAGE_TYPES = {
  FILE_START: 1,        // File metadata
  FILE_DATA: 2,         // Raw file data (stream)
  FILE_COMPLETE: 3,     // Explicit completion signal
  FILE_ERROR: 4         // Error signal
} as const;

// Simple binary encoder - just type + data
function encodeMessage(type: number, data: string): ArrayBuffer {
  const dataBytes = new TextEncoder().encode(data);
  const buffer = new ArrayBuffer(4 + dataBytes.length);
  const view = new DataView(buffer);
  
  view.setUint32(0, type, true); // Message type (4 bytes)
  new Uint8Array(buffer, 4).set(dataBytes); // Data
  
  return buffer;
}

// Simple binary decoder
function decodeMessage(buffer: ArrayBuffer): { type: number; data: string } | null {
  if (buffer.byteLength < 4) return null;
  
  const view = new DataView(buffer);
  const type = view.getUint32(0, true);
  const dataBytes = new Uint8Array(buffer, 4);
  const data = new TextDecoder().decode(dataBytes);
  
  return { type, data };
}

export interface FileTransferProgress {
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  percentage: number;
  status: 'transferring' | 'completed' | 'error';
  startTime?: number;
  error?: string;
}

export interface FileTransferApi {
  // Host methods
  sendFile: (file: File, clientId?: string) => Promise<void>;
  cancelTransfer: (transferId?: string) => void;

  // Client methods
  receivedFile: Blob | null;
  receivedFileName: string | null;

  // Common
  transferProgress: FileTransferProgress | null;
  isTransferring: boolean;
  clearTransfer: () => void;

  // Progress callbacks
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;

  // WebRTC connection methods
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  disconnect: () => void;
  role: 'host' | 'client';
  peerId?: string;
  connectedClients?: string[];
  clientConnections?: Map<string, { connectionState: RTCPeerConnectionState; dataChannelState: RTCDataChannelState | undefined }>;

  // Fixed chunk size
  getCurrentChunkSize: () => number;
}

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
  }>>(new Map());
  
  // Transfer timeout tracking
  const transferTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Fixed chunk size
  const CHUNK_SIZE = getOptimalChunkSize();
  
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
  
  // Progress manager initialized

  // File start handler - stream-based
  const handleFileStart = useCallback(async (transferId: string, fileName: string, fileSize: number) => {
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
    const timeoutMs = fileSize > 10 * 1024 * 1024 ? 30000 : 10000;
    const timeout = setTimeout(() => {
      logger.error(`Transfer timeout for ${transferId} after ${timeoutMs}ms`);
      handleFileError(transferId, `Transfer timeout after ${timeoutMs}ms - no progress detected`);
    }, timeoutMs);
    transferTimeoutsRef.current.set(transferId, timeout);
    
    logger.log('Stream transfer initialized:', { 
      transferId, 
      fileSize,
      timeoutMs,
      hasBuffer: transferBuffersRef.current.has(transferId),
      hasInfo: transferInfoRef.current.has(transferId)
    });
  }, [logger, progressManager]);

  // File data handler - stream-based
  const handleFileData = useCallback(async (transferId: string, data: Uint8Array, offset: number) => {
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
    
    // Log milestone progress updates (10%, 30%, 50%, 70%, 90%, 100%)
    const currentPercentage = Math.round((transferInfo.bytesReceived / transferInfo.fileSize) * 100);
    const milestones = [10, 30, 50, 70, 90, 100];
    const lastLoggedPercentage = transferInfo.lastLoggedPercentage || 0;
    
    if (milestones.includes(currentPercentage) && currentPercentage > lastLoggedPercentage) {
      logger.log(`Progress milestone: ${currentPercentage}% (${transferInfo.bytesReceived}/${transferInfo.fileSize} bytes)`);
      transferInfo.lastLoggedPercentage = currentPercentage;
    }
    
    // Reset timeout on data progress
    const existingTimeout = transferTimeoutsRef.current.get(transferId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      // Reset timeout for continued progress
      const timeoutMs = transferInfo.fileSize > 10 * 1024 * 1024 ? 30000 : 10000;
      const newTimeout = setTimeout(() => {
        logger.error(`Transfer timeout for ${transferId} after ${timeoutMs}ms - no progress`);
        handleFileError(transferId, `Transfer timeout after ${timeoutMs}ms - no progress detected`);
      }, timeoutMs);
      transferTimeoutsRef.current.set(transferId, newTimeout);
    }
    
    // Only log detailed data storage for debugging if needed
    // logger.log(`Stored stream data for transfer ${transferId}`, { dataSize: data.length, offset });
  }, [logger, progressManager]);

  // File complete handler - explicit completion strategy
  const handleFileComplete = useCallback(async (transferId: string, completionData?: { 
    totalBytes?: number; 
    checksum?: string; 
    transferTime?: number;
  }) => {
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
  }, [logger, progressManager, config]);

  // File error handler
  const handleFileError = useCallback((transferId: string, error: string) => {
    logger.error(`Stream transfer error for ${transferId}: ${error}`);
    progressManager.errorTransfer(error);
    
    // Cleanup
    transferBuffersRef.current.delete(transferId);
    transferInfoRef.current.delete(transferId);
    
    // Clear timeout
    const timeout = transferTimeoutsRef.current.get(transferId);
    if (timeout) {
      clearTimeout(timeout);
      transferTimeoutsRef.current.delete(transferId);
    }
  }, [logger, progressManager]);

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
  }, [handleFileStart, handleFileData, handleFileComplete, handleFileError, logger]);

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

  // Event-driven backpressure handling
  const backpressurePromises = useRef<Map<string, { resolve: () => void; reject: () => void }>>(new Map());
  
  const setupBackpressureHandling = useCallback((dataChannel: RTCDataChannel, clientId: string) => {
    // Set threshold based on device type
    const threshold = isMobileDevice() ? 64 * 1024 : 128 * 1024; // 64KB mobile, 128KB desktop
    dataChannel.bufferedAmountLowThreshold = threshold;
    
    // Remove existing listener if any
    dataChannel.removeEventListener('bufferedamountlow', () => {});
    
    // Add event-driven backpressure handler
    const handleBufferLow = () => {
      const promiseKey = clientId;
      const promise = backpressurePromises.current.get(promiseKey);
      if (promise) {
        promise.resolve();
        backpressurePromises.current.delete(promiseKey);
        logger.log(`Buffer drained for client ${clientId}, resuming transfer`);
      }
    };
    
    dataChannel.addEventListener('bufferedamountlow', handleBufferLow);
    
    // Return cleanup function
    return () => {
      dataChannel.removeEventListener('bufferedamountlow', handleBufferLow);
    };
  }, [logger]);
  
  const waitForBackpressure = useCallback(async (clientId: string): Promise<void> => {
    if (config.role !== 'host') return;
    
    let dataChannel: RTCDataChannel | null = null;
    
    if (clientId) {
      const clientConn = (hostPeer as any).clientConnectionsRef?.current?.get(clientId);
      dataChannel = clientConn?.dc;
    } else {
      const clientConnections = (hostPeer as any).clientConnectionsRef?.current;
      if (clientConnections) {
        for (const [, conn] of clientConnections) {
          if (conn.dc && conn.dc.readyState === 'open') {
            dataChannel = conn.dc;
            break;
          }
        }
      }
    }
    
    if (!dataChannel) {
      await new Promise(resolve => setTimeout(resolve, 1));
      return;
    }
    
    const MAX_BUFFER_SIZE = isMobileDevice() ? 512 * 1024 : 1024 * 1024; // 512KB mobile, 1MB desktop
    
    // If buffer is not full, continue immediately
    if (dataChannel.bufferedAmount < MAX_BUFFER_SIZE) {
      return;
    }
    
    // Buffer is full, wait for bufferedamountlow event
    logger.log(`Buffer full (${Math.round(dataChannel.bufferedAmount / 1024)}KB), waiting for drain event...`);
    
    return new Promise<void>((resolve, reject) => {
      const promiseKey = clientId || 'default';
      backpressurePromises.current.set(promiseKey, { resolve, reject });
      
      // Set up event-driven backpressure if not already done
      setupBackpressureHandling(dataChannel, promiseKey);
      
      // Timeout after 10 seconds as fallback
      setTimeout(() => {
        const promise = backpressurePromises.current.get(promiseKey);
        if (promise) {
          promise.reject();
          backpressurePromises.current.delete(promiseKey);
          logger.warn(`Backpressure timeout for client ${promiseKey}`);
        }
      }, 10000);
    }).catch(() => {
      logger.warn(`Backpressure failed for client ${clientId}, continuing anyway`);
    });
  }, [config.role, hostPeer, logger, setupBackpressureHandling]);

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
        const milestones = [10, 30, 50, 70, 90, 100];
        const lastLoggedPercentage = (file as any).lastLoggedPercentage || 0;
        
        if (milestones.includes(currentPercentage) && currentPercentage > lastLoggedPercentage) {
          logger.log(`Host progress milestone: ${currentPercentage}% (${bytesTransferred}/${file.size} bytes)`);
          (file as any).lastLoggedPercentage = currentPercentage;
        }

        await waitForBackpressure(clientId || 'default');
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
