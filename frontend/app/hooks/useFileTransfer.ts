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
import { waitForBufferDrain } from './webrtcUtils';
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
  onConnectionRejected?: (reason: string, connectedClientId?: string) => void;
  onClientJoined?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
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
    },
    onConnectionRejected: config.onConnectionRejected,
    onClientJoined: config.onClientJoined,
    onClientDisconnected: config.onClientDisconnected,
  });
  
  const clientPeer = useWebRTCClientPeer({
    ...config,
    onChannelMessage: (data: string | ArrayBuffer | Blob) => {
      if (messageHandlerRef.current) {
        messageHandlerRef.current(data);
      } else {
        logger.log('Message received before handlers initialized');
      }
    },
    onConnectionRejected: config.onConnectionRejected,
  });

  const activePeer = config.role === 'host' ? hostPeer : clientPeer;

  sendAckWithPeers = useCallback((transferId: string, progress: number, messageType: number = MESSAGE_TYPES.FILE_ACK) => {
    const ackMessage = JSON.stringify({
      type: messageType,
      transferId,
      ...(messageType === MESSAGE_TYPES.FILE_ACK && { progress })
    });
    
    if (config.role === 'host') {
      hostPeer.send(ackMessage);
    } else if (config.role === 'client') {
      clientPeer.send(ackMessage);
    }
    
    const messageTypeName = messageType === MESSAGE_TYPES.FILE_END_ACK ? 'FILE_END_ACK' : 'FILE_ACK';
    logger.log(`Sent ${messageTypeName} for transfer ${transferId}: ${progress}%`);
  }, [config.role, hostPeer, clientPeer, logger]);

  const {
    handleMessage,
    clearMessageQueue,
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
  const sendFile = useCallback(async (file: File) => {
    if (config.role !== 'host') {
      throw new Error('sendFile can only be called on host');
    }

    const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    logger.log('Starting stream-based file transfer:', {
      fileName: file.name,
      fileSize: file.size,
      transferId
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
      
      hostPeer.send(startMessage);

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

        hostPeer.send(buffer);

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

        await waitForBackpressure('default');
        
        if (bytesTransferred % (CHUNK_SIZE * YIELD_CHUNK_INTERVAL) === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Wait for buffer to fully drain before marking transfer complete
      try {
        const dataChannel = hostPeer.getDataChannel();

        if (dataChannel && dataChannel.readyState === 'open') {
          logger.log('Waiting for buffer to drain before marking transfer complete...');
          await waitForBufferDrain(dataChannel, 10000, config.debug);
          logger.log('Buffer drained successfully, sending completion message');
        } else {
          logger.warn('No data channel available for buffer drain check, proceeding with completion');
        }
      } catch (error) {
        logger.warn('Buffer drain failed, proceeding with completion:', error);
      }
        
      const transferTime = Date.now() - startTime;
      
      // Send FILE_END instead of FILE_COMPLETE for proper handshake
      const endMessage = JSON.stringify({
        type: MESSAGE_TYPES.FILE_END,
        transferId,
        totalBytes: bytesTransferred,
        transferTime,
        checksum: undefined // Can be added later for integrity verification
      });
      
      hostPeer.send(endMessage);
      
      logger.log('Sent FILE_END, waiting for FILE_END_ACK...');
      
      // Don't complete the transfer yet - wait for FILE_END_ACK
      // The completion will happen in handleFileEndAck when client confirms receipt
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Stream file transfer failed:', error);
      
      const errorMessage_str = JSON.stringify({
        type: MESSAGE_TYPES.FILE_ERROR,
        transferId,
        error: errorMessage
      });
      
      hostPeer.send(errorMessage_str);
      
      progressManager.errorTransfer(errorMessage);
    }
  }, [config.role, config.debug, logger, progressManager, hostPeer, waitForBackpressure, CHUNK_SIZE]);
  
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
    clearMessageQueue();
    progressManager.clearTransfer();
  }, [logger, progressManager, clearMessageQueue]);
  
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
    getPeerConnection: activePeer.getPeerConnection,
    role: activePeer.role,
    peerId: activePeer.peerId,
    connectedClient: 'connectedClient' in activePeer ? activePeer.connectedClient : undefined,
    
    // Callbacks
    onProgress: config.onProgress,
    onComplete: config.onComplete,
    onError: config.onError,
  };
}
