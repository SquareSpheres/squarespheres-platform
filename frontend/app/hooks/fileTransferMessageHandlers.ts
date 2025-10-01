'use client';

import { useCallback, useRef } from 'react';
import {
  MESSAGE_TYPES,
  decodeBinaryMessage,
  createLogger,
  verifyChunkHash
} from './fileTransferUtils';

interface MessageHandlerContext {
  role: 'host' | 'client';
  debug?: boolean;
  onFileStart: (transferId: string, fileName: string, fileSize: number, fileHash?: string) => Promise<void>;
  onFileChunk: (transferId: string, chunkIndex: number, chunkData: Uint8Array) => Promise<void>;
  onFileComplete: (transferId: string) => Promise<void>;
  onFileError: (transferId: string, error: string) => void;
  onRequestChunks: (transferId: string, missingChunks: number[]) => void;
  onUpdateTotalChunks?: (transferId: string, actualTotalChunks: number) => void;
  hasActiveTransfer?: (transferId: string) => boolean;
  onChunkSizeNegotiation?: (clientId: string, chunkSize: number) => void;
  dataChannel?: RTCDataChannel;
}

export function useFileTransferMessageHandlers(context: MessageHandlerContext) {
  const logger = createLogger(context.role, context.debug);
  
  // Track transfers that are currently being initialized
  const initializingTransfersRef = useRef<Set<string>>(new Set());
  
  // Queue chunks that arrive during initialization
  const pendingChunksRef = useRef<Map<string, Array<{
    chunkIndex: number;
    chunkData: Uint8Array;
    metadata: any;
    timestamp: number;
  }>>>(new Map());
  
  // Clean up old pending messages (older than 30 seconds)
  const cleanupOldPendingMessages = useCallback(() => {
    const now = Date.now();
    const maxAge = 30000; // 30 seconds
    
    const entries = Array.from(pendingChunksRef.current.entries());
    for (const [transferId, chunks] of entries) {
      const hasOldChunks = chunks.some((chunk: any) => now - chunk.timestamp > maxAge);
      if (hasOldChunks) {
        logger.warn(`Cleaning up old pending messages for transfer ${transferId}`);
        pendingChunksRef.current.delete(transferId);
      }
    }
  }, [logger]);

  const handleBinaryMessage = useCallback(async (data: ArrayBuffer) => {
    // Clean up old pending messages periodically
    cleanupOldPendingMessages();
    
    const binaryMessage = decodeBinaryMessage(data);
    if (!binaryMessage) {
      logger.error('Failed to decode binary message');
      return;
    }
    
    logger.log('Decoded binary message:', {
      type: binaryMessage.type,
      transferId: binaryMessage.transferId,
      dataLength: binaryMessage.data.length
    });
    
    switch (binaryMessage.type) {
      case MESSAGE_TYPES.FILE_START: {
        logger.log('Received FILE_START message:', { transferId: binaryMessage.transferId });
        
        let metadata, fileName, fileSize, transferId, fileHash, integrityChecks;
        
        try {
          metadata = JSON.parse(new TextDecoder().decode(binaryMessage.data));
          ({ fileName, fileSize, transferId, fileHash, integrityChecks } = metadata);
          
          logger.log('FILE_START metadata parsed:', { fileName, fileSize, transferId, hasFileHash: !!fileHash });
          
        } catch (parseError) {
          logger.error('Failed to parse FILE_START metadata:', parseError);
          context.onFileError(binaryMessage.transferId, `FILE_START metadata parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
          return;
        }
        
        if (typeof fileSize !== 'number' || fileSize <= 0) {
          logger.error('Invalid fileSize:', fileSize);
          context.onFileError(transferId, 'Invalid file size');
          return;
        }
        
        logger.log('File transfer started (binary):', { 
          fileName, 
          fileSize, 
          transferId, 
          integrityChecks: !!integrityChecks,
          hasFileHash: !!fileHash 
        });
        
        try {
          // Mark transfer as initializing
          initializingTransfersRef.current.add(transferId);
          
          await context.onFileStart(transferId, fileName, fileSize, fileHash);
          logger.log('FILE_START processing completed successfully for transfer:', transferId);
          
          // Mark initialization complete
          initializingTransfersRef.current.delete(transferId);
          
          // Process any chunks that arrived during initialization
          const pendingChunks = pendingChunksRef.current.get(transferId);
          if (pendingChunks && pendingChunks.length > 0) {
            logger.log(`Processing ${pendingChunks.length} queued messages for transfer ${transferId}`);
            
            // Sort chunks by index to process in order (FILE_END has index -1, so it goes last)
            pendingChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
            
            for (const chunk of pendingChunks) {
              if (chunk.chunkIndex === -1) {
                // This is a queued FILE_END message
                logger.log(`Processing queued FILE_END for transfer ${transferId}`);
                await context.onFileComplete(transferId);
              } else {
                // This is a regular chunk
                logger.log(`Processing queued chunk ${chunk.chunkIndex} for transfer ${transferId}`);
                await context.onFileChunk(transferId, chunk.chunkIndex, chunk.chunkData);
              }
            }
            
            // Clear processed chunks
            pendingChunksRef.current.delete(transferId);
          }
          
        } catch (error) {
          logger.error('FILE_START processing failed for transfer:', transferId, error);
          // Remove from initializing set on error
          initializingTransfersRef.current.delete(transferId);
          // Clear any pending chunks on error
          pendingChunksRef.current.delete(transferId);
          context.onFileError(transferId, `FILE_START processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return;
        }
        break;
      }
      
      case MESSAGE_TYPES.FILE_CHUNK: {
        // Parse binary chunk message with embedded metadata first
        const data = binaryMessage.data;
        
        if (data.length < 4) {
          logger.error('Invalid chunk message: too short');
          return;
        }
        
        // Read metadata length (first 4 bytes)
        const metadataLengthView = new DataView(data.buffer, data.byteOffset, 4);
        const metadataLength = metadataLengthView.getUint32(0, true); // little-endian
        
        if (data.length < 4 + metadataLength) {
          logger.error('Invalid chunk message: metadata length mismatch');
          return;
        }
        
        // Extract metadata
        const metadataBytes = data.slice(4, 4 + metadataLength);
        const metadataJson = new TextDecoder().decode(metadataBytes);
        
        try {
          const metadata = JSON.parse(metadataJson);
          const { chunkIndex, totalChunks, dataLength, chunkHash } = metadata;
          
          // Extract chunk data
          const chunkData = data.slice(4 + metadataLength);
          
          if (chunkData.length !== dataLength) {
            logger.error('Chunk data length mismatch:', { expected: dataLength, actual: chunkData.length });
            return;
          }
          
          // Verify chunk integrity if hash is provided
          if (chunkHash) {
            const isValid = await verifyChunkHash(chunkData, chunkHash);
            if (!isValid) {
              logger.error('Chunk hash verification failed:', { 
                transferId: binaryMessage.transferId, 
                chunkIndex,
                expectedHash: chunkHash.substring(0, 16) + '...',
                actualDataLength: chunkData.length
              });
              context.onFileError(
                binaryMessage.transferId, 
                `Chunk ${chunkIndex} integrity verification failed - data corruption detected`
              );
              return;
            }
            logger.log('Chunk hash verified successfully:', { chunkIndex });
          }
          
          // Check if transfer is still being initialized
          if (initializingTransfersRef.current.has(binaryMessage.transferId)) {
            logger.log(`Queueing chunk ${chunkIndex} for transfer ${binaryMessage.transferId} (initialization in progress)`);
            
            // Add to pending chunks queue
            let pendingChunks = pendingChunksRef.current.get(binaryMessage.transferId);
            if (!pendingChunks) {
              pendingChunks = [];
              pendingChunksRef.current.set(binaryMessage.transferId, pendingChunks);
            }
            
            pendingChunks.push({
              chunkIndex,
              chunkData,
              metadata,
              timestamp: Date.now()
            });
            
            return; // Don't process now, will be processed after initialization
          }
          
          // Check if we have no record of this transfer at all
          const hasPendingChunks = pendingChunksRef.current.has(binaryMessage.transferId);
          if (!hasPendingChunks && chunkIndex === 0) {
            logger.warn(`Received chunk 0 for unknown transfer ${binaryMessage.transferId}. FILE_START may have been lost. Creating emergency queue.`);
            
            // Create emergency pending queue and wait briefly for FILE_START
            const pendingChunks = [{
              chunkIndex,
              chunkData,
              metadata,
              timestamp: Date.now()
            }];
            pendingChunksRef.current.set(binaryMessage.transferId, pendingChunks);
            
            // Give FILE_START a brief chance to arrive
            setTimeout(() => {
              if (pendingChunksRef.current.has(binaryMessage.transferId) && !initializingTransfersRef.current.has(binaryMessage.transferId)) {
                logger.error(`Emergency timeout: FILE_START never arrived for transfer ${binaryMessage.transferId}`);
                pendingChunksRef.current.delete(binaryMessage.transferId);
                context.onFileError(binaryMessage.transferId, 'Chunks received but FILE_START never arrived. Transfer appears to be corrupted.');
              }
            }, 1000); // 1 second timeout
            
            return;
          }
          
          logger.log('Processing binary chunk:', { 
            transferId: binaryMessage.transferId, 
            chunkIndex, 
            totalChunks, 
            dataLength,
            hashVerified: !!chunkHash
          });
          
          await context.onFileChunk(binaryMessage.transferId, chunkIndex, chunkData);
          
        } catch (parseError) {
          logger.error('Failed to parse chunk metadata:', parseError);
          context.onFileError(binaryMessage.transferId, 'Invalid chunk metadata');
        }
        break;
      }
      
      case MESSAGE_TYPES.FILE_END: {
        const metadata = JSON.parse(new TextDecoder().decode(binaryMessage.data));
        const { transferId, actualTotalChunks, fileSize } = metadata;
        
        logger.log('File transfer end message received:', { 
          transferId, 
          actualTotalChunks, 
          fileSize 
        });
        
        // Check if we have any record of this transfer at all
        const hasInitializingTransfer = initializingTransfersRef.current.has(transferId);
        const hasPendingChunks = pendingChunksRef.current.has(transferId);
        const hasActiveTransfer = context.hasActiveTransfer ? context.hasActiveTransfer(transferId) : false;
        
        if (!hasInitializingTransfer && !hasPendingChunks && !hasActiveTransfer) {
          // Instead of erroring, queue the FILE_END message and wait for FILE_START
          logger.warn(`FILE_END received for unknown transfer ${transferId}. Queueing until FILE_START arrives.`);
          
          // Store the FILE_END message to process after FILE_START
          if (!pendingChunksRef.current.has(transferId)) {
            pendingChunksRef.current.set(transferId, []);
          }
          
          // Add a special marker for FILE_END
          const pendingChunks = pendingChunksRef.current.get(transferId);
          if (pendingChunks) {
            pendingChunks.push({
              chunkIndex: -1, // Special marker for FILE_END
              chunkData: new Uint8Array(0),
              metadata: { type: 'FILE_END', actualTotalChunks, fileSize },
              timestamp: Date.now()
            });
          }
          return;
        }
        
        // Log what we found for debugging
        logger.log('FILE_END validation passed:', {
          transferId,
          hasInitializingTransfer,
          hasPendingChunks,
          hasActiveTransfer
        });
        
        // Update the streaming state with the actual total chunks before completion
        if (context.onUpdateTotalChunks) {
          context.onUpdateTotalChunks(transferId, actualTotalChunks);
        }
        
        // Add a small delay to allow any in-flight chunks to arrive
        setTimeout(async () => {
          logger.log('Processing FILE_END after delay to allow in-flight chunks');
          
          // Check if the transfer is still being initialized
          if (initializingTransfersRef.current.has(transferId)) {
            logger.error(`FILE_END received for transfer ${transferId} that is still initializing! This indicates a race condition.`);
            // Remove from initializing set and proceed, but this is concerning
            initializingTransfersRef.current.delete(transferId);
          }
          
          // Check if transfer already completed (auto-completion may have happened)
          const stillHasActiveTransfer = context.hasActiveTransfer ? context.hasActiveTransfer(transferId) : false;
          if (!stillHasActiveTransfer) {
            logger.log(`FILE_END: Transfer ${transferId} already completed (likely via auto-completion). Skipping FILE_END completion.`);
            
            // Clean up any remaining pending chunks
            if (pendingChunksRef.current.has(transferId)) {
              const remainingChunks = pendingChunksRef.current.get(transferId);
              logger.log(`FILE_END: Clearing ${remainingChunks?.length} remaining pending chunks for completed transfer ${transferId}`);
              pendingChunksRef.current.delete(transferId);
            }
            
            return; // Transfer already completed, nothing to do
          }
          
          // Clean up any remaining pending chunks for this transfer
          if (pendingChunksRef.current.has(transferId)) {
            const remainingChunks = pendingChunksRef.current.get(transferId);
            logger.warn(`FILE_END: Clearing ${remainingChunks?.length} unprocessed pending chunks for transfer ${transferId}`);
            pendingChunksRef.current.delete(transferId);
          }
          
          try {
            await context.onFileComplete(transferId);
          } catch (error) {
            logger.error(`FILE_END completion failed for transfer ${transferId}:`, error);
            context.onFileError(transferId, `FILE_END completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }, 200); // 200ms delay
        
        break;
      }
      
      case MESSAGE_TYPES.FILE_ERROR: {
        const errorMessage = new TextDecoder().decode(binaryMessage.data);
        logger.error('File transfer error (binary):', { 
          transferId: binaryMessage.transferId, 
          error: errorMessage 
        });
        
        // Clean up any pending chunks for this transfer
        if (pendingChunksRef.current.has(binaryMessage.transferId)) {
          const pendingChunks = pendingChunksRef.current.get(binaryMessage.transferId);
          logger.warn(`FILE_ERROR: Clearing ${pendingChunks?.length} pending chunks for transfer ${binaryMessage.transferId}`);
          pendingChunksRef.current.delete(binaryMessage.transferId);
        }
        
        // Remove from initializing set if it's there
        initializingTransfersRef.current.delete(binaryMessage.transferId);
        
        context.onFileError(binaryMessage.transferId, errorMessage);
        break;
      }
      
      case MESSAGE_TYPES.CHUNK_SIZE_NEGOTIATION: {
        logger.log('Received chunk size negotiation message');
        
        try {
          const negotiationData = JSON.parse(new TextDecoder().decode(binaryMessage.data));
          const { chunkSize, deviceType } = negotiationData;
          
          logger.log('Chunk size negotiation received:', { chunkSize, deviceType });
          
          // Only hosts handle chunk size negotiation
          if (context.role === 'host' && context.onChunkSizeNegotiation) {
            // Extract client ID from the connection (this is a bit hacky but works)
            const clientId = 'default'; // For now, use default client ID
            context.onChunkSizeNegotiation(clientId, chunkSize);
          }
          
        } catch (parseError) {
          logger.error('Failed to parse chunk size negotiation:', parseError);
        }
        break;
      }
      
      default:
        logger.warn('Unknown binary message type:', binaryMessage.type);
    }
  }, [context, logger, cleanupOldPendingMessages]);



  const handleMessage = useCallback(async (data: string | ArrayBuffer | Blob) => {
    logger.log('Received data:', typeof data,
      data instanceof ArrayBuffer ? `ArrayBuffer(${data.byteLength})` :
      data instanceof Blob ? `Blob(${data.size}) - converting to ArrayBuffer` :
      'string'
    );

    // Handle string messages for ping/pong only
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        // Ping/pong messages are no longer handled (network monitoring removed)
        if (parsed.type === 'ping' || parsed.type === 'pong') {
          return;
        }
      } catch {
        // Not a valid JSON ping/pong message
      }
      logger.error('Unsupported string message format - only ping/pong supported');
      return;
    }

    // Handle binary protocol (ArrayBuffer or Blob)
    if (data instanceof ArrayBuffer) {
      await handleBinaryMessage(data);
    } else if (data instanceof Blob) {
      // Convert Blob to ArrayBuffer
      try {
        const arrayBuffer = await data.arrayBuffer();
        await handleBinaryMessage(arrayBuffer);
      } catch (error) {
        logger.error('Failed to convert Blob to ArrayBuffer:', error);
      }
    } else {
      logger.error('Unsupported message format - only binary protocol and ping/pong supported:', typeof data);
    }
  }, [handleBinaryMessage, logger]);

  return {
    handleMessage
  };
}
