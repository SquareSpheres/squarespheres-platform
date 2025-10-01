'use client';

import { useCallback, useRef } from 'react';
import { getMimeType, LARGE_FILE_THRESHOLD, createLogger, verifyFileHash } from './fileTransferUtils';
import { useTransferPersistenceManager, PersistedTransferState } from './transferPersistenceManager';

interface StreamingState {
  chunks: Uint8Array[];
  totalChunks: number;
  receivedChunks: number;
  fileSize: number;
}

interface StorageMetadata {
  fileName: string;
  fileSize: number;
  transferId: string;
}

export function useFileStorageManager(role: 'host' | 'client', debug: boolean = false) {
  const logger = createLogger(role, debug);
  const persistenceManager = useTransferPersistenceManager(role, debug);
  
  // File System Access API writers for large files
  const streamingWritersRef = useRef<Map<string, FileSystemWritableFileStream>>(new Map());
  
  // Streaming chunks state
  const streamingChunksRef = useRef<Map<string, StreamingState>>(new Map());
  
  // Storage metadata
  const streamingMetadataRef = useRef<Map<string, StorageMetadata>>(new Map());
  
  // File hash storage for integrity verification
  const fileHashesRef = useRef<Map<string, string>>(new Map());

  // Check if File System Access API is supported
  const hasFileSystemAccess = useCallback(() => {
    return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  }, []);

  // Initialize storage for a new transfer (with resumption support)
  const initializeStorage = useCallback(async (
    transferId: string,
    fileName: string,
    fileSize: number,
    totalChunks: number,
    options: {
      fileHash?: string;
      resumeIfPossible?: boolean;
      currentChunkSize?: number;
    } = {}
  ): Promise<{ 
    useStreamingStorage: boolean; 
    fileHandle?: FileSystemFileHandle; 
    isResuming?: boolean;
    resumedState?: PersistedTransferState;
  }> => {
    
    // Check for resumable transfer first
    let isResuming = false;
    let resumedState: PersistedTransferState | null = null;
    
    if (options.resumeIfPossible) {
      const canResume = await persistenceManager.canResumeTransfer(transferId);
      if (canResume) {
        resumedState = await persistenceManager.loadTransferState(transferId);
        if (resumedState) {
          isResuming = true;
          
          // Increment resume attempts
          resumedState.resumeAttempts++;
          resumedState.lastResumeTime = Date.now();
          
          logger.log('Resuming transfer:', {
            transferId,
            fileName,
            progress: `${resumedState.receivedChunks.size}/${resumedState.totalChunks}`,
            attempt: resumedState.resumeAttempts
          });
        }
      }
    }
    
    // Store metadata
    streamingMetadataRef.current.set(transferId, { fileName, fileSize, transferId });
    
    // Initialize or restore streaming state
    const currentTotalChunks = resumedState?.totalChunks || totalChunks;
    const streamingState: StreamingState = {
      chunks: new Array(currentTotalChunks),
      totalChunks: currentTotalChunks,
      receivedChunks: resumedState?.receivedChunks.size || 0,
      fileSize
    };
    
    streamingChunksRef.current.set(transferId, streamingState);
    logger.log('Streaming state initialized for transfer:', { 
      transferId, 
      totalChunks: currentTotalChunks, 
      isResuming: isResuming,
      role 
    });
    
    // Also log what's in our maps for debugging
    logger.log('Storage manager state after initialization:', {
      transferId,
      hasStreamingState: streamingChunksRef.current.has(transferId),
      hasMetadata: streamingMetadataRef.current.has(transferId),
      totalManagedTransfers: streamingChunksRef.current.size
    });

    if (role !== 'client') {
      return { 
        useStreamingStorage: false, 
        isResuming, 
        resumedState: resumedState || undefined
      };
    }

    const isLargeFile = fileSize >= LARGE_FILE_THRESHOLD;
    const hasFS = hasFileSystemAccess();

    if (isLargeFile && hasFS) {
      try {
        logger.log(`Large file detected (${Math.round(fileSize / 1024 / 1024)}MB), using File System Access API`);
        
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'All Files',
            accept: { '*/*': [] }
          }]
        });
        
        const writable = await fileHandle.createWritable();
        streamingWritersRef.current.set(transferId, writable);
        
        logger.log('Created file handle for streaming large file');
        
        // Create or update transfer state for persistence
        if (!isResuming) {
          const transferState = persistenceManager.createTransferState(
            transferId, fileName, fileSize, totalChunks, {
              fileHash: options.fileHash,
              chunkSize: options.currentChunkSize,
              storageMethod: 'filesystem',
              fileHandle: fileHandle
            }
          );
          await persistenceManager.saveTransferState(transferState);
        } else if (resumedState) {
          await persistenceManager.saveTransferState(resumedState);
        }
        
        return { useStreamingStorage: true, fileHandle, isResuming, resumedState: resumedState || undefined };
        
      } catch (error) {
        logger.error('User cancelled file save or error:', error);
        throw new Error('User cancelled file save');
      }
    } else if (isLargeFile && !hasFS) {
      // Warn user about memory usage
      const sizeInMB = Math.round(fileSize / 1024 / 1024);
      const proceed = confirm(`Large file detected (${sizeInMB}MB). This will use significant RAM as your browser doesn't support direct disk streaming. Continue?`);
      
      if (!proceed) {
        logger.log('User cancelled large file transfer');
        throw new Error('User cancelled large file transfer');
      }
      
      logger.log('User accepted large file transfer to memory');
    } else {
      logger.log(`Small file (${Math.round(fileSize / 1024)}KB), using memory storage`);
    }

    // Create or update transfer state for persistence
    if (!isResuming) {
        const transferState = persistenceManager.createTransferState(
          transferId, fileName, fileSize, totalChunks, {
            fileHash: options.fileHash,
            chunkSize: options.currentChunkSize,
            storageMethod: 'memory'
          }
        );
      await persistenceManager.saveTransferState(transferState);
    } else if (resumedState) {
      await persistenceManager.saveTransferState(resumedState);
    }
    
    return { useStreamingStorage: false, isResuming, resumedState: resumedState || undefined };
  }, [role, hasFileSystemAccess, logger, persistenceManager]);

  // Store a chunk of data
  const storeChunk = useCallback(async (
    transferId: string,
    chunkIndex: number,
    chunkData: Uint8Array
  ): Promise<boolean> => {
    const streamingState = streamingChunksRef.current.get(transferId);
    
    if (!streamingState) {
      logger.error(`No streaming state found for transfer ${transferId}. This typically means the FILE_START message was not processed properly or failed. Ignoring chunk ${chunkIndex}.`);
      return false;
    }

    // Check if this chunk was already received
    const wasAlreadyReceived = streamingState.chunks[chunkIndex] !== undefined;
    
    // Store chunk in memory
    streamingState.chunks[chunkIndex] = chunkData;
    
    logger.log(`Stored chunk ${chunkIndex} for transfer ${transferId} (${chunkData.length} bytes)`);
    
    // Write chunk directly to file system if using streaming storage
    const writer = streamingWritersRef.current.get(transferId);
    if (writer) {
      try {
        // Convert to a new ArrayBuffer to ensure compatibility
        const newBuffer = new ArrayBuffer(chunkData.byteLength);
        const newView = new Uint8Array(newBuffer);
        newView.set(chunkData);
        await writer.write(newView);
        logger.log(`Wrote chunk ${chunkIndex + 1} to disk (File System Access)`);
      } catch (error) {
        logger.error('Failed to write chunk:', error);
        return false;
      }
    }

    // Increment received chunks counter and update persistence
    if (!wasAlreadyReceived) {
      streamingState.receivedChunks++;
      
      // Update persistence state
      await persistenceManager.markChunkReceived(transferId, chunkIndex, chunkData.length, true);
    }

    return true;
  }, [logger, persistenceManager]);

  // Store file hash for verification
  const storeFileHash = useCallback((transferId: string, fileHash: string) => {
    fileHashesRef.current.set(transferId, fileHash);
    logger.log(`Stored file hash for transfer ${transferId}`);
  }, [logger]);

  // Finalize file storage
  const finalizeStorage = useCallback(async (transferId: string): Promise<{
    file?: Blob;
    fileName?: string;
    isComplete: boolean;
    missingChunks?: number[];
    hashVerified?: boolean;
  }> => {
    const streamingState = streamingChunksRef.current.get(transferId);
    const metadata = streamingMetadataRef.current.get(transferId);
    const expectedFileHash = fileHashesRef.current.get(transferId);
    
    if (!streamingState || !metadata) {
      logger.error(`No streaming state or metadata found for transfer ${transferId}. This suggests FILE_START was never processed or state was cleaned up prematurely.`);
      return { isComplete: false };
    }

    // Check for missing chunks
    const missingChunks: number[] = [];
    for (let i = 0; i < streamingState.totalChunks; i++) {
      if (streamingState.chunks[i] === undefined) {
        missingChunks.push(i);
      }
    }

    if (missingChunks.length > 0) {
      logger.error(`Missing chunks detected (${missingChunks.length}/${streamingState.totalChunks}):`, missingChunks);
      logger.log(`Received chunks: ${streamingState.receivedChunks}, Total expected: ${streamingState.totalChunks}`);
      
      // Log which chunks we DO have for debugging
      const receivedChunks: number[] = [];
      for (let i = 0; i < streamingState.totalChunks; i++) {
        if (streamingState.chunks[i] !== undefined) {
          receivedChunks.push(i);
        }
      }
      logger.log(`Actually received chunks:`, receivedChunks.slice(0, 10), receivedChunks.length > 10 ? `... and ${receivedChunks.length - 10} more` : '');
      
      return { isComplete: false, missingChunks };
    }

    // Handle File System Access API storage
    const writer = streamingWritersRef.current.get(transferId);
    if (writer) {
      try {
        await writer.close();
        streamingWritersRef.current.delete(transferId);
        logger.log('File saved to disk via File System Access API');
        
        // Note: Cannot verify file hash for files saved to disk without re-reading
        // This is a limitation of the File System Access API
        return {
          fileName: metadata.fileName,
          isComplete: true,
          hashVerified: false // Cannot verify disk files without re-reading
        };
      } catch (error) {
        logger.error('Failed to close file:', error);
        return { isComplete: false };
      }
    }

    // For small files or unsupported browsers, create blob from chunks
    const allChunks = streamingState.chunks.filter(chunk => chunk !== undefined);
    const mimeType = getMimeType(metadata.fileName);
    const fileBlob = new Blob(allChunks as BlobPart[], { type: mimeType });
    
    // Verify file hash if provided
    let hashVerified = false;
    if (expectedFileHash) {
      logger.log('Verifying complete file hash...');
      try {
        hashVerified = await verifyFileHash(allChunks, expectedFileHash);
        if (hashVerified) {
          logger.log('File hash verification successful');
        } else {
          logger.error('File hash verification failed - file may be corrupted');
          return { 
            isComplete: false, 
            hashVerified: false 
          };
        }
      } catch (error) {
        logger.error('Error during file hash verification:', error);
        return { isComplete: false, hashVerified: false };
      }
    }
    
    logger.log('File assembled in memory');
    
    return {
      file: fileBlob,
      fileName: metadata.fileName,
      isComplete: true,
      hashVerified
    };
  }, [logger]);

  // Clean up storage for a transfer
  const cleanupStorage = useCallback(async (transferId: string) => {
    const writer = streamingWritersRef.current.get(transferId);
    
    if (writer) {
      try {
        await writer.close();
      } catch (error) {
        logger.error(`Error closing writer for ${transferId}:`, error);
      }
      streamingWritersRef.current.delete(transferId);
    }
    
    streamingChunksRef.current.delete(transferId);
    streamingMetadataRef.current.delete(transferId);
    fileHashesRef.current.delete(transferId);
  }, [logger]);

  // Clean up all storage
  const cleanupAllStorage = useCallback(async () => {
    // Close any open file writers
    const writers = Array.from(streamingWritersRef.current.entries());
    for (const [transferId, writer] of writers) {
      try {
        await writer.close();
      } catch (error) {
        logger.error(`Error closing writer for ${transferId}:`, error);
      }
    }
    
    streamingWritersRef.current.clear();
    streamingChunksRef.current.clear();
    streamingMetadataRef.current.clear();
    fileHashesRef.current.clear();
  }, [logger]);

  // Get streaming state for a transfer
  const getStreamingState = useCallback((transferId: string) => {
    return streamingChunksRef.current.get(transferId);
  }, []);

  // Check if a transfer has active streaming state
  const hasActiveTransfer = useCallback((transferId: string) => {
    return streamingChunksRef.current.has(transferId);
  }, []);

  // Get metadata for a transfer
  const getMetadata = useCallback((transferId: string) => {
    return streamingMetadataRef.current.get(transferId);
  }, []);

  // Update total chunks for a transfer (used when FILE_END provides actual count)
  const updateTotalChunks = useCallback((transferId: string, actualTotalChunks: number) => {
    const streamingState = streamingChunksRef.current.get(transferId);
    if (streamingState) {
      const oldTotalChunks = streamingState.totalChunks;
      streamingState.totalChunks = actualTotalChunks;
      
      // Resize chunks array if needed
      if (actualTotalChunks !== streamingState.chunks.length) {
        const newChunks = new Array(actualTotalChunks);
        // Copy existing chunks
        for (let i = 0; i < Math.min(streamingState.chunks.length, actualTotalChunks); i++) {
          newChunks[i] = streamingState.chunks[i];
        }
        streamingState.chunks = newChunks;
      }
      
      logger.log('Updated totalChunks for transfer:', { 
        transferId, 
        oldTotalChunks, 
        actualTotalChunks,
        receivedChunks: streamingState.receivedChunks
      });
    }
  }, [logger]);

  // Get missing chunks for resumption
  const getMissingChunks = useCallback(async (transferId: string): Promise<number[]> => {
    return await persistenceManager.getMissingChunks(transferId);
  }, [persistenceManager]);

  // Check if transfer can be resumed
  const canResumeTransfer = useCallback(async (transferId: string): Promise<boolean> => {
    return await persistenceManager.canResumeTransfer(transferId);
  }, [persistenceManager]);

  // Load persisted transfer state
  const loadTransferState = useCallback(async (transferId: string): Promise<PersistedTransferState | null> => {
    return await persistenceManager.loadTransferState(transferId);
  }, [persistenceManager]);

  return {
    hasFileSystemAccess,
    initializeStorage,
    storeChunk,
    storeFileHash,
    finalizeStorage,
    cleanupStorage,
    cleanupAllStorage,
    getStreamingState,
    getMetadata,
    updateTotalChunks,
    hasActiveTransfer,
    
    // Resumption support
    getMissingChunks,
    canResumeTransfer,
    loadTransferState,
    persistenceManager
  };
}
