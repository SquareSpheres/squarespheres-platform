'use client';

import { useCallback, useState, useRef } from 'react';
import { useWebRTCHostPeer } from './useWebRTCHostPeer';
import { useWebRTCClientPeer } from './useWebRTCClientPeer';
import { useTransferProgress } from './useTransferProgress';
import { WebRTCPeerConfig } from './webrtcTypes';
import { 
  getOptimalChunkSize, 
  createLogger
} from './fileTransferUtils';
import {
  YIELD_CHUNK_INTERVAL,
  PROGRESS_MILESTONES,
} from '../utils/fileTransferConstants';
import { MESSAGE_TYPES } from '../constants/messageTypes';
import { encodeMessage } from '../utils/binaryMessageCodec';
import {
  FileTransferProgress,
  FileTransferAckProgress,
  FileTransferApi
} from '../types/fileTransfer';
import { useBackpressureManager } from './useBackpressureManager';
import { useStreamMessageHandlers } from './useStreamMessageHandlers';


export function useFileTransfer(config: WebRTCPeerConfig & { 
  debug?: boolean;
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;
}): FileTransferApi {
  const logger = createLogger(config.role, config.debug);
  
  const [receivedFile, setReceivedFile] = useState<Blob | null>(null);
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null);
  
  const transferBuffersRef = useRef<Map<string, Uint8Array>>(new Map());
  const transferInfoRef = useRef<Map<string, { 
    fileName: string; 
    fileSize: number; 
    bytesReceived: number;
    startTime: number;
    lastLoggedPercentage?: number;
    lastAckTime?: number;
  }>>(new Map());
  
  const transferTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  const [ackProgress, setAckProgress] = useState<FileTransferAckProgress | null>(null);
  
  const CHUNK_SIZE = getOptimalChunkSize();
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
    progressManager  } = useTransferProgress({
    onProgress: config.onProgress,
    onComplete: (file?: Blob, fileName?: string) => {
      if (config.onComplete) {
        config.onComplete(file || null, fileName || null);
      }
    },
    onError: config.onError
  });

  const sendAck = useCallback((transferId: string, progress: number) => {
    logger.log(`Sent ACK for transfer ${transferId}: ${progress}%`);
  }, [logger]);

  let sendAckWithPeers = sendAck;
  
  const messageHandlerRef = useRef<(data: string | ArrayBuffer | Blob) => void>(() => {});





  const hostPeer = useWebRTCHostPeer({
    ...config,
    onChannelMessage: (data: string | ArrayBuffer | Blob) => {
      if (messageHandlerRef.current) {
        messageHandlerRef.current(data);
      } else {
        logger.log('Message received before handlers initialized');
      }
    }
  });
  
  const clientPeer = useWebRTCClientPeer({
    ...config,
    onChannelMessage: (data: string | ArrayBuffer | Blob) => {
      if (messageHandlerRef.current) {
        messageHandlerRef.current(data);
      } else {
        logger.log('Message received before handlers initialized');
      }
    }
  });

  const activePeer = config.role === 'host' ? hostPeer : clientPeer;

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

  const {
    handleMessage,
  } = useStreamMessageHandlers({
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
  });

  messageHandlerRef.current = handleMessage;

  const { waitForBackpressure } = useBackpressureManager(config, logger, hostPeer);
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
        
        const transferIdBytes = new TextEncoder().encode(transferId);
        const buffer = new ArrayBuffer(12 + transferIdBytes.length + chunkData.length);
        const view = new DataView(buffer);
        
        view.setUint32(0, MESSAGE_TYPES.FILE_DATA, true);
        view.setUint32(4, transferIdBytes.length, true);
        view.setUint32(8, start, true);
        
        new Uint8Array(buffer, 12).set(transferIdBytes);
        new Uint8Array(buffer, 12 + transferIdBytes.length).set(chunkData);

        if (clientId) {
          hostPeer.send(buffer, clientId);
        } else {
          hostPeer.send(buffer);
        }

        if (progressManager?.updateBytesTransferred) {
          progressManager.updateBytesTransferred(chunkData.length);
        }
        bytesTransferred += chunkData.length;
        
        const currentPercentage = Math.round((bytesTransferred / file.size) * 100);
        const lastLoggedPercentage = (file as any).lastLoggedPercentage || 0;
        
        if (PROGRESS_MILESTONES.includes(currentPercentage as any) && currentPercentage > lastLoggedPercentage) {
          logger.log(`Host progress milestone: ${currentPercentage}% (${bytesTransferred}/${file.size} bytes)`);
          (file as any).lastLoggedPercentage = currentPercentage;
        }

        await waitForBackpressure(clientId || 'default');
        
        if (bytesTransferred % (CHUNK_SIZE * YIELD_CHUNK_INTERVAL) === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
        
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
