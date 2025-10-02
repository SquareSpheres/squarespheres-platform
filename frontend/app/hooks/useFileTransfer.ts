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

// Simple binary message format - much simpler than before
const MESSAGE_TYPES = {
  FILE_START: 1,
  FILE_CHUNK: 2,
  FILE_END: 3,
  FILE_ERROR: 4
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
  status: 'pending' | 'transferring' | 'completed' | 'error';
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
  
  // Simple in-memory storage
  const [receivedFile, setReceivedFile] = useState<Blob | null>(null);
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null);
  const chunksRef = useRef<Map<string, Uint8Array[]>>(new Map());
  const fileInfoRef = useRef<Map<string, { fileName: string; fileSize: number; totalChunks: number }>>(new Map());
  
  // Fixed chunk size
  const CHUNK_SIZE = getOptimalChunkSize();
  
  // Progress management
  const progressManager = useTransferProgress({
    onProgress: config.onProgress,
    onComplete: config.onComplete,
    onError: config.onError
  });

  // File start handler
  const handleFileStart = useCallback(async (transferId: string, fileName: string, fileSize: number) => {
    logger.log('Starting file transfer:', { fileName, fileSize, transferId });
    
    setReceivedFileName(fileName);
    progressManager.startTransfer(fileName, fileSize);
    
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    fileInfoRef.current.set(transferId, { fileName, fileSize, totalChunks });
    chunksRef.current.set(transferId, new Array(totalChunks));
    
    logger.log('Transfer initialized:', { 
      transferId, 
      totalChunks, 
      chunkSize: CHUNK_SIZE,
      hasFileInfo: fileInfoRef.current.has(transferId),
      hasChunks: chunksRef.current.has(transferId)
    });
  }, [logger, progressManager, CHUNK_SIZE]);

  // File chunk handler
  const handleFileChunk = useCallback(async (transferId: string, chunkIndex: number, chunkData: Uint8Array) => {
    logger.log(`Processing chunk ${chunkIndex} for transfer ${transferId}`);
    
    const chunks = chunksRef.current.get(transferId);
    if (!chunks) {
      logger.error(`No chunks array found for transfer ${transferId}. Available transfers:`, Array.from(chunksRef.current.keys()));
      return;
    }
    
    chunks[chunkIndex] = chunkData;
    progressManager.updateBytesTransferred(chunkData.length);
    
    logger.log(`Stored chunk ${chunkIndex} for transfer ${transferId}`, {
      chunkSize: chunkData.length,
      totalChunks: chunks.length,
      receivedChunks: chunks.filter(chunk => chunk !== undefined).length
    });
  }, [logger, progressManager]);

  // File complete handler
  const handleFileComplete = useCallback(async (transferId: string) => {
    logger.log('Completing file transfer:', transferId);
    
    const chunks = chunksRef.current.get(transferId);
    const fileInfo = fileInfoRef.current.get(transferId);
    
    if (!chunks || !fileInfo) {
      logger.error(`No chunks or file info found for transfer ${transferId}`);
      return;
    }
    
    // Check for missing chunks
    const missingChunks = chunks.findIndex(chunk => chunk === undefined);
    if (missingChunks !== -1) {
      logger.error(`Missing chunk ${missingChunks} for transfer ${transferId}`);
      progressManager.failTransfer(`Missing chunk ${missingChunks}`);
      return;
    }
    
    // Create blob from chunks
    const blob = new Blob(chunks as BlobPart[]);
    setReceivedFile(blob);
    
    // Call completion callback
    if (config.onComplete) {
      config.onComplete(blob, fileInfo.fileName);
    }
    
    progressManager.completeTransfer();
    
    // Cleanup
    chunksRef.current.delete(transferId);
    fileInfoRef.current.delete(transferId);
  }, [logger, progressManager, config]);

  // File error handler
  const handleFileError = useCallback((transferId: string, error: string) => {
    logger.error(`File transfer error for ${transferId}: ${error}`);
    progressManager.failTransfer(error);
    
    // Cleanup
    chunksRef.current.delete(transferId);
    fileInfoRef.current.delete(transferId);
  }, [logger, progressManager]);

  // Simple message handler - WebRTC guarantees delivery and ordering
  const handleMessage = useCallback(async (data: string | ArrayBuffer | Blob) => {
    let message: { type: number; data: string } | null = null;
    
    if (typeof data === 'string') {
      // Handle string messages (fallback)
      try {
        const jsonMessage = JSON.parse(data);
        message = { type: jsonMessage.type, data: JSON.stringify(jsonMessage) };
      } catch (error) {
        logger.error('Failed to parse string message:', error);
        return;
      }
    } else if (data instanceof ArrayBuffer) {
      // Handle binary messages
      if (data.byteLength < 4) {
        logger.error('Binary message too short');
        return;
      }
      
      const view = new DataView(data);
      const type = view.getUint32(0, true);
      
      if (type === MESSAGE_TYPES.FILE_CHUNK) {
        // Special handling for chunk messages with raw binary data
        if (data.byteLength < 8) {
          logger.error('Chunk message too short');
          return;
        }
        
        const metadataLength = view.getUint32(4, true);
        const metadataBytes = new Uint8Array(data, 8, metadataLength);
        const metadata = new TextDecoder().decode(metadataBytes);
        
        try {
          const parsedMetadata = JSON.parse(metadata);
          const chunkData = new Uint8Array(data, 8 + metadataLength);
          await handleFileChunk(parsedMetadata.transferId, parsedMetadata.chunkIndex, chunkData);
        } catch (error) {
          logger.error('Failed to parse chunk metadata:', error);
        }
        return;
      } else {
        // Handle other binary messages
        message = decodeMessage(data);
        if (!message) {
          logger.error('Failed to decode binary message');
          return;
        }
      }
    } else if (data instanceof Blob) {
      // Convert blob to array buffer
      try {
        const arrayBuffer = await data.arrayBuffer();
        if (arrayBuffer.byteLength < 4) {
          logger.error('Blob message too short');
          return;
        }
        
        const view = new DataView(arrayBuffer);
        const type = view.getUint32(0, true);
        
        if (type === MESSAGE_TYPES.FILE_CHUNK) {
          // Handle chunk blob
          if (arrayBuffer.byteLength < 8) {
            logger.error('Chunk blob message too short');
            return;
          }
          
          const metadataLength = view.getUint32(4, true);
          const metadataBytes = new Uint8Array(arrayBuffer, 8, metadataLength);
          const metadata = new TextDecoder().decode(metadataBytes);
          
          try {
            const parsedMetadata = JSON.parse(metadata);
            const chunkData = new Uint8Array(arrayBuffer, 8 + metadataLength);
            await handleFileChunk(parsedMetadata.transferId, parsedMetadata.chunkIndex, chunkData);
          } catch (error) {
            logger.error('Failed to parse chunk blob metadata:', error);
          }
          return;
        } else {
          // Handle other blob messages
          message = decodeMessage(arrayBuffer);
          if (!message) {
            logger.error('Failed to decode blob message');
            return;
          }
        }
      } catch (error) {
        logger.error('Failed to convert blob to array buffer:', error);
        return;
      }
    }
    
    if (!message) return;
    
    try {
      const parsedData = JSON.parse(message.data);
      
      switch (message.type) {
        case MESSAGE_TYPES.FILE_START:
          await handleFileStart(parsedData.transferId, parsedData.fileName, parsedData.fileSize);
          break;
        case MESSAGE_TYPES.FILE_END:
          await handleFileComplete(parsedData.transferId);
          break;
        case MESSAGE_TYPES.FILE_ERROR:
          handleFileError(parsedData.transferId, parsedData.error);
          break;
        default:
          logger.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      logger.error('Failed to parse message data:', error);
    }
  }, [handleFileStart, handleFileChunk, handleFileComplete, handleFileError, logger]);

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

  // Send file (host only)
  const sendFile = useCallback(async (file: File, clientId?: string) => {
    if (config.role !== 'host') {
      throw new Error('sendFile can only be called on host');
    }

    const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    logger.log('Starting file transfer:', {
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
      transferId,
      clientId: clientId || 'all clients'
    });
    
    progressManager.startTransfer(file.name, file.size);

    try {
      // Send file start message - binary format
      const startData = JSON.stringify({
        transferId,
        fileName: file.name,
        fileSize: file.size,
        totalChunks
      });
      const startMessage = encodeMessage(MESSAGE_TYPES.FILE_START, startData);
      
      if (clientId) {
        hostPeer.send(startMessage, clientId);
      } else {
        hostPeer.send(startMessage);
      }

      // Send file chunks - binary format with raw chunk data
      let bytesTransferred = 0;
      let chunkIndex = 0;
      
      while (bytesTransferred < file.size) {
        const start = bytesTransferred;
        const end = Math.min(start + CHUNK_SIZE, file.size);
          
        const fileSlice = file.slice(start, end);
        const chunkArrayBuffer = await fileSlice.arrayBuffer();
        const chunk = new Uint8Array(chunkArrayBuffer);
        
        // Create binary chunk message: type + metadata + raw chunk data
        const metadata = JSON.stringify({
          transferId,
          chunkIndex
        });
        const metadataBytes = new TextEncoder().encode(metadata);
        
        // Binary format: [4 bytes: type][4 bytes: metadata length][metadata][chunk data]
        const buffer = new ArrayBuffer(8 + metadataBytes.length + chunk.length);
        const view = new DataView(buffer);
        
        view.setUint32(0, MESSAGE_TYPES.FILE_CHUNK, true);
        view.setUint32(4, metadataBytes.length, true);
        
        new Uint8Array(buffer, 8).set(metadataBytes);
        new Uint8Array(buffer, 8 + metadataBytes.length).set(chunk);

        if (clientId) {
          hostPeer.send(buffer, clientId);
        } else {
          hostPeer.send(buffer);
        }

        progressManager.updateBytesTransferred(chunk.length);
        bytesTransferred += chunk.length;
        chunkIndex++;

        await waitForBackpressure(clientId || 'default');
      }
        
      // Send FILE_END message
      const endData = JSON.stringify({ transferId });
      const endMessage = encodeMessage(MESSAGE_TYPES.FILE_END, endData);
      
      if (clientId) {
        hostPeer.send(endMessage, clientId);
      } else {
        hostPeer.send(endMessage);
      }
      
      logger.log('File transfer completed successfully');
      progressManager.completeTransfer();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('File transfer failed:', error);
      
      const errorData = JSON.stringify({
        transferId,
        error: errorMessage
      });
      const errorMsg = encodeMessage(MESSAGE_TYPES.FILE_ERROR, errorData);
      
      if (clientId) {
        hostPeer.send(errorMsg, clientId);
      } else {
        hostPeer.send(errorMsg);
      }
      
      progressManager.failTransfer(errorMessage);
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
    
    progressManager.failTransfer('Transfer cancelled');
  }, [config.role, logger, hostPeer, progressManager]);
  
  // Clear transfer state
  const clearTransfer = useCallback(() => {
    logger.log('Clearing transfer state');
    
    setReceivedFile(null);
    setReceivedFileName(null);
    chunksRef.current.clear();
    fileInfoRef.current.clear();
    progressManager.clearTransfer();
  }, [logger, progressManager]);
  
  return {
    // Transfer operations
    sendFile,
    cancelTransfer,
    clearTransfer,
    
    // Transfer state
    transferProgress: progressManager.transferProgress,
    isTransferring: progressManager.isTransferring,
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
