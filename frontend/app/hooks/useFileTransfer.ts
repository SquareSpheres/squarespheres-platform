'use client';

import { useCallback, useState, useRef } from 'react';
import { useWebRTCHostPeer } from './useWebRTCHostPeer';
import { useWebRTCClientPeer } from './useWebRTCClientPeer';
import { useTransferProgress } from './useTransferProgress';
import { WebRTCPeerConfig } from '../types/webrtcTypes';
import { 
  getOptimalChunkSize, 
  createLogger
} from '../utils/fileTransferUtils';
import { waitForBufferDrain } from '../utils/webrtcUtils';
import { MESSAGE_TYPES } from '../constants/messageTypes';
import { encodeMessage } from '../utils/binaryMessageCodec';
import {
  FileTransferProgress,
  FileTransferAckProgress,
  FileTransferApi
} from '../types/fileTransfer';
import { useBackpressureManager } from './useBackpressureManager';
import { useStreamMessageHandlers } from './useStreamMessageHandlers';
import {
  generateTransferId,
  createTransferStartMessage,
  createTransferEndMessage,
  createTransferErrorMessage,
  encodeFileChunk,
  readFileChunk,
  getChunkEnd,
  shouldLogProgress,
  shouldYield,
  yieldToEventLoop,
} from '../utils/fileTransferOrchestrator';
import { createFileTransferLogger } from '../utils/fileTransferDebug';


export function useFileTransfer(config: WebRTCPeerConfig & { 
  debug?: boolean;
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;
  onFileInfoReceived?: (fileName: string, fileSize: number) => void;
  onFileSelected?: (fileName: string, fileSize: number) => void;
  onConnectionRejected?: (reason: string, connectedClientId?: string) => void;
  onClientJoined?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
}): FileTransferApi {
  const logger = createLogger(config.role, config.debug);
  const debugLogger = createFileTransferLogger(logger, config.debug);
  
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
    debugLogger.logAckSent(transferId, progress);
  }, [debugLogger]);

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
    onMessage: (data: string) => {
      // Forward signaling messages to the message handler
      if (messageHandlerRef.current) {
        messageHandlerRef.current(data);
      }
    },
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

  // Create config object for stream handlers
  const fileTransferConfig = {
    role: config.role,
    debug: config.debug,
    onComplete: config.onComplete,
    onFileInfoReceived: config.onFileInfoReceived,
    onFileSelected: config.onFileSelected,
  };

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
    config: fileTransferConfig,
    sendAckWithPeers,
  });

  messageHandlerRef.current = handleMessage;

  const { waitForBackpressure } = useBackpressureManager(config, logger, hostPeer);
  const sendFile = useCallback(async (file: File) => {
    if (config.role !== 'host') {
      throw new Error('sendFile can only be called on host');
    }

    const transferId = generateTransferId();
    const startTime = Date.now();
    let lastLoggedPercentage = 0;
    
    debugLogger.logTransferStart(file.name, file.size, transferId);
    
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
      const startMessage = createTransferStartMessage({
        transferId,
        fileName: file.name,
        fileSize: file.size,
        startTime
      });
      hostPeer.send(startMessage);

      // Stream file data in chunks
      let bytesTransferred = 0;
      
      while (bytesTransferred < file.size) {
        const start = bytesTransferred;
        const end = getChunkEnd(start, CHUNK_SIZE, file.size);
        const chunkData = await readFileChunk(file, start, end);
        const buffer = encodeFileChunk(transferId, chunkData, start);

        hostPeer.send(buffer);

        if (progressManager?.updateBytesTransferred) {
          progressManager.updateBytesTransferred(chunkData.length);
        }
        bytesTransferred += chunkData.length;
        
        const currentPercentage = Math.round((bytesTransferred / file.size) * 100);
        
        if (shouldLogProgress(currentPercentage, lastLoggedPercentage)) {
          debugLogger.logProgressMilestone(currentPercentage, bytesTransferred, file.size);
          lastLoggedPercentage = currentPercentage;
        }

        await waitForBackpressure('default');
        
        if (shouldYield(bytesTransferred, CHUNK_SIZE)) {
          await yieldToEventLoop();
        }
      }

      // Wait for buffer to fully drain before marking transfer complete
      try {
        const dataChannel = hostPeer.getDataChannel();
        if (dataChannel && dataChannel.readyState === 'open') {
          debugLogger.logBufferDrainStart();
          await waitForBufferDrain(dataChannel, 10000, config.debug);
          debugLogger.logBufferDrainSuccess();
        } else {
          debugLogger.logBufferDrainWarning('No data channel available for buffer drain check, proceeding with completion');
        }
      } catch (error) {
        debugLogger.logBufferDrainError(error);
      }
        
      const transferTime = Date.now() - startTime;
      const endMessage = createTransferEndMessage(transferId, bytesTransferred, transferTime);
      
      hostPeer.send(endMessage);
      debugLogger.logFileEndSent();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLogger.logTransferError(error);
      
      hostPeer.send(createTransferErrorMessage(transferId, errorMessage));
      progressManager.errorTransfer(errorMessage);
    }
  }, [config.role, config.debug, debugLogger, progressManager, hostPeer, waitForBackpressure, CHUNK_SIZE]);
  
  // Cancel transfer
  const cancelTransfer = useCallback((transferId?: string) => {
    debugLogger.logTransferCancel(transferId);
    
    if (config.role === 'host') {
      const cancelData = JSON.stringify({
        transferId: transferId || 'current',
        error: 'Transfer cancelled by host'
      });
      const cancelMessage = encodeMessage(MESSAGE_TYPES.FILE_ERROR, cancelData);
      
      hostPeer.send(cancelMessage);
    }
    
    progressManager.errorTransfer('Transfer cancelled');
  }, [config.role, debugLogger, hostPeer, progressManager]);
  
  // Clear transfer state
  const clearTransfer = useCallback(() => {
    debugLogger.logTransferClear();
    
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
  }, [debugLogger, progressManager, clearMessageQueue]);

  // Send file info when file is selected (before transfer starts)
  const sendFileInfo = useCallback((fileName: string, fileSize: number) => {
    if (config.role !== 'host') {
      throw new Error('sendFileInfo can only be called on host');
    }

    const activePeer = hostPeer;
    if (!activePeer) {
      logger.error('No active peer connection for sending file info');
      return;
    }

    const fileInfoMessage = JSON.stringify({
      type: MESSAGE_TYPES.FILE_INFO,
      fileName,
      fileSize
    });

    // Send through signaling server (works immediately when client joins)
    if (activePeer.connectedClient && activePeer.sendMessageToClient) {
      activePeer.sendMessageToClient(activePeer.connectedClient, fileInfoMessage);
      logger.log(`Sent file info via signaling: ${fileName} (${fileSize} bytes) to client ${activePeer.connectedClient}`);
    } else {
      logger.warn('No connected client or sendMessageToClient not available');
    }
  }, [config.role, hostPeer, logger]);
  
  // Return file transfer API

  return {
    // Transfer operations
    sendFile,
    sendFileInfo,
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
    signalingConnected: 'signalingConnected' in activePeer ? activePeer.signalingConnected : undefined,
    
    // Callbacks
    onProgress: config.onProgress,
    onComplete: config.onComplete,
    onError: config.onError,
  };
}
