'use client';

import { useCallback, useState, useEffect } from 'react';
import { useWebRTCHostPeer } from './useWebRTCHostPeer';
import { useWebRTCClientPeer } from './useWebRTCClientPeer';
import { useTransferProgress } from './useTransferProgress';
import { useFileStorageManager } from './fileStorageManager';
import { useTransferRetryManager } from './transferRetryManager';
import { useFileTransferMessageHandlers } from './fileTransferMessageHandlers';
import { useErrorManager, FileTransferErrorType, ErrorSeverity } from './errorManager';
import { useNetworkPerformanceMonitor } from './networkPerformanceMonitor';
import { useAdaptiveChunkManager } from './adaptiveChunkManager';
import { WebRTCPeerConfig } from './webrtcTypes';
import { getDataChannelMaxMessageSize } from './webrtcUtils';
import { DEFAULT_CHUNK_SIZE, createLogger, MESSAGE_TYPES, encodeBinaryMessage, calculateChunkHash, calculateFileHash } from './fileTransferUtils';

interface FileTransferCallbacks {
  onProgress?: (progress: any) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;
}

export function useFileTransferCore(
  config: WebRTCPeerConfig & { debug?: boolean } & FileTransferCallbacks
) {
  const logger = createLogger(config.role, config.debug);
  
  // Core state
  const [receivedFile, setReceivedFile] = useState<Blob | null>(null);
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null);
  const [receivedFileHandle, setReceivedFileHandle] = useState<FileSystemFileHandle | null>(null);
  
  
  // Decomposed hooks
  const progressManager = useTransferProgress({
    onProgress: config.onProgress,
    onComplete: config.onComplete,
    onError: config.onError
  });
  
  const storageManager = useFileStorageManager(config.role, config.debug);
  const retryManager = useTransferRetryManager(config.role, config.debug);
  const errorManager = useErrorManager(config.role, config.debug);
  const networkMonitor = useNetworkPerformanceMonitor(config.role, config.debug);
  
  // Initialize chunk manager with WebRTC data channel size limits
  // We'll update this when the data channel becomes available
  const chunkManager = useAdaptiveChunkManager(config.role, config.debug);
  
  // Message handler callbacks
  const handleFileStart = useCallback(async (transferId: string, fileName: string, fileSize: number, fileHash?: string) => {
    logger.log('Starting file transfer:', { fileName, fileSize, transferId, hasFileHash: !!fileHash });
    
    // Start tracking this transfer with correlation ID
    const correlationId = errorManager.startTransfer(transferId, fileName, fileSize);
    
    setReceivedFileName(fileName);
    progressManager.startTransfer(fileName, fileSize);
    
    try {
      // Validate file size
      if (fileSize <= 0 || fileSize > 10 * 1024 * 1024 * 1024) { // 10GB limit
        throw errorManager.createError(
          transferId,
          FileTransferErrorType.VALIDATION,
          `Invalid file size: ${fileSize} bytes`,
          { fileName, fileSize }
        );
      }
      
      const currentChunkSize = chunkManager.getCurrentChunkSize();
      const totalChunks = Math.ceil(fileSize / currentChunkSize);
      errorManager.updateMetrics(transferId, { totalChunks });
      
      const { fileHandle, isResuming, resumedState } = await storageManager.initializeStorage(
        transferId, fileName, fileSize, totalChunks, {
          fileHash,
          resumeIfPossible: true,
          adaptiveChunking: true,
          currentChunkSize
        }
      );
      
      // If resuming, log the progress
      if (isResuming && resumedState) {
        const progress = resumedState.receivedChunks.size / resumedState.totalChunks;
        logger.log('Transfer resumption detected:', {
          transferId,
          progress: `${(progress * 100).toFixed(1)}%`,
          resumedChunks: resumedState.receivedChunks.size,
          totalChunks: resumedState.totalChunks,
          attempt: resumedState.resumeAttempts
        });
        
        // Update progress manager with resumed state
        progressManager.updateBytesTransferred(resumedState.bytesReceived);
      }
      
      if (fileHandle) {
        setReceivedFileHandle(fileHandle);
      }
      
      // Store file hash for final verification if provided
      if (fileHash) {
        storageManager.storeFileHash(transferId, fileHash);
        logger.log('File hash stored for final verification');
      }
      
    } catch (error) {
      const structuredError = error instanceof Error && 'correlationId' in error 
        ? error as any // Already a structured error
        : errorManager.createError(
            transferId,
            FileTransferErrorType.STORAGE,
            error instanceof Error ? error.message : 'Storage initialization failed',
            { fileName, fileSize },
            error instanceof Error ? error : undefined
          );
      
      progressManager.failTransfer(structuredError.message);
      errorManager.completeTransfer(transferId, 'failed', structuredError);
      
      // Clean up any partially initialized storage state to prevent orphaned chunks
      await storageManager.cleanupStorage(transferId);
    }
  }, [logger, progressManager, storageManager, errorManager, chunkManager]);
  
  const handleFileComplete = useCallback(async (transferId: string) => {
    logger.log('Completing file transfer:', transferId);
    
    const result = await storageManager.finalizeStorage(transferId);
    
    if (!result.isComplete) {
      if (result.missingChunks && result.missingChunks.length > 0) {
        const errorMessage = `Missing ${result.missingChunks.length} chunks: ${result.missingChunks.join(', ')}`;
        progressManager.failTransfer(errorMessage);
        return;
      }
      
      // Check for hash verification failure
      if (result.hashVerified === false) {
        progressManager.failTransfer('File integrity verification failed - file may be corrupted');
        return;
      }
      
      progressManager.failTransfer('Failed to finalize file storage');
      return;
    }
    
    if (result.file) {
      setReceivedFile(result.file);
    }
    
    if (result.fileName) {
      setReceivedFileName(result.fileName);
    }
    
    // Log integrity verification result and update metrics
    if (result.hashVerified === true) {
      logger.log('File transfer completed with successful integrity verification');
      errorManager.updateMetrics(transferId, {
        integrityChecksPassed: (errorManager.getMetrics(transferId)?.integrityChecksPassed || 0) + 1
      });
    } else if (result.hashVerified === false) {
      logger.warn('File transfer completed but integrity verification failed');
      errorManager.updateMetrics(transferId, {
        integrityChecksFailed: (errorManager.getMetrics(transferId)?.integrityChecksFailed || 0) + 1
      });
    } else {
      logger.log('File transfer completed (no integrity verification available)');
    }
    
    progressManager.completeTransfer();
    
    // Complete transfer tracking with success metrics
    errorManager.completeTransfer(transferId, 'completed');
    
    // Clean up
    await storageManager.cleanupStorage(transferId);
    retryManager.clearRetryQueue(transferId);
  }, [logger, storageManager, progressManager, retryManager, errorManager]);
  
  const handleFileChunk = useCallback(async (transferId: string, chunkIndex: number, chunkData: Uint8Array) => {
    logger.log(`Processing chunk ${chunkIndex} for transfer ${transferId} (${chunkData.length} bytes)`);
    
    try {
      const success = await storageManager.storeChunk(transferId, chunkIndex, chunkData);
      
      if (!success) {
        // If storage failed, it could mean FILE_START wasn't processed or failed
        // Log detailed error and potentially request FILE_START again
        logger.error(`❌ FAILED to store chunk ${chunkIndex} for transfer ${transferId}. Storage may not be initialized.`);
        
        // Track chunk failure
        errorManager.updateMetrics(transferId, {
          chunkFailures: (errorManager.getMetrics(transferId)?.chunkFailures || 0) + 1
        });
        
        const chunkError = errorManager.createError(
          transferId,
          FileTransferErrorType.STORAGE,
          `Failed to store chunk ${chunkIndex} - transfer may not be properly initialized`,
          { chunkIndex, dataSize: chunkData.length }
        );
        
        retryManager.addToRetryQueue(transferId, chunkIndex);
        return;
      }
      
      logger.log(`✅ Successfully stored chunk ${chunkIndex} for transfer ${transferId}`);
      
      // Update metrics for successful chunk storage
      errorManager.updateMetrics(transferId, { 
        bytesTransferred: (errorManager.getMetrics(transferId)?.bytesTransferred || 0) + chunkData.length,
        chunksTransferred: (errorManager.getMetrics(transferId)?.chunksTransferred || 0) + 1,
        integrityChecksPassed: (errorManager.getMetrics(transferId)?.integrityChecksPassed || 0) + 1
      });
      
      progressManager.updateBytesTransferred(chunkData.length);
      retryManager.removeFromRetryQueue(transferId, chunkIndex);
      
      // Check if transfer is complete - but don't rely solely on totalChunks due to adaptive chunking
      const streamingState = storageManager.getStreamingState(transferId);
      if (streamingState && streamingState.receivedChunks === streamingState.totalChunks) {
        // Only auto-complete if the totalChunks seems reasonable (not a large estimate)
        if (streamingState.totalChunks <= streamingState.receivedChunks + 10) {
          logger.log(`Auto-completing transfer based on chunk count: ${streamingState.receivedChunks}/${streamingState.totalChunks}`);
          await handleFileComplete(transferId);
        } else {
          logger.log(`Potential totalChunks inconsistency detected: ${streamingState.receivedChunks}/${streamingState.totalChunks}. Waiting for FILE_END message.`);
        }
      }
    } catch (error) {
      const structuredError = errorManager.createError(
        transferId,
        FileTransferErrorType.PROTOCOL,
        `Chunk processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { chunkIndex, dataSize: chunkData.length },
        error instanceof Error ? error : undefined
      );
      
      errorManager.updateMetrics(transferId, {
        chunkFailures: (errorManager.getMetrics(transferId)?.chunkFailures || 0) + 1
      });
      
      logger.error('Chunk processing failed:', structuredError);
    }
  }, [logger, storageManager, progressManager, retryManager, errorManager, handleFileComplete]);
  
  const handleFileError = useCallback((transferId: string, error: string) => {
    logger.error(`File transfer error for ${transferId}: ${error}`);
    
    // Create structured error with appropriate classification
    let errorType = FileTransferErrorType.PROTOCOL;
    if (error.includes('cancelled')) {
      errorType = FileTransferErrorType.USER_CANCELLED;
    } else if (error.includes('permission')) {
      errorType = FileTransferErrorType.PERMISSION;
    } else if (error.includes('integrity') || error.includes('hash')) {
      errorType = FileTransferErrorType.INTEGRITY;
    } else if (error.includes('network') || error.includes('connection')) {
      errorType = FileTransferErrorType.NETWORK;
    }
    
    const structuredError = errorManager.createError(
      transferId,
      errorType,
      error
    );
    
    progressManager.failTransfer(error);
    errorManager.completeTransfer(transferId, 'failed', structuredError);
    
    // Clean up
    storageManager.cleanupStorage(transferId);
    retryManager.clearRetryQueue(transferId);
  }, [logger, progressManager, storageManager, retryManager, errorManager]);
  
  const handleRequestChunks = useCallback((transferId: string, missingChunks: number[]) => {
    logger.log('Received chunk request:', { transferId, missingChunks });
    // This will be handled by the host sending logic
  }, [logger]);
  
  const handleUpdateTotalChunks = useCallback((transferId: string, actualTotalChunks: number) => {
    logger.log('Updating totalChunks from FILE_END message:', { transferId, actualTotalChunks });
    storageManager.updateTotalChunks(transferId, actualTotalChunks);
  }, [logger, storageManager]);

  const handleHasActiveTransfer = useCallback((transferId: string) => {
    return storageManager.hasActiveTransfer(transferId);
  }, [storageManager]);
  
  // Message handlers
  const messageHandlers = useFileTransferMessageHandlers({
    role: config.role,
    debug: config.debug,
    onFileStart: handleFileStart,
    onFileChunk: handleFileChunk,
    onFileComplete: handleFileComplete,
    onFileError: handleFileError,
    onRequestChunks: handleRequestChunks,
    onUpdateTotalChunks: handleUpdateTotalChunks,
    hasActiveTransfer: handleHasActiveTransfer,
    networkMonitor
    // dataChannel will be passed when handling messages
  });
  
  // WebRTC peers
  const hostPeer = useWebRTCHostPeer({
    ...config,
    onChannelMessage: messageHandlers.handleMessage,
    onDataChannelReady: (maxMessageSize: number) => {
      logger.log(`WebRTC data channel ready, maxMessageSize: ${maxMessageSize} bytes`);
      chunkManager.updateMaxChunkSize(maxMessageSize);
    },
  });
  
  const clientPeer = useWebRTCClientPeer({
    ...config,
    onChannelMessage: messageHandlers.handleMessage,
    onDataChannelReady: (maxMessageSize: number) => {
      logger.log(`WebRTC data channel ready, maxMessageSize: ${maxMessageSize} bytes`);
      chunkManager.updateMaxChunkSize(maxMessageSize);
    },
  });

  const activePeer = config.role === 'host' ? hostPeer : clientPeer;
  
  // Smart backpressure handling
  const handleBackpressure = useCallback(async (clientId?: string) => {
    if (config.role !== 'host') return;
    
    // Get the appropriate data channel for monitoring
    let dataChannel: RTCDataChannel | null = null;
    
    if (clientId) {
      // Get specific client's data channel
      const clientConn = (hostPeer as any).clientConnectionsRef?.current?.get(clientId);
      dataChannel = clientConn?.dc;
    } else {
      // For broadcast, get the first available data channel
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
      // Fallback to minimal delay if no data channel available
      await new Promise(resolve => setTimeout(resolve, 1));
      return;
    }
    
    const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB buffer limit
    const MIN_BUFFER_SIZE = MAX_BUFFER_SIZE * 0.25; // 256KB before resuming
    
    // If buffer is getting full, wait for it to drain
    if (dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
      logger.log(`Buffer full (${Math.round(dataChannel.bufferedAmount / 1024)}KB), waiting for drain...`);
      
      return new Promise<void>((resolve) => {
        const checkBuffer = () => {
          if (!dataChannel || dataChannel.bufferedAmount < MIN_BUFFER_SIZE) {
            logger.log(`Buffer drained to ${Math.round((dataChannel?.bufferedAmount || 0) / 1024)}KB, resuming`);
            resolve();
          } else {
            setTimeout(checkBuffer, 10); // Check every 10ms
          }
        };
        checkBuffer();
      });
    } else {
      // Small adaptive delay based on current buffer level
      const bufferRatio = dataChannel.bufferedAmount / MAX_BUFFER_SIZE;
      const delay = Math.floor(bufferRatio * 20); // 0-20ms delay based on buffer fullness
      
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }, [config.role, hostPeer, logger]);
  
  // File sending (host only)
  const sendFile = useCallback(async (file: File, clientId?: string) => {
    if (config.role !== 'host') {
      throw new Error('sendFile can only be called on host');
    }

    const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Start with current adaptive chunk size
    let currentChunkSize = chunkManager.getCurrentChunkSize();
    let totalChunks = Math.ceil(file.size / currentChunkSize);
    
    logger.log('Starting file transfer:', {
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
      transferId,
      clientId: clientId || 'all clients'
    });
    
    progressManager.startTransfer(file.name, file.size);

    try {
      // Calculate file hash for integrity verification
      logger.log('Calculating file hash for integrity verification...');
      const fileHash = await calculateFileHash(file);
      logger.log('File hash calculated:', { fileHash: fileHash.substring(0, 16) + '...' });
      
      // Send file start message using binary protocol with hash
      const startMessageData = JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        transferId,
        fileHash: fileHash,
        integrityChecks: true
      });
      const startMessageBytes = new TextEncoder().encode(startMessageData);
      const binaryStartMessage = encodeBinaryMessage(MESSAGE_TYPES.FILE_START, transferId, startMessageBytes);
      
      if (clientId) {
        hostPeer.send(binaryStartMessage, clientId);
      } else {
        hostPeer.send(binaryStartMessage);
      }
      
      logger.log('Sent binary file start message with integrity checks:', { fileName: file.name, fileSize: file.size, transferId });

    // Send file chunks using adaptive sizing and streaming reads
    let bytesTransferred = 0;
    let chunkIndex = 0;
    
    while (bytesTransferred < file.size) {
      // Measure RTT periodically to update network metrics
      if (chunkIndex % 10 === 0) { // Every 10 chunks
        try {
          // Get data channel for RTT measurement
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
          
          if (dataChannel) {
            const rtt = await networkMonitor.measureRTT(dataChannel);
            if (rtt > 0) {
              networkMonitor.updateRTT(rtt);
            }
          }
        } catch (error) {
          logger.warn('RTT measurement failed:', error);
        }
      }
      
      // Update chunk size based on current network conditions
      if (chunkIndex > 0 && chunkIndex % 5 === 0) { // Every 5 chunks after the first
        const metrics = networkMonitor.getMetrics();
        const recommendation = chunkManager.updateChunkSize(metrics);
        currentChunkSize = recommendation.chunkSize;
        
        if (config.debug) {
          logger.log(`Chunk size adapted: ${currentChunkSize} (${recommendation.reasoning})`);
        }
      }
      
      // Calculate chunk boundaries with current adaptive size
      const start = bytesTransferred;
      const end = Math.min(start + currentChunkSize, file.size);
      const actualChunkSize = end - start;
        
      // Stream read chunk from file
      const fileSlice = file.slice(start, end);
      const chunkArrayBuffer = await fileSlice.arrayBuffer();
      const chunk = new Uint8Array(chunkArrayBuffer);

      // Record transfer timing for bandwidth estimation
      const chunkStartTime = performance.now();

      // Calculate chunk hash for integrity verification
      const chunkHash = await calculateChunkHash(chunk);

      // Recalculate total chunks with current position and chunk size
      const remainingBytes = file.size - bytesTransferred;
      const estimatedRemainingChunks = Math.ceil(remainingBytes / currentChunkSize);
      const updatedTotalChunks = chunkIndex + estimatedRemainingChunks;

      // Create binary chunk message with metadata embedded including hash
      const chunkMetadata = JSON.stringify({
        chunkIndex: chunkIndex,
        totalChunks: updatedTotalChunks,
        dataLength: chunk.length,
        chunkHash: chunkHash,
        adaptiveChunkSize: currentChunkSize
      });
      const metadataBytes = new TextEncoder().encode(chunkMetadata);

      // Combine metadata + chunk data in single binary message
      const combinedData = new Uint8Array(metadataBytes.length + 4 + chunk.length);
      const metadataLengthView = new DataView(combinedData.buffer, 0, 4);
      metadataLengthView.setUint32(0, metadataBytes.length, true); // little-endian
      combinedData.set(metadataBytes, 4);
      combinedData.set(chunk, 4 + metadataBytes.length);

      const binaryChunkMessage = encodeBinaryMessage(MESSAGE_TYPES.FILE_CHUNK, transferId, combinedData);

      logger.log(`Sending adaptive chunk ${chunkIndex + 1} (${chunk.length} bytes, size: ${currentChunkSize})`);

      try {
        if (clientId) {
          hostPeer.send(binaryChunkMessage, clientId);
        } else {
          hostPeer.send(binaryChunkMessage);
        }
      } catch (error: any) {
        // Handle WebRTC maxMessageSize errors
        if (error?.message?.includes('maxMessageSize') || error?.message?.includes('Message size')) {
          logger.log(`WebRTC message size limit exceeded (${binaryChunkMessage.byteLength} bytes), reducing chunk size`);
          
          // Reduce chunk size and retry
          const newMaxSize = Math.floor(currentChunkSize * 0.8); // Reduce by 20%
          chunkManager.updateMaxChunkSize(newMaxSize);
          chunkManager.setChunkSize(newMaxSize);
          
          logger.log(`Chunk size reduced to ${newMaxSize}, retrying chunk ${chunkIndex + 1}`);
          
          // Recreate the chunk with the new size
          const retryChunk = chunk.slice(0, newMaxSize);
          const retryChunkHash = await calculateChunkHash(retryChunk);
          const retryMetadataBytes = new TextEncoder().encode(JSON.stringify({
            chunkIndex,
            chunkSize: retryChunk.length,
            chunkHash: retryChunkHash,
            totalChunks: Math.ceil(file.size / newMaxSize)
          }));
          const retryChunkArrayBuffer = new Uint8Array(retryChunk);
          const retryChunkBytes = new Uint8Array(retryMetadataBytes.length + 1 + retryChunkArrayBuffer.length);
          retryChunkBytes.set(retryMetadataBytes, 0);
          retryChunkBytes.set([0], retryMetadataBytes.length); // Null separator
          retryChunkBytes.set(retryChunkArrayBuffer, retryMetadataBytes.length + 1);
          const retryBinaryMessage = encodeBinaryMessage(MESSAGE_TYPES.FILE_CHUNK, transferId, retryChunkBytes);
          
          // Retry with smaller chunk
          if (clientId) {
            hostPeer.send(retryBinaryMessage, clientId);
          } else {
            hostPeer.send(retryBinaryMessage);
          }
        } else {
          throw error; // Re-throw other errors
        }
      }

      // Record chunk transfer timing and update network metrics
      const chunkEndTime = performance.now();
      const transferTime = chunkEndTime - chunkStartTime;
      networkMonitor.recordChunkTransfer(chunk.length, transferTime);

      // Record performance data for adaptive algorithm
      const metrics = networkMonitor.getMetrics();
      chunkManager.recordPerformance(
        currentChunkSize,
        metrics.currentRTT,
        metrics.estimatedBandwidth,
        metrics.averageBufferLevel,
        true // transfer success
      );

      // Update progress
      progressManager.updateBytesTransferred(chunk.length);
      bytesTransferred += chunk.length;
      chunkIndex++;

      // Smart backpressure based on WebRTC buffer levels
      await handleBackpressure(clientId);
    }
      
      // Ensure all chunks are fully transmitted before sending FILE_END
      logger.log('All chunks sent, waiting for buffers to drain before FILE_END...');
      
      // Get data channel for final buffer check
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
      
      // Wait for final buffer drain
      if (dataChannel) {
        while (dataChannel.bufferedAmount > 0) {
          logger.log(`Waiting for buffer drain: ${dataChannel.bufferedAmount} bytes remaining`);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        logger.log('All buffers drained, sending FILE_END');
      } else {
        // Fallback delay if no data channel available
        await new Promise(resolve => setTimeout(resolve, 100));
        logger.log('No data channel available for buffer check, using fallback delay');
      }
      
      // Send FILE_END message to signal completion
      const endMessageData = JSON.stringify({
        transferId,
        actualTotalChunks: chunkIndex, // chunkIndex is 0-based, so last chunk index + 1 = total chunks
        fileSize: file.size
      });
      const endMessageBytes = new TextEncoder().encode(endMessageData);
      const binaryEndMessage = encodeBinaryMessage(MESSAGE_TYPES.FILE_END, transferId, endMessageBytes);
      
      if (clientId) {
        hostPeer.send(binaryEndMessage, clientId);
      } else {
        hostPeer.send(binaryEndMessage);
      }
      
      logger.log('File transfer completed successfully - FILE_END sent');
      progressManager.completeTransfer();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('File transfer failed:', error);
      
      // Send binary error message
      const errorBytes = new TextEncoder().encode(errorMessage);
      const binaryErrorMessage = encodeBinaryMessage(MESSAGE_TYPES.FILE_ERROR, transferId, errorBytes);
      
      if (clientId) {
        hostPeer.send(binaryErrorMessage, clientId);
      } else {
        hostPeer.send(binaryErrorMessage);
      }
      
      progressManager.failTransfer(errorMessage);
    }
  }, [config.role, config.debug, logger, progressManager, hostPeer, handleBackpressure, chunkManager, networkMonitor]);
  
  // Cancel transfer
  const cancelTransfer = useCallback((transferId?: string) => {
    logger.log('Cancelling transfer:', transferId || 'current');
    
    if (config.role === 'host') {
      const cancelErrorMessage = 'Transfer cancelled by host';
      const cancelBytes = new TextEncoder().encode(cancelErrorMessage);
      const binaryCancelMessage = encodeBinaryMessage(
        MESSAGE_TYPES.FILE_ERROR, 
        transferId || 'current', 
        cancelBytes
      );
      
      hostPeer.send(binaryCancelMessage);
    }
    
    progressManager.failTransfer('Transfer cancelled');
  }, [config.role, logger, hostPeer, progressManager]);
  
  // Clear transfer state
  // Resume a transfer from persisted state
  const resumeTransfer = useCallback(async (transferId: string): Promise<boolean> => {
    logger.log('Attempting to resume transfer:', transferId);
    
    try {
      const canResume = await storageManager.canResumeTransfer(transferId);
      if (!canResume) {
        logger.warn('Transfer cannot be resumed:', transferId);
        return false;
      }
      
      const state = await storageManager.loadTransferState(transferId);
      if (!state) {
        logger.error('No persisted state found for transfer:', transferId);
        return false;
      }
      
      // Get missing chunks
      const missingChunks = await storageManager.getMissingChunks(transferId);
      logger.log('Missing chunks for resumption:', {
        transferId,
        missingCount: missingChunks.length,
        totalChunks: state.totalChunks,
        progress: `${((state.totalChunks - missingChunks.length) / state.totalChunks * 100).toFixed(1)}%`
      });
      
      if (missingChunks.length === 0) {
        logger.log('Transfer already complete, finalizing:', transferId);
        await handleFileComplete(transferId);
        return true;
      }
      
      // TODO: Request missing chunks from sender
      // This would typically involve sending a message to the host requesting specific chunks
      logger.log('Would request missing chunks:', missingChunks.slice(0, 10)); // Log first 10
      
      return true;
      
    } catch (error) {
      logger.error('Transfer resumption failed:', error);
      return false;
    }
  }, [logger, storageManager, handleFileComplete]);

  const clearTransfer = useCallback(async () => {
    logger.log('Clearing transfer state');
    
    setReceivedFile(null);
    setReceivedFileName(null);
    setReceivedFileHandle(null);
    
    progressManager.clearTransfer();
    await storageManager.cleanupAllStorage();
    retryManager.clearRetryQueue();
    
    // Clean up error tracking for all transfers
    const activeTransfers = errorManager.getActiveTransfers();
    activeTransfers.forEach(transfer => {
      errorManager.cleanup(transfer.transferId);
    });
    
    // Clean up persisted transfer states
    await storageManager.persistenceManager.cleanupOldStates();
  }, [logger, progressManager, storageManager, retryManager, errorManager]);

  return {
    // Transfer operations
    sendFile,
    cancelTransfer,
    clearTransfer,
    resumeTransfer,
    
    // Transfer state
    transferProgress: progressManager.transferProgress,
    isTransferring: progressManager.isTransferring,
    receivedFile,
    receivedFileName,
    receivedFileHandle,
    
    // Error management and metrics
    getErrorHistory: errorManager.getErrorHistory,
    getTransferMetrics: errorManager.getMetrics,
    getActiveTransfers: errorManager.getActiveTransfers,
    
    // Network performance and adaptive chunking
    getNetworkMetrics: networkMonitor.getMetrics,
    getCurrentChunkSize: chunkManager.getCurrentChunkSize,
    getAdaptationStats: chunkManager.getAdaptationStats,
    
    // Transfer resumption
    canResumeTransfer: storageManager.canResumeTransfer,
    getMissingChunks: storageManager.getMissingChunks,
    loadTransferState: storageManager.loadTransferState,
    
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
  };
}
