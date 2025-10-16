'use client';
import { useCallback, useState, useRef, useEffect } from 'react';
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

  // Optimized chunk size for event-driven transfers
  const CHUNK_SIZE = isMobileDevice() 
    ? 32 * 1024  // 32KB for mobile (conservative)
    : 256 * 1024; // 256KB for desktop (aggressive, event-driven can handle it)

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

  // Prevent concurrent sendBatch execution
  const isSendingRef = useRef(false);

  // Cleanup function ref for unmount safety
  const cleanupFnRef = useRef<(() => void) | null>(null);

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
   * Get adaptive threshold based on buffer size and connection characteristics
   */
  const getAdaptiveThreshold = useCallback((bufferSize: number) => {
    // Start conservative (30% of buffer), cap at 64KB to avoid excessive triggering
    const baseThreshold = Math.min(bufferSize * 0.3, 65536);
    return baseThreshold;
  }, []);

  /**
   * Reset transfer state completely
   */
  const resetTransferState = useCallback(() => {
    transferStateRef.current = {
      file: null,
      transferId: null,
      bytesTransferred: 0,
      lastLoggedPercentage: 0,
      isCancelled: false,
      isActive: false,
    };
    isSendingRef.current = false;
  }, []);

  /**
   * Event-driven send batch - sends chunks until buffer is full
   */
  const sendBatch = useCallback(async () => {
    // Prevent concurrent execution (race condition fix)
    if (isSendingRef.current) {
      debugLogger.logBufferFull(0); // Already sending
      return;
    }
    isSendingRef.current = true;

    try {
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
      
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 3;

      // Send multiple chunks while buffer allows
      while (
        state.isActive &&
        !state.isCancelled &&
        state.bytesTransferred < state.file.size &&
        dataChannel.bufferedAmount < MAX_BUFFER_SIZE
      ) {
        const start = state.bytesTransferred;
        const end = getChunkEnd(start, CHUNK_SIZE, state.file.size);

        try {
          const chunkData = await readFileChunk(state.file, start, end);
          consecutiveErrors = 0; // Reset on success

          const buffer = encodeFileChunk(state.transferId, chunkData, start);
          dataChannel.send(buffer);

          progressManager.updateBytesTransferred(chunkData.length);
          state.bytesTransferred += chunkData.length;

          const currentPercentage = Math.round((state.bytesTransferred / state.file.size) * 100);
          if (shouldLogProgress(currentPercentage, state.lastLoggedPercentage)) {
            debugLogger.logProgressMilestone(currentPercentage, state.bytesTransferred, state.file.size);
            state.lastLoggedPercentage = currentPercentage;
          }
        } catch (error) {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            throw new Error(`Failed to read file after ${MAX_CONSECUTIVE_ERRORS} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
          logger.warn(`Chunk read error (attempt ${consecutiveErrors}), retrying...`);
          await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause before retry
        }
      }

      // Check if transfer is complete
      if (state.bytesTransferred >= state.file.size) {
        logger.log(`Transfer complete: ${state.file.name}`);

        // Wait for buffer to fully drain before marking complete
        const currentBuffer = dataChannel.bufferedAmount;
        if (currentBuffer > 0) {
          try {
            if (config.debug) {
              logger.log(`Waiting for buffer drain (current: ${Math.round(currentBuffer / 1024)}KB)...`);
            }
            await waitForBufferDrain(dataChannel, 5000, config.debug);
            if (config.debug) {
              logger.log('Buffer fully drained');
            }
          } catch (drainError) {
            logger.warn('Buffer drain timeout, sending end message anyway');
            // Continue - receiver will validate
          }
        } else if (config.debug) {
          logger.log('Buffer already empty, no drain needed');
        }

        // Send end message (as JSON string)
        const transferTime = Date.now() - (transferProgress?.startTime || Date.now());
        const endMessage = createTransferEndMessage(state.transferId, state.bytesTransferred, transferTime);
        dataChannel.send(endMessage);

        // Complete transfer and reset state
        state.isActive = false;
        progressManager.completeTransfer();
        debugLogger.logTransferFinalized(state.file.name);
        
        // Clean up event listener on successful completion
        if (cleanupFnRef.current) {
          cleanupFnRef.current();
          cleanupFnRef.current = null;
        }
      } else if (dataChannel.bufferedAmount >= MAX_BUFFER_SIZE) {
        // Buffer is full, event will trigger next batch
        debugLogger.logBufferFull(Math.round(dataChannel.bufferedAmount / 1024));
        if (config.debug) {
          logger.log(`Waiting for bufferedamountlow event (threshold: ${Math.round(dataChannel.bufferedAmountLowThreshold / 1024)}KB)...`);
        }
      }
    } catch (error) {
      const state = transferStateRef.current;
      state.isActive = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during transfer';
      logger.error(errorMessage);
      progressManager.errorTransfer(errorMessage);
    } finally {
      isSendingRef.current = false;
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
    const threshold = getAdaptiveThreshold(MAX_BUFFER_SIZE);
    
    dataChannel.bufferedAmountLowThreshold = threshold;
    
    if (config.debug) {
      logger.log(`Buffer threshold set to ${Math.round(threshold / 1024)}KB (${Math.round(threshold / MAX_BUFFER_SIZE * 100)}% of ${Math.round(MAX_BUFFER_SIZE / 1024)}KB buffer)`);
    }

    const handleBufferLow = () => {
      if (transferStateRef.current.isActive && !transferStateRef.current.isCancelled) {
        const currentBuffer = dataChannel.bufferedAmount;
        if (config.debug) {
          logger.log(`bufferedamountlow event fired (buffer: ${Math.round(currentBuffer / 1024)}KB)`);
        }
        debugLogger.logBufferDrained();
        sendBatch();
      } else {
        if (config.debug) {
          logger.log('bufferedamountlow event fired but transfer not active, ignoring');
        }
      }
    };

    // Store cleanup function for unmount safety
    const cleanup = () => {
      dataChannel.removeEventListener('bufferedamountlow', handleBufferLow);
      if (config.debug) {
        logger.log('Removed bufferedamountlow event listener');
      }
    };
    cleanupFnRef.current = cleanup;

    try {
      // Check if bufferedamountlow is supported
      try {
        dataChannel.addEventListener('bufferedamountlow', handleBufferLow);
      } catch (e) {
        logger.error('bufferedamountlow event not supported by this browser');
        throw new Error('Event-driven transfer not supported by this browser');
      }

      // Send start message (as JSON string)
      const startMessage = createTransferStartMessage({
        transferId,
        fileName: file.name,
        fileSize: file.size,
        startTime
      });
      dataChannel.send(startMessage);

      // Kick off initial batch (don't await - let events drive the rest)
      sendBatch();
    } catch (error) {
      // Complete state cleanup on error
      transferStateRef.current.isActive = false;
      transferStateRef.current.isCancelled = false;
      transferStateRef.current.file = null;
      transferStateRef.current.transferId = null;
      isSendingRef.current = false;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error during transfer';
      logger.error(errorMessage);

      // Try to send error message (as JSON string)
      try {
        const errorMsg = createTransferErrorMessage(transferId, errorMessage);
        dataChannel.send(errorMsg);
      } catch (e) {
        // Ignore send errors during cleanup
        logger.warn('Failed to send error message to peer');
      }

      progressManager.errorTransfer(errorMessage);
      
      // Clean up on error only
      cleanup();
      cleanupFnRef.current = null;
      
      throw error;
    }
    // NOTE: Event listener intentionally NOT cleaned up here - it will be cleaned up when:
    // 1. Transfer completes (in sendBatch when bytesTransferred >= file.size)
    // 2. Component unmounts (via useEffect cleanup)
    // 3. Error occurs (in catch block above)
  }, [config.role, hostPeer, progressManager, logger, sendBatch, debugLogger, getAdaptiveThreshold]);

  // Cancel transfer
  const cancelTransfer = useCallback((transferId?: string) => {
    if (config.role !== 'host') return;

    const state = transferStateRef.current;
    if (state.isActive) {
      state.isCancelled = true;
      state.isActive = false;
      debugLogger.logTransferCancel();
      progressManager.errorTransfer('Transfer cancelled');

      // Clean up event listener
      if (cleanupFnRef.current) {
        cleanupFnRef.current();
        cleanupFnRef.current = null;
      }

      // Complete state cleanup
      setTimeout(() => {
        resetTransferState();
      }, 100);
    }
  }, [config.role, debugLogger, progressManager, resetTransferState]);

  const clearTransfer = useCallback(() => {
    setReceivedFile(null);
    setReceivedFileName(null);
    setAckProgress(null);
    transferBuffersRef.current.clear();
    transferInfoRef.current.clear();
    transferTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    transferTimeoutsRef.current.clear();
    clearMessageQueue();
    progressManager.clearTransfer();
    resetTransferState();
  }, [progressManager, clearMessageQueue, resetTransferState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up event listener if component unmounts during transfer
      if (cleanupFnRef.current) {
        cleanupFnRef.current();
        cleanupFnRef.current = null;
      }

      // Clear all timeouts
      transferTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      transferTimeoutsRef.current.clear();

      // Reset transfer state
      resetTransferState();
    };
  }, [resetTransferState]);

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