'use client';

import { useCallback, useState, useRef } from 'react';
import { useWebRTCHostPeer } from './useWebRTCHostPeer';
import { useWebRTCClientPeer } from './useWebRTCClientPeer';
import { useTransferProgress } from './useTransferProgress';
import { useStreamMessageHandlers } from './useStreamMessageHandlers';
import { WebRTCPeerConfig } from './webrtcTypes';
import { 
  getOptimalChunkSize, 
  createLogger
} from './fileTransferUtils';
import { waitForBufferDrain } from './webrtcUtils';
import { MESSAGE_TYPES } from '../constants/messageTypes';
import {
  FileTransferProgress,
  FileTransferAckProgress,
  FileTransferApi
} from '../types/fileTransfer';
import type { FileTransferConfig } from '../types/fileTransferConfig';
import {
  generateTransferId,
  createTransferStartMessage,
  createTransferEndMessage,
  createTransferErrorMessage,
  encodeFileChunk,
  readFileChunk,
  getChunkEnd,
  shouldLogProgress,
} from '../utils/fileTransferOrchestrator';
import { createFileTransferLogger } from '../utils/fileTransferDebug';
import { MAX_BUFFER_SIZES } from '../utils/fileTransferConstants';
import { isMobileDevice } from './fileTransferUtils';

/**
 * Event-Driven File Transfer Hook
 * 
 * Uses bufferedamountlow events for optimal throughput instead of polling.
 * More efficient for large files and fast connections.
 */
export function useFileTransferEventDriven(config: WebRTCPeerConfig & { 
  debug?: boolean;
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;
  onConnectionRejected?: (reason: string, connectedClientId?: string) => void;
  onClientJoined?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
}): FileTransferApi {
  const logger = createLogger(config.role, config.debug);
  const debugLogger = createFileTransferLogger(logger, config.debug);
  
  const [receivedFile, setReceivedFile] = useState<Blob | null>(null);
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null);
  const [ackProgress, setAckProgress] = useState<FileTransferAckProgress | null>(null);
  
  const CHUNK_SIZE = getOptimalChunkSize();
  
  // Refs for message handling (receiver side)
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

  // Track active transfer state for event-driven flow
  const transferStateRef = useRef<{
    file: File | null;
    transferId: string | null;
    bytesTransferred: number;
    lastLoggedPercentage: number;
    isCancelled: boolean;
    isActive: boolean;
  }>({
    file: null,
    transferId: null,
    bytesTransferred: 0,
    lastLoggedPercentage: 0,
    isCancelled: false,
    isActive: false,
  });

  const {
    transferProgress,
    isTransferring,
    progressManager,
  } = useTransferProgress({
    onProgress: config.onProgress,
    onComplete: config.onComplete ? (file?: Blob, fileName?: string) => {
      config.onComplete?.(file || null, fileName || null);
      // Set received file state for client
      if (config.role === 'client' && file && fileName) {
        setReceivedFile(file);
        setReceivedFileName(fileName);
      }
    } : undefined,
    onError: config.onError,
  });

  // Reset timeout helper for transfer timeout management
  const resetTimeout = useCallback((transferId: string, ms: number, callback: () => void) => {
    const existing = transferTimeoutsRef.current.get(transferId);
    if (existing) clearTimeout(existing);
    
    const timeout = setTimeout(callback, ms);
    transferTimeoutsRef.current.set(transferId, timeout);
  }, []);

  // sendAck callback for receiver to send ACKs back to sender
  const sendAckWithPeersRef = useRef<((transferId: string, progress: number, messageType?: number) => void) | null>(null);
  
  const sendAckWithPeers = useCallback((transferId: string, progress: number, messageType: number = MESSAGE_TYPES.FILE_ACK) => {
    const ackMessage = JSON.stringify({
      type: messageType,
      transferId,
      ...(messageType === MESSAGE_TYPES.FILE_ACK && { progress })
    });
    
    // Client sends ACK to host, host doesn't need to send ACKs
    if (config.role === 'client') {
      clientPeerRef.current?.send(ackMessage);
    }
    
    const messageTypeName = messageType === MESSAGE_TYPES.FILE_END_ACK ? 'FILE_END_ACK' : 'FILE_ACK';
    logger.log(`Sent ${messageTypeName} for transfer ${transferId}: ${progress}%`);
  }, [config.role, logger]);
  
  sendAckWithPeersRef.current = sendAckWithPeers;
  
  // Create config object for stream handlers
  const fileTransferConfig: FileTransferConfig = {
    role: config.role,
    debug: config.debug,
    onComplete: config.onComplete,
  };

  // Message handlers for receiving files
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
  
  // Peer refs to access from callbacks
  const hostPeerRef = useRef<any>(null);
  const clientPeerRef = useRef<any>(null);
  
  // Call both hooks to satisfy React rules (only one will be used)
  const hostPeer = useWebRTCHostPeer({
    ...config,
    onClientJoined: config.onClientJoined,
    onClientDisconnected: config.onClientDisconnected,
    onConnectionRejected: config.onConnectionRejected,
    onChannelMessage: handleMessage, // Handle incoming messages
  });
  
  hostPeerRef.current = hostPeer;

  const clientPeer = useWebRTCClientPeer({
    ...config,
    onConnectionRejected: config.onConnectionRejected,
    onChannelMessage: handleMessage, // Handle incoming messages
  });
  
  clientPeerRef.current = clientPeer;

  const peer = config.role === 'host' ? hostPeer : clientPeer;

  /**
   * Event-driven send batch - sends chunks until buffer is full
   */
  const sendBatch = useCallback(async () => {
    const state = transferStateRef.current;
    
    if (!state.isActive || state.isCancelled || !state.file || !state.transferId) {
      return;
    }

    const dataChannel = hostPeer?.getDataChannel();
    if (!dataChannel) {
      logger.error('No data channel available');
      return;
    }

    const MAX_BUFFER_SIZE = isMobileDevice() ? MAX_BUFFER_SIZES.MOBILE : MAX_BUFFER_SIZES.DESKTOP;
    
    try {
      // Send multiple chunks while buffer allows
      while (
        state.isActive && 
        !state.isCancelled && 
        state.bytesTransferred < state.file.size &&
        dataChannel.bufferedAmount < MAX_BUFFER_SIZE
      ) {
        const start = state.bytesTransferred;
        const end = getChunkEnd(start, CHUNK_SIZE, state.file.size);
        const chunkData = await readFileChunk(state.file, start, end);
        const buffer = encodeFileChunk(state.transferId, chunkData, start);

        dataChannel.send(buffer);

        progressManager.updateBytesTransferred(chunkData.length);
        state.bytesTransferred += chunkData.length;
        
        const currentPercentage = Math.round((state.bytesTransferred / state.file.size) * 100);
        
        if (shouldLogProgress(currentPercentage, state.lastLoggedPercentage)) {
          debugLogger.logProgressMilestone(currentPercentage, state.bytesTransferred, state.file.size);
          state.lastLoggedPercentage = currentPercentage;
        }
      }

      // Check if transfer is complete
      if (state.bytesTransferred >= state.file.size) {
        logger.log(`Transfer complete: ${state.file.name}`);
        
        // Wait for buffer to fully drain before marking complete
        await waitForBufferDrain(dataChannel, 5000, config.debug);
        
        // Send end message (as JSON string, same as polling version)
        const transferTime = Date.now() - (transferProgress?.startTime || Date.now());
        const endMessage = createTransferEndMessage(state.transferId, state.bytesTransferred, transferTime);
        dataChannel.send(endMessage);

        // Complete transfer
        state.isActive = false;
        progressManager.completeTransfer();
        
        debugLogger.logTransferFinalized(state.file.name);
      } else if (dataChannel.bufferedAmount >= MAX_BUFFER_SIZE) {
        // Buffer is full, event will trigger next batch
        debugLogger.logBufferFull(Math.round(dataChannel.bufferedAmount / 1024));
      }
    } catch (error) {
      state.isActive = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during transfer';
      logger.error(errorMessage);
      progressManager.errorTransfer(errorMessage);
    }
  }, [hostPeer, progressManager, debugLogger, logger, CHUNK_SIZE, config.debug, transferProgress?.startTime]);

  /**
   * Event-driven sendFile implementation
   */
  const sendFile = useCallback(async (file: File) => {
    if (config.role !== 'host') {
      throw new Error('Only host can send files');
    }

    if (transferStateRef.current.isActive) {
      throw new Error('Transfer already in progress');
    }

    const dataChannel = hostPeer?.getDataChannel();
    if (!dataChannel || dataChannel.readyState !== 'open') {
      throw new Error('Data channel not ready');
    }

    const transferId = generateTransferId();
    const startTime = Date.now();

    // Initialize transfer state
    transferStateRef.current = {
      file,
      transferId,
      bytesTransferred: 0,
      lastLoggedPercentage: 0,
      isCancelled: false,
      isActive: true,
    };

    debugLogger.logTransferStart(file.name, file.size, transferId);

    // Start progress tracking
    progressManager.startTransfer(file.name, file.size);
    
    // Initialize ACK progress for host
    if (config.role === 'host') {
      setAckProgress({
        fileName: file.name,
        fileSize: file.size,
        bytesAcknowledged: 0,
        percentage: 0,
        status: 'waiting',
      });
    }

    // Set up event listener for buffer low events
    const MAX_BUFFER_SIZE = isMobileDevice() ? MAX_BUFFER_SIZES.MOBILE : MAX_BUFFER_SIZES.DESKTOP;
    const threshold = MAX_BUFFER_SIZE * 0.5; // Trigger at 50% buffer capacity
    dataChannel.bufferedAmountLowThreshold = threshold;

    const handleBufferLow = () => {
      if (transferStateRef.current.isActive && !transferStateRef.current.isCancelled) {
        debugLogger.logBufferDrained();
        sendBatch();
      }
    };

    dataChannel.addEventListener('bufferedamountlow', handleBufferLow);

    try {
      // Send start message (as JSON string, same as polling version)
      const startMessage = createTransferStartMessage({
        transferId,
        fileName: file.name,
        fileSize: file.size,
        startTime
      });
      dataChannel.send(startMessage);

      // Kick off initial batch
      await sendBatch();

    } catch (error) {
      transferStateRef.current.isActive = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during transfer';
      logger.error(errorMessage);
      
      // Try to send error message (as JSON string, same as polling version)
      try {
        const errorMsg = createTransferErrorMessage(transferId, errorMessage);
        dataChannel.send(errorMsg);
      } catch (e) {
        // Ignore send errors
      }
      
      progressManager.errorTransfer(errorMessage);
      throw error;
    } finally {
      // Clean up event listener
      dataChannel.removeEventListener('bufferedamountlow', handleBufferLow);
    }
  }, [config.role, hostPeer, progressManager, logger, sendBatch, debugLogger]);
  
  // Cancel transfer
  const cancelTransfer = useCallback((transferId?: string) => {
    if (config.role !== 'host') return;
    
    const state = transferStateRef.current;
    if (state.isActive) {
      state.isCancelled = true;
      state.isActive = false;
      
      debugLogger.logTransferCancel();
      progressManager.errorTransfer('Transfer cancelled');
    }
  }, [config.role, debugLogger, progressManager]);

  const clearTransfer = useCallback(() => {
    setReceivedFile(null);
    setReceivedFileName(null);
    setAckProgress(null);
    transferBuffersRef.current.clear();
    transferInfoRef.current.clear();
    transferTimeoutsRef.current.clear();
    clearMessageQueue();
    progressManager.clearTransfer();
  }, [progressManager, clearMessageQueue]);

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
    connectionState: peer.connectionState,
    dataChannelState: peer.dataChannelState,
    createOrEnsureConnection: peer.createOrEnsureConnection,
    close: peer.close,
    disconnect: peer.disconnect,
    getPeerConnection: () => {
      if (config.role === 'host') return hostPeer?.getPeerConnection() || null;
      if (config.role === 'client') return clientPeer?.getPeerConnection() || null;
      return null;
    },
    role: peer.role,
    peerId: peer.peerId,
    connectedClient: hostPeer?.connectedClient,
  };
}

