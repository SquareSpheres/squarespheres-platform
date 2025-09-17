'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { useWebRTCHostPeer } from './useWebRTCHostPeer';
import { useWebRTCClientPeer } from './useWebRTCClientPeer';
import { WebRTCPeerConfig } from './webrtcTypes';

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
  receivedFileHandle: FileSystemFileHandle | null;
  
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
}

const CHUNK_SIZE = 16 * 1024; // 16KB chunks for small files
const STREAM_CHUNK_SIZE = 65536; // 64KB chunks for streaming (as per WebRTC docs)

// Binary message format constants
const MESSAGE_TYPES = {
  FILE_START: 0x01,
  FILE_CHUNK: 0x02,
  FILE_END: 0x03,
  FILE_ERROR: 0x04,
} as const;

// Binary message header format (little-endian):
// [4 bytes: message type][4 bytes: transferId length][4 bytes: data length][transferId string][data]
const BINARY_HEADER_SIZE = 12; // 3 * 4 bytes

// Debug logging utility
const createLogger = (role: string, debug: boolean = false) => ({
  log: (...args: any[]) => debug && console.log(`[FileTransfer ${role}]`, ...args),
  error: (...args: any[]) => console.error(`[FileTransfer ${role}]`, ...args),
  warn: (...args: any[]) => console.warn(`[FileTransfer ${role}]`, ...args),
  info: (...args: any[]) => debug && console.info(`[FileTransfer ${role}]`, ...args),
});

// Message type definitions and validation
interface FileStartMessage {
  type: 'file-start';
  fileName: string;
  fileSize: number;
  transferId: string;
}

interface FileChunkMessage {
  type: 'file-chunk';
  transferId: string;
  chunkIndex: number;
  totalChunks: number;
  data?: number[];
}

interface FileErrorMessage {
  type: 'file-error';
  transferId: string;
  error: string;
}

interface RequestChunksMessage {
  type: 'request-chunks';
  transferId: string;
  missingChunks: number[];
}

type FileTransferMessage = FileStartMessage | FileChunkMessage | FileErrorMessage | RequestChunksMessage;

// Message validation functions
function isValidFileStartMessage(message: any): message is FileStartMessage {
  return (
    message &&
    typeof message === 'object' &&
    message.type === 'file-start' &&
    typeof message.fileName === 'string' &&
    typeof message.fileSize === 'number' &&
    message.fileSize > 0 &&
    typeof message.transferId === 'string'
  );
}

function isValidFileChunkMessage(message: any): message is FileChunkMessage {
  return (
    message &&
    typeof message === 'object' &&
    message.type === 'file-chunk' &&
    typeof message.transferId === 'string' &&
    typeof message.chunkIndex === 'number' &&
    message.chunkIndex >= 0 &&
    typeof message.totalChunks === 'number' &&
    message.totalChunks > 0 &&
    (message.data === undefined || Array.isArray(message.data))
  );
}

function isValidFileErrorMessage(message: any): message is FileErrorMessage {
  return (
    message &&
    typeof message === 'object' &&
    message.type === 'file-error' &&
    typeof message.transferId === 'string' &&
    typeof message.error === 'string'
  );
}

function isValidRequestChunksMessage(message: any): message is RequestChunksMessage {
  return (
    message &&
    typeof message === 'object' &&
    message.type === 'request-chunks' &&
    typeof message.transferId === 'string' &&
    Array.isArray(message.missingChunks) &&
    message.missingChunks.every((chunk: any) => typeof chunk === 'number' && chunk >= 0)
  );
}

function isValidFileTransferMessage(message: any): message is FileTransferMessage {
  return isValidFileStartMessage(message) || 
         isValidFileChunkMessage(message) || 
         isValidFileErrorMessage(message) ||
         isValidRequestChunksMessage(message);
}

// Helper functions for binary message encoding/decoding
function encodeBinaryMessage(type: number, transferId: string, data: Uint8Array): ArrayBuffer {
  const transferIdBytes = new TextEncoder().encode(transferId);
  const totalSize = BINARY_HEADER_SIZE + transferIdBytes.length + data.length;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  
  let offset = 0;
  
  // Write message type (4 bytes)
  view.setUint32(offset, type, true); // little-endian
  offset += 4;
  
  // Write transferId length (4 bytes)
  view.setUint32(offset, transferIdBytes.length, true);
  offset += 4;
  
  // Write data length (4 bytes)
  view.setUint32(offset, data.length, true);
  offset += 4;
  
  // Write transferId string
  new Uint8Array(buffer, offset, transferIdBytes.length).set(transferIdBytes);
  offset += transferIdBytes.length;
  
  // Write data
  new Uint8Array(buffer, offset, data.length).set(data);
  
  return buffer;
}

function decodeBinaryMessage(buffer: ArrayBuffer): { type: number; transferId: string; data: Uint8Array } | null {
  if (buffer.byteLength < BINARY_HEADER_SIZE) {
    return null;
  }
  
  const view = new DataView(buffer);
  let offset = 0;
  
  // Read message type (4 bytes)
  const type = view.getUint32(offset, true); // little-endian
  offset += 4;
  
  // Read transferId length (4 bytes)
  const transferIdLength = view.getUint32(offset, true);
  offset += 4;
  
  // Read data length (4 bytes)
  const dataLength = view.getUint32(offset, true);
  offset += 4;
  
  // Validate buffer size
  if (buffer.byteLength < BINARY_HEADER_SIZE + transferIdLength + dataLength) {
    return null;
  }
  
  // Read transferId string
  const transferIdBytes = new Uint8Array(buffer, offset, transferIdLength);
  const transferId = new TextDecoder().decode(transferIdBytes);
  offset += transferIdLength;
  
  // Read data
  const data = new Uint8Array(buffer, offset, dataLength);
  
  return { type, transferId, data };
}

export function useFileTransfer(config: WebRTCPeerConfig & { 
  debug?: boolean;
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;
}): FileTransferApi {
  const [transferProgress, setTransferProgress] = useState<FileTransferProgress | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [receivedFile, setReceivedFile] = useState<Blob | null>(null);
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null);
  const [receivedFileHandle, setReceivedFileHandle] = useState<FileSystemFileHandle | null>(null);
  
  // Create logger instance
  const logger = createLogger(config.role, config.debug);
  
  // StreamSaver ref for dynamic import
  const streamSaverRef = useRef<any>(null);
  
  // Streaming state
  const streamingWritersRef = useRef<Map<string, FileSystemWritableFileStream>>(new Map());
  const streamSaverWritersRef = useRef<Map<string, WritableStream>>(new Map());
  const streamSaverWriterRefs = useRef<Map<string, WritableStreamDefaultWriter>>(new Map());
  const streamingChunksRef = useRef<Map<string, { chunks: Uint8Array[], totalChunks: number, receivedChunks: number }>>(new Map());
  const fileResolversRef = useRef<Map<string, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>>(new Map());
  
  // Binary chunk handling state
  const pendingChunkMetadataRef = useRef<{ chunkIndex: number; totalChunks: number; transferId: string } | null>(null);
  
  // Throttling for progress updates
  const lastProgressUpdateRef = useRef<number>(0);
  const PROGRESS_UPDATE_THROTTLE = 100; // Update at most every 100ms
  
  // Retry mechanism state
  const retryQueueRef = useRef<Map<string, { chunkIndex: number; retryCount: number; maxRetries: number }>>(new Map());
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second delay between retries

  // Initialize StreamSaver dynamically to avoid SSR issues
  useEffect(() => {
    if (typeof window !== 'undefined' && !streamSaverRef.current) {
      import('streamsaver').then((streamSaverModule) => {
        streamSaverRef.current = streamSaverModule.default;
        streamSaverRef.current.mitm = '/mitm.html';
        logger.log('StreamSaver loaded and configured');
      }).catch(error => {
        logger.error('Failed to load StreamSaver:', error);
      });
    }
  }, [logger]);

  // Throttled progress update function with callbacks
  const updateProgressThrottled = useCallback((updateFn: (prev: FileTransferProgress | null) => FileTransferProgress | null) => {
    const now = Date.now();
    if (now - lastProgressUpdateRef.current >= PROGRESS_UPDATE_THROTTLE) {
      const newProgress = updateFn(transferProgress);
      setTransferProgress(newProgress);
      lastProgressUpdateRef.current = now;
      
      // Call progress callback
      if (newProgress && config.onProgress) {
        config.onProgress(newProgress);
      }
    }
  }, [transferProgress, config.onProgress]);

  // Retry mechanism functions
  const addToRetryQueue = useCallback((transferId: string, chunkIndex: number) => {
    const retryKey = `${transferId}-${chunkIndex}`;
    const existing = retryQueueRef.current.get(retryKey);
    
    if (existing) {
      existing.retryCount++;
    } else {
      retryQueueRef.current.set(retryKey, {
        chunkIndex,
        retryCount: 1,
        maxRetries: MAX_RETRIES
      });
    }
    
    logger.log(`Added chunk ${chunkIndex} to retry queue (attempt ${existing ? existing.retryCount : 1}/${MAX_RETRIES})`);
  }, [logger]);

  const removeFromRetryQueue = useCallback((transferId: string, chunkIndex: number) => {
    const retryKey = `${transferId}-${chunkIndex}`;
    retryQueueRef.current.delete(retryKey);
  }, []);

  const handleFileChunk = useCallback(async (data: string | ArrayBuffer | Blob) => {
    console.log(`[FileTransfer ${config.role}] Received data:`, typeof data, data instanceof ArrayBuffer ? `ArrayBuffer(${data.byteLength})` : data instanceof Blob ? `Blob(${data.size})` : data);
    
    // Handle binary messages (ArrayBuffer)
    if (data instanceof ArrayBuffer) {
      const binaryMessage = decodeBinaryMessage(data);
      if (!binaryMessage) {
        console.error(`[FileTransfer ${config.role}] Failed to decode binary message`);
        return;
      }
      
      console.log(`[FileTransfer ${config.role}] Decoded binary message:`, {
        type: binaryMessage.type,
        transferId: binaryMessage.transferId,
        dataLength: binaryMessage.data.length
      });
      
      // Handle different binary message types
      if (binaryMessage.type === MESSAGE_TYPES.FILE_START) {
        // Parse file start metadata from binary data
        const metadata = JSON.parse(new TextDecoder().decode(binaryMessage.data));
        const { fileName, fileSize, transferId } = metadata;
        console.log(`[FileTransfer ${config.role}] File transfer started (binary):`, { fileName, fileSize, transferId });
        
        // Validate fileSize
        if (typeof fileSize !== 'number' || fileSize <= 0) {
          console.error(`[FileTransfer ${config.role}] Invalid fileSize:`, fileSize);
          setTransferProgress(prev => prev ? { ...prev, status: 'error', error: 'Invalid file size' } : null);
          return;
        }
        
        setTransferProgress({
          fileName,
          fileSize,
          bytesTransferred: 0,
          percentage: 0,
          status: 'transferring'
        });
        setReceivedFileName(fileName);
        
        // Calculate total chunks from file size
        const totalChunks = Math.ceil(fileSize / STREAM_CHUNK_SIZE);
        
        // Initialize streaming state
        streamingChunksRef.current.set(transferId, {
          chunks: new Array(totalChunks),
          totalChunks: totalChunks,
          receivedChunks: 0
        });
        
        console.log(`[FileTransfer ${config.role}] Initialized streaming state (binary):`, {
          transferId,
          fileSize,
          totalChunks,
          chunkSize: STREAM_CHUNK_SIZE
        });
        
        // For client, set up file system access
        if (config.role === 'client') {
          try {
            // Try File System Access API first (Chrome/Edge)
            if ((window as any).showSaveFilePicker) {
              const fileHandle = await (window as any).showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                  description: 'Files',
                  accept: { '*/*': [] }
                }]
              });
              
              const writable = await fileHandle.createWritable();
              streamingWritersRef.current.set(transferId, writable);
              console.log(`[FileTransfer Client] Created file handle for streaming (binary)`);
            } else {
              // Fallback to StreamSaver.js (Firefox/Safari)
              if (!streamSaverRef.current) {
                throw new Error('StreamSaver not loaded yet');
              }
              const stream = streamSaverRef.current.createWriteStream(fileName, {
                size: fileSize
              });
              
              streamSaverWritersRef.current.set(transferId, stream);
              const writer = stream.getWriter();
              streamSaverWriterRefs.current.set(transferId, writer);
              console.log(`[FileTransfer Client] Created StreamSaver stream for streaming (binary)`);
            }
          } catch (error) {
            console.error(`[FileTransfer Client] Failed to create file handle:`, error);
            // Continue with memory-based fallback
          }
        }
        return;
      }
      
      if (binaryMessage.type === MESSAGE_TYPES.FILE_ERROR) {
        const errorMessage = new TextDecoder().decode(binaryMessage.data);
        console.error(`[FileTransfer ${config.role}] File transfer error (binary):`, { transferId: binaryMessage.transferId, error: errorMessage });
        setTransferProgress(prev => prev ? { ...prev, status: 'error', error: errorMessage } : null);
        return;
      }
      
      console.warn(`[FileTransfer ${config.role}] Unknown binary message type:`, binaryMessage.type);
      return;
    }
    
    // Handle raw binary data (chunk data without metadata)
    if (data instanceof Blob) {
      // This is raw binary data, check if we have pending metadata
      const pendingMetadata = pendingChunkMetadataRef.current;
      
      if (pendingMetadata) {
        console.log(`[FileTransfer ${config.role}] Processing raw binary chunk data with pending metadata:`, {
          chunkIndex: pendingMetadata.chunkIndex,
          totalChunks: pendingMetadata.totalChunks,
          dataLength: data.size,
          dataType: 'Blob'
        });
        
        // Process the chunk data
        const arrayBuffer = await data.arrayBuffer();
        const chunkUint8 = new Uint8Array(arrayBuffer);
        
        const streamingState = streamingChunksRef.current.get(pendingMetadata.transferId);
        
        if (streamingState) {
          // Check if this chunk was already received
          const wasAlreadyReceived = streamingState.chunks[pendingMetadata.chunkIndex] !== undefined;
          
          streamingState.chunks[pendingMetadata.chunkIndex] = chunkUint8;
          streamingState.totalChunks = pendingMetadata.totalChunks;
          
          console.log(`[FileTransfer ${config.role}] Binary chunk processing:`, {
            chunkIndex: pendingMetadata.chunkIndex,
            totalChunks: pendingMetadata.totalChunks,
            receivedChunks: streamingState.receivedChunks,
            wasAlreadyReceived,
            chunksArrayLength: streamingState.chunks.length
          });
          
          // Write chunk directly to file system (client only)
          if (config.role === 'client') {
            const writer = streamingWritersRef.current.get(pendingMetadata.transferId);
            const streamSaverWriter = streamSaverWriterRefs.current.get(pendingMetadata.transferId);
            
            if (writer) {
              try {
                await writer.write(chunkUint8);
                console.log(`[FileTransfer Client] Wrote chunk ${pendingMetadata.chunkIndex + 1} to disk (File System Access - Binary)`);
              } catch (error) {
                console.error(`[FileTransfer Client] Failed to write chunk:`, error);
              }
            } else if (streamSaverWriter) {
              try {
                await streamSaverWriter.write(chunkUint8);
                console.log(`[FileTransfer Client] Wrote chunk ${pendingMetadata.chunkIndex + 1} to stream (StreamSaver - Binary)`);
              } catch (error) {
                console.error(`[FileTransfer Client] Failed to write chunk to stream:`, error);
              }
            }
          }
          
          // Increment received chunks counter
          if (!wasAlreadyReceived) {
            streamingState.receivedChunks++;
            console.log(`[FileTransfer ${config.role}] Incremented receivedChunks to ${streamingState.receivedChunks}/${streamingState.totalChunks}`);
          }
          
          // Update progress (throttled)
          updateProgressThrottled(prev => {
            if (!prev) return null;
            const chunkSize = chunkUint8.length;
            const newBytesTransferred = prev.bytesTransferred + chunkSize;
            const percentage = Math.round((newBytesTransferred / prev.fileSize) * 100);
            
            return {
              ...prev,
              bytesTransferred: newBytesTransferred,
              percentage
            };
          });
          
          // Check completion
          console.log(`[FileTransfer ${config.role}] Binary completion check:`, {
            receivedChunks: streamingState.receivedChunks,
            totalChunks: streamingState.totalChunks,
            isComplete: streamingState.receivedChunks === streamingState.totalChunks,
            chunkIndex: pendingMetadata.chunkIndex,
            isLastChunk: pendingMetadata.chunkIndex === pendingMetadata.totalChunks - 1
          });
          
          if (streamingState.receivedChunks === streamingState.totalChunks) {
            console.log(`[FileTransfer ${config.role}] All chunks received (binary), finalizing file...`);
            console.log(`[FileTransfer ${config.role}] Binary completion details:`, {
              receivedChunks: streamingState.receivedChunks,
              totalChunks: streamingState.totalChunks,
              transferId: pendingMetadata.transferId,
              role: config.role
            });
            
            if (config.role === 'client') {
              const writer = streamingWritersRef.current.get(pendingMetadata.transferId);
              const streamSaverWriter = streamSaverWriterRefs.current.get(pendingMetadata.transferId);
              
              if (writer) {
                await writer.close();
                streamingWritersRef.current.delete(pendingMetadata.transferId);
                console.log(`[FileTransfer Client] File saved to disk via File System Access API (Binary)`);
              } else if (streamSaverWriter) {
                await streamSaverWriter.close();
                streamSaverWritersRef.current.delete(pendingMetadata.transferId);
                streamSaverWriterRefs.current.delete(pendingMetadata.transferId);
                console.log(`[FileTransfer Client] File saved via StreamSaver.js (Binary)`);
              }
            }
            
            streamingChunksRef.current.delete(pendingMetadata.transferId);
            const completedProgress = { ...transferProgress!, status: 'completed' as const };
            setTransferProgress(completedProgress);
            
            // Set received file state for UI (for binary streaming)
            if (config.role === 'client') {
              setReceivedFileName(transferProgress?.fileName || 'received_file');
              setReceivedFileHandle(null); // File was saved to disk, not in memory
            }
            
            // Call completion callback
            if (config.onComplete) {
              config.onComplete(receivedFile, receivedFileName);
            }
          }
          
          // Remove pending metadata
          pendingChunkMetadataRef.current = null;
        } else {
          console.error(`[FileTransfer ${config.role}] No streaming state found for transfer ${pendingMetadata.transferId}`);
        }
      } else {
        console.warn(`[FileTransfer ${config.role}] Received raw binary data but no pending metadata`);
      }
      return;
    }
    
    // Handle JSON messages (string)
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        console.log(`[FileTransfer ${config.role}] Parsed message:`, message);
        
        // Validate message structure
        if (!isValidFileTransferMessage(message)) {
          console.error(`[FileTransfer ${config.role}] Invalid message structure:`, message);
          return;
        }
        
        if (message.type === 'file-start') {
          const { fileName, fileSize, transferId } = message;
          console.log(`[FileTransfer ${config.role}] File transfer started:`, { fileName, fileSize, transferId });
          
          // Validate fileSize
          if (typeof fileSize !== 'number' || fileSize <= 0) {
            console.error(`[FileTransfer ${config.role}] Invalid fileSize:`, fileSize);
            setTransferProgress(prev => prev ? { ...prev, status: 'error', error: 'Invalid file size' } : null);
            return;
          }
          
          setTransferProgress({
            fileName,
            fileSize,
            bytesTransferred: 0,
            percentage: 0,
            status: 'transferring'
          });
          setReceivedFileName(fileName);
          
          // Calculate total chunks from file size
          const totalChunks = Math.ceil(fileSize / STREAM_CHUNK_SIZE);
          
          // Initialize streaming state
          streamingChunksRef.current.set(transferId, {
            chunks: new Array(totalChunks),
            totalChunks: totalChunks,
            receivedChunks: 0
          });
          
          console.log(`[FileTransfer ${config.role}] Initialized streaming state:`, {
            transferId,
            fileSize,
            totalChunks,
            chunkSize: STREAM_CHUNK_SIZE
          });
          
          // For client, set up file system access
          if (config.role === 'client') {
            try {
              // Check if File System Access API is available
              if ('showSaveFilePicker' in window) {
                const fileHandle = await (window as any).showSaveFilePicker({
                  suggestedName: fileName,
                  types: [{
                    description: 'Files',
                    accept: { '*/*': ['.*'] }
                  }]
                });
                
                const writable = await fileHandle.createWritable();
                streamingWritersRef.current.set(transferId, writable);
                setReceivedFileHandle(fileHandle);
                
                console.log(`[FileTransfer Client] File handle created for:`, fileName);
              } else {
                // Fallback: Use StreamSaver.js for progressive download
                console.log(`[FileTransfer Client] File System Access API not available, using StreamSaver.js`);
                
                try {
                  // Set up StreamSaver.js
                  if (!streamSaverRef.current) {
                    throw new Error('StreamSaver not loaded yet');
                  }

                  const fileStream = streamSaverRef.current.createWriteStream(fileName, {
                    size: fileSize,
                    writableStrategy: {
                      highWaterMark: 64 * 1024 // 64KB buffer
                    }
                  });
                  
                  // Get the writer once and store it
                  const writer = fileStream.getWriter();
                  streamSaverWritersRef.current.set(transferId, fileStream);
                  streamSaverWriterRefs.current.set(transferId, writer);
                  
                  console.log(`[FileTransfer Client] StreamSaver stream and writer created for:`, fileName);
                } catch (streamError) {
                  console.error(`[FileTransfer Client] Failed to create StreamSaver stream:`, streamError);
                  // Final fallback: Store in memory
                  console.log(`[FileTransfer Client] Using memory fallback`);
                }
              }
            } catch (error) {
              console.error(`[FileTransfer Client] Failed to create file handle:`, error);
              setTransferProgress(prev => prev ? { ...prev, status: 'error', error: 'User cancelled file save' } : null);
            }
          }
        } else if (message.type === 'file-chunk') {
          const { transferId, chunkIndex, totalChunks, data: chunkData } = message;
          console.log(`[FileTransfer ${config.role}] Received chunk metadata ${chunkIndex + 1}/${totalChunks} for transfer ${transferId}`, {
            chunkDataLength: chunkData?.length,
            chunkDataType: typeof chunkData,
            isArray: Array.isArray(chunkData)
          });
          
          // Store chunk metadata for binary data processing
          if (chunkData === undefined) {
            // This is a metadata-only message, store it for the next binary message
            pendingChunkMetadataRef.current = {
              chunkIndex,
              totalChunks,
              transferId
            };
            console.log(`[FileTransfer ${config.role}] Stored chunk metadata, waiting for binary data`);
            return;
          }
          
          const chunkUint8 = new Uint8Array(chunkData);
          const streamingState = streamingChunksRef.current.get(transferId);
          
          if (streamingState) {
            streamingState.chunks[chunkIndex] = chunkUint8;
            streamingState.totalChunks = totalChunks;
            streamingState.receivedChunks++;
            
            console.log(`[FileTransfer ${config.role}] Streaming state updated:`, {
              transferId,
              chunkIndex,
              totalChunks,
              receivedChunks: streamingState.receivedChunks,
              chunksArrayLength: streamingState.chunks.length
            });
            
            console.log(`[FileTransfer ${config.role}] About to process chunk...`);
            
            // Write chunk directly to file system (client only)
            if (config.role === 'client') {
              const writer = streamingWritersRef.current.get(transferId);
              const streamSaverWriter = streamSaverWriterRefs.current.get(transferId);
              
              if (writer) {
                // File System Access API
                try {
                  await writer.write(chunkUint8);
                  console.log(`[FileTransfer Client] Wrote chunk ${chunkIndex + 1} to disk (File System Access)`);
                } catch (error) {
                  console.error(`[FileTransfer Client] Failed to write chunk:`, error);
                }
              } else if (streamSaverWriter) {
                // StreamSaver.js - use the stored writer
                try {
                  await streamSaverWriter.write(chunkUint8);
                  console.log(`[FileTransfer Client] Wrote chunk ${chunkIndex + 1} to stream (StreamSaver)`);
                } catch (error) {
                  console.error(`[FileTransfer Client] Failed to write chunk to stream:`, error);
                }
              } else {
                // Fallback: Store chunks in memory for later download
                console.log(`[FileTransfer Client] No file writer, storing chunk in memory`);
              }
            }
            
            console.log(`[FileTransfer ${config.role}] Finished writing chunk, about to update progress...`);
            
            // Update progress (throttled)
            updateProgressThrottled(prev => {
              if (!prev) return null;
              const chunkSize = chunkUint8.length; // Use the actual chunk size
              const newBytesTransferred = prev.bytesTransferred + chunkSize;
              const percentage = Math.round((newBytesTransferred / prev.fileSize) * 100);
              
              console.log(`[FileTransfer ${config.role}] Progress update:`, {
                chunkSize,
                newBytesTransferred,
                fileSize: prev.fileSize,
                percentage
              });
              
              return {
                ...prev,
                bytesTransferred: newBytesTransferred,
                percentage
              };
            });
            
            console.log(`[FileTransfer ${config.role}] About to check completion...`);
            
            // Check if all chunks received
            console.log(`[FileTransfer ${config.role}] Checking completion:`, {
              receivedChunks: streamingState.receivedChunks,
              totalChunks: streamingState.totalChunks,
              isComplete: streamingState.receivedChunks === streamingState.totalChunks
            });
            
            if (streamingState.receivedChunks === streamingState.totalChunks) {
              console.log(`[FileTransfer ${config.role}] Main completion check triggered:`, {
                receivedChunks: streamingState.receivedChunks,
                totalChunks: streamingState.totalChunks,
                transferId,
                role: config.role
              });
              
              // Validate chunk integrity before finalizing
              const missingChunks: number[] = [];
              for (let i = 0; i < streamingState.totalChunks; i++) {
                if (streamingState.chunks[i] === undefined) {
                  missingChunks.push(i);
                }
              }
              
              if (missingChunks.length > 0) {
                console.error(`[FileTransfer ${config.role}] Missing chunks detected:`, missingChunks);
          const errorMessage = `Missing ${missingChunks.length} chunks: ${missingChunks.join(', ')}`;
          setTransferProgress(prev => prev ? { 
            ...prev, 
            status: 'error', 
            error: errorMessage 
          } : null);
          
          // Call error callback
          if (config.onError) {
            config.onError(errorMessage);
          }
                return;
              }
              console.log(`[FileTransfer ${config.role}] All chunks received, finalizing file...`);
              
              if (config.role === 'client') {
                // Close the file writer
                const writer = streamingWritersRef.current.get(transferId);
                const streamSaverWriter = streamSaverWriterRefs.current.get(transferId);
                
                if (writer) {
                  // File System Access API
                  try {
                    await writer.close();
                    console.log(`[FileTransfer Client] File saved to disk successfully (File System Access)`);
                  } catch (error) {
                    console.error(`[FileTransfer Client] Failed to close file:`, error);
                  }
                  streamingWritersRef.current.delete(transferId);
                  
                  // Set received file state for UI
                  setReceivedFileName(transferProgress?.fileName || 'received_file');
                  setReceivedFileHandle(null); // File was saved to disk, not in memory
                } else if (streamSaverWriter) {
                  // StreamSaver.js - use the stored writer
                  try {
                    await streamSaverWriter.close();
                    console.log(`[FileTransfer Client] File saved to disk successfully (StreamSaver)`);
                  } catch (error) {
                    console.error(`[FileTransfer Client] Failed to close stream:`, error);
                  }
                  streamSaverWritersRef.current.delete(transferId);
                  streamSaverWriterRefs.current.delete(transferId);
                  
                  // Set received file state for UI
                  setReceivedFileName(transferProgress?.fileName || 'received_file');
                  setReceivedFileHandle(null); // File was saved to disk, not in memory
                } else {
                  // Fallback: Create blob for download
                  const allChunks = streamingState.chunks.filter(chunk => chunk !== undefined);
                  const fileBlob = new Blob(allChunks);
                  setReceivedFile(fileBlob);
                  console.log(`[FileTransfer Client] File assembled in memory for download`);
                }
              } else {
                // For host, create blob for display purposes only
                const allChunks = streamingState.chunks.filter(chunk => chunk !== undefined);
                const fileBlob = new Blob(allChunks);
                setReceivedFile(fileBlob);
              }
              
              streamingChunksRef.current.delete(transferId);
              
              setTransferProgress(prev => prev ? { ...prev, status: 'completed' } : null);
            }
          }
        } else if (message.type === 'file-error') {
          const { transferId, error } = message;
          console.error(`[FileTransfer ${config.role}] File transfer error:`, { transferId, error });
          
          // Clean up streaming state
          const writer = streamingWritersRef.current.get(transferId);
          const streamSaverWriter = streamSaverWriterRefs.current.get(transferId);
          
          if (writer) {
            try {
              await writer.close();
            } catch (e) {
              console.error('Error closing writer on error:', e);
            }
            streamingWritersRef.current.delete(transferId);
          }
          
          if (streamSaverWriter) {
            try {
              await streamSaverWriter.close();
            } catch (e) {
              console.error('Error closing StreamSaver writer on error:', e);
            }
            streamSaverWritersRef.current.delete(transferId);
            streamSaverWriterRefs.current.delete(transferId);
          }
          
          streamingChunksRef.current.delete(transferId);
          
          const resolver = fileResolversRef.current.get(transferId);
          if (resolver) {
            resolver.reject(new Error(error));
            fileResolversRef.current.delete(transferId);
          }
          setTransferProgress(prev => prev ? { ...prev, status: 'error', error } : null);
        } else if (message.type === 'request-chunks') {
          console.log(`[FileTransfer ${config.role}] Received chunk request:`, message);
          // This will be handled by the host to resend requested chunks
          // The actual resending logic will be implemented in the sendFile functions
        } else {
          console.log(`[FileTransfer ${config.role}] Unknown message type:`, message.type);
        }
      } catch (error) {
        console.error(`[FileTransfer ${config.role}] Error parsing file transfer message:`, error, 'Raw data:', data);
      }
    } else {
      console.log(`[FileTransfer ${config.role}] Received non-string data (not a file transfer message):`, data);
    }
  }, [config.role]);

  const hostPeer = useWebRTCHostPeer({
    ...config,
    onChannelMessage: handleFileChunk,
  });

  const clientPeer = useWebRTCClientPeer({
    ...config,
    onChannelMessage: handleFileChunk,
  });

  const activePeer = config.role === 'host' ? hostPeer : clientPeer;

  // Request missing chunks mechanism
  const requestMissingChunks = useCallback((transferId: string, missingChunks: number[]) => {
    if (config.role === 'client' && missingChunks.length > 0) {
      console.log(`[FileTransfer ${config.role}] Requesting missing chunks:`, missingChunks);
      
      const requestMessage = JSON.stringify({
        type: 'request-chunks',
        transferId,
        missingChunks
      });
      
      clientPeer?.send(requestMessage);
    }
  }, [config.role, clientPeer]);

  // Process retry queue function
  const processRetryQueue = useCallback(async (transferId: string, file: File, clientId?: string) => {
    const retries = Array.from(retryQueueRef.current.entries())
      .filter(([key]) => key.startsWith(transferId))
      .map(([key, retryInfo]) => ({ key, ...retryInfo }));
    
    if (retries.length === 0) return;
    
    logger.log(`Processing ${retries.length} retries for transfer ${transferId}`);
    
    for (const retry of retries) {
      if (retry.retryCount > retry.maxRetries) {
        logger.error(`Max retries exceeded for chunk ${retry.chunkIndex}`);
        retryQueueRef.current.delete(retry.key);
        continue;
      }
      
      try {
        // Retry sending the chunk
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const start = retry.chunkIndex * STREAM_CHUNK_SIZE;
        const end = Math.min(start + STREAM_CHUNK_SIZE, file.size);
        const chunk = uint8Array.slice(start, end);
        
        // Send chunk metadata
        const chunkMetadata = JSON.stringify({
          type: 'file-chunk',
          transferId,
          chunkIndex: retry.chunkIndex,
          totalChunks: Math.ceil(file.size / STREAM_CHUNK_SIZE)
        });
        
        if (clientId) {
          hostPeer?.send(chunkMetadata, clientId);
          hostPeer?.send(chunk.buffer, clientId);
        } else {
          hostPeer?.send(chunkMetadata);
          hostPeer?.send(chunk.buffer);
        }
        
        console.log(`[FileTransfer ${config.role}] Retried chunk ${retry.chunkIndex} (attempt ${retry.retryCount})`);
        
        // Remove from retry queue on successful send
        retryQueueRef.current.delete(retry.key);
        
        // Add delay between retries
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        
      } catch (error) {
        logger.error(`Retry failed for chunk ${retry.chunkIndex}:`, error);
      }
    }
  }, [logger, hostPeer]);

  // Simple fallback sending with adaptive pacing
  const sendFileSimple = useCallback(async (file: File, clientId: string | undefined, transferId: string, totalChunks: number) => {
    console.log(`[FileTransfer Host] Using adaptive pacing for ${totalChunks} chunks`);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      console.log(`[FileTransfer Host] Starting to send ${totalChunks} chunks with adaptive pacing...`);
      
      // Get data channel for bufferedAmount monitoring
      let dataChannel = null;
      if (clientId) {
        const clientConn = (hostPeer as any).clientConnectionsRef?.current?.get(clientId);
        dataChannel = clientConn?.dc;
      } else {
        const clientConnections = (hostPeer as any).clientConnectionsRef?.current;
        if (clientConnections) {
          for (const [id, conn] of clientConnections) {
            if (conn.dc && conn.dc.readyState === 'open') {
              dataChannel = conn.dc;
              break;
            }
          }
        }
      }
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * STREAM_CHUNK_SIZE;
        const end = Math.min(start + STREAM_CHUNK_SIZE, file.size);
        const chunk = uint8Array.slice(start, end);
        
        // Send chunk metadata as JSON first
        const chunkMetadata = JSON.stringify({
          type: 'file-chunk',
          transferId,
          chunkIndex: i,
          totalChunks
        });
        
        console.log(`[FileTransfer Host] Sending chunk ${i + 1}/${totalChunks} (${chunk.length} bytes)`);
        
        // Send metadata
        if (clientId) {
          hostPeer.send(chunkMetadata, clientId);
        } else {
          hostPeer.send(chunkMetadata);
        }
        
        // Send binary chunk data directly
        if (clientId) {
          hostPeer.send(chunk.buffer, clientId);
        } else {
          hostPeer.send(chunk.buffer);
        }
        
        // Update progress
        setTransferProgress(prev => {
          if (!prev) return null;
          const newBytesTransferred = prev.bytesTransferred + chunk.length;
          return {
            ...prev,
            bytesTransferred: newBytesTransferred,
            percentage: Math.round((newBytesTransferred / prev.fileSize) * 100)
          };
        });
        
        // Adaptive pacing based on bufferedAmount
        if (dataChannel) {
          const bufferedAmount = dataChannel.bufferedAmount;
          const maxBufferSize = 1024 * 1024; // 1MB buffer limit
          const baseDelay = 10; // Base delay in ms
          const maxDelay = 100; // Maximum delay in ms
          
          // Calculate delay based on buffer usage
          const bufferRatio = Math.min(bufferedAmount / maxBufferSize, 1);
          const adaptiveDelay = Math.round(baseDelay + (bufferRatio * (maxDelay - baseDelay)));
          
          console.log(`[FileTransfer Host] Buffer status: ${bufferedAmount} bytes, delay: ${adaptiveDelay}ms`);
          
          if (bufferedAmount > maxBufferSize) {
            console.log(`[FileTransfer Host] Buffer full, waiting for backpressure...`);
            // Wait for buffer to drain
            await new Promise(resolve => {
              const checkBuffer = () => {
                if (dataChannel.bufferedAmount < maxBufferSize * 0.5) {
                  resolve(undefined);
                } else {
                  setTimeout(checkBuffer, 50);
                }
              };
              checkBuffer();
            });
          } else {
            await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
          }
        } else {
          // Fallback delay if no data channel available
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
      
      console.log(`[FileTransfer Host] Simple file transfer completed successfully - sent ${totalChunks} chunks`);
      setTransferProgress(prev => prev ? { ...prev, status: 'completed' } : null);
      setIsTransferring(false);
      
    } catch (error) {
      console.error(`[FileTransfer Host] Simple file transfer failed:`, error);
      setTransferProgress(prev => prev ? { 
        ...prev, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      } : null);
      setIsTransferring(false);
    }
  }, [hostPeer]);

  const sendFile = useCallback(async (file: File, clientId?: string) => {
    if (config.role !== 'host') {
      throw new Error('sendFile can only be called on host');
    }

    const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalChunks = Math.ceil(file.size / STREAM_CHUNK_SIZE);
    
    console.log(`[FileTransfer Host] Starting streaming file transfer:`, {
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
      transferId,
      clientId: clientId || 'all clients'
    });
    
    setTransferProgress({
      fileName: file.name,
      fileSize: file.size,
      bytesTransferred: 0,
      percentage: 0,
      status: 'transferring'
    });
    
    setIsTransferring(true);

    try {
      // Send file start message
      const startMessage = JSON.stringify({
        type: 'file-start',
        fileName: file.name,
        fileSize: file.size,
        transferId
      });
      
      console.log(`[FileTransfer Host] Sending file start message:`, startMessage);
      
      if (clientId) {
        hostPeer.send(startMessage, clientId);
        console.log(`[FileTransfer Host] Sent start message to client ${clientId}`);
      } else {
        hostPeer.send(startMessage);
        console.log(`[FileTransfer Host] Sent start message to all clients`);
      }

      // Get the data channel for backpressure handling
      let dataChannel = null;
      
      console.log(`[FileTransfer Host] Looking for data channel:`, {
        clientId: clientId || 'broadcast',
        connectedClients: hostPeer.connectedClients,
        clientConnections: hostPeer.clientConnections
      });
      
      if (clientId) {
        // Get specific client's data channel
        const clientConn = (hostPeer as any).clientConnectionsRef?.current?.get(clientId);
        console.log(`[FileTransfer Host] Client connection for ${clientId}:`, {
          exists: !!clientConn,
          hasDC: !!clientConn?.dc,
          dcState: clientConn?.dc?.readyState
        });
        dataChannel = clientConn?.dc;
      } else {
        // For broadcast, get the first available data channel
        const clientConnections = (hostPeer as any).clientConnectionsRef?.current;
        console.log(`[FileTransfer Host] Available client connections:`, clientConnections ? Array.from(clientConnections.keys()) : 'none');
        
        if (clientConnections) {
          for (const [id, conn] of clientConnections) {
            console.log(`[FileTransfer Host] Checking connection ${id}:`, {
              hasDC: !!conn.dc,
              dcState: conn.dc?.readyState
            });
            if (conn.dc && conn.dc.readyState === 'open') {
              dataChannel = conn.dc;
              console.log(`[FileTransfer Host] Using data channel from client ${id}`);
              break;
            }
          }
        }
      }

      if (!dataChannel) {
        console.warn(`[FileTransfer Host] Data channel not available, falling back to simple sending`);
        // Fallback to simple sending without backpressure
        await sendFileSimple(file, clientId, transferId, totalChunks);
        return;
      }

      // Set up backpressure handling
      let currentPosition = 0;
      let isSending = false;
      
      const sendNextChunk = async () => {
        if (isSending || currentPosition >= file.size) return;
        
        isSending = true;
        const start = currentPosition;
        const end = Math.min(start + STREAM_CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        
        const chunkArrayBuffer = await chunk.arrayBuffer();
        const chunkUint8 = new Uint8Array(chunkArrayBuffer);
        
        // Send chunk metadata as JSON first
        const chunkMetadata = JSON.stringify({
          type: 'file-chunk',
          transferId,
          chunkIndex: Math.floor(start / STREAM_CHUNK_SIZE),
          totalChunks
        });
        
        console.log(`[FileTransfer Host] Sending chunk ${Math.floor(start / STREAM_CHUNK_SIZE) + 1}/${totalChunks} (${chunkUint8.length} bytes)`);
        
        // Send metadata
        if (clientId) {
          hostPeer.send(chunkMetadata, clientId);
        } else {
          hostPeer.send(chunkMetadata);
        }
        
        // Send binary chunk data directly
        if (clientId) {
          hostPeer.send(chunkArrayBuffer, clientId);
        } else {
          hostPeer.send(chunkArrayBuffer);
        }
        
        currentPosition = end;
        
        // Update progress
        setTransferProgress(prev => {
          if (!prev) return null;
          const newBytesTransferred = prev.bytesTransferred + chunkUint8.length;
          return {
            ...prev,
            bytesTransferred: newBytesTransferred,
            percentage: Math.round((newBytesTransferred / prev.fileSize) * 100)
          };
        });
        
        // Adaptive pacing based on bufferedAmount
        const bufferedAmount = dataChannel.bufferedAmount;
        const maxBufferSize = 1024 * 1024; // 1MB buffer limit
        const baseDelay = 5; // Base delay in ms
        const maxDelay = 50; // Maximum delay in ms
        
        // Calculate delay based on buffer usage
        const bufferRatio = Math.min(bufferedAmount / maxBufferSize, 1);
        const adaptiveDelay = Math.round(baseDelay + (bufferRatio * (maxDelay - baseDelay)));
        
        console.log(`[FileTransfer Host] Buffer status: ${bufferedAmount} bytes, delay: ${adaptiveDelay}ms`);
        
        // Add small delay to prevent overwhelming the data channel
        await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
        
        isSending = false;
        
        // Check if we're done
        if (currentPosition >= file.size) {
          console.log(`[FileTransfer Host] File transfer completed successfully`);
          setTransferProgress(prev => prev ? { ...prev, status: 'completed' } : null);
          setIsTransferring(false);
        }
      };

      // Set up backpressure event listener
      const handleBufferedAmountLow = () => {
        if (currentPosition < file.size) {
          sendNextChunk();
        }
      };

      dataChannel.addEventListener('bufferedamountlow', handleBufferedAmountLow);
      
      // Start sending
      await sendNextChunk();
      
      // Clean up event listener when done
      const cleanup = () => {
        dataChannel.removeEventListener('bufferedamountlow', handleBufferedAmountLow);
      };
      
      // Set up cleanup timeout
      setTimeout(cleanup, 30000); // 30 second timeout
      
    } catch (error) {
      console.error(`[FileTransfer Host] File transfer failed:`, error);
      
      const errorMessage = JSON.stringify({
        type: 'file-error',
        transferId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      if (clientId) {
        hostPeer.send(errorMessage, clientId);
      } else {
        hostPeer.send(errorMessage);
      }
      
      setTransferProgress(prev => prev ? { 
        ...prev, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      } : null);
      setIsTransferring(false);
    }
  }, [config.role, hostPeer]);

  const clearTransfer = useCallback(async () => {
    console.log(`[FileTransfer ${config.role}] Clearing transfer state`);
    setTransferProgress(null);
    setIsTransferring(false);
    setReceivedFile(null);
    setReceivedFileName(null);
    setReceivedFileHandle(null);
    
    // Close any open file writers
    streamingWritersRef.current.forEach(async (writer, transferId) => {
      try {
        await writer.close();
      } catch (error) {
        console.error(`Error closing writer for ${transferId}:`, error);
      }
    });
    
    // Close any open StreamSaver writers
    streamSaverWriterRefs.current.forEach(async (writer, transferId) => {
      try {
        await writer.close();
      } catch (error) {
        console.error(`Error closing StreamSaver writer for ${transferId}:`, error);
      }
    });
    
    streamingWritersRef.current.clear();
    streamSaverWritersRef.current.clear();
    streamSaverWriterRefs.current.clear();
    streamingChunksRef.current.clear();
    fileResolversRef.current.clear();
    
    // Clear pending metadata
    pendingChunkMetadataRef.current = null;
    
    // Clear retry queue
    retryQueueRef.current.clear();
    
    // Reset progress update throttle
    lastProgressUpdateRef.current = 0;
  }, [config.role]);

  const cancelTransfer = useCallback((transferId?: string) => {
    console.log(`[FileTransfer ${config.role}] Cancelling transfer:`, transferId || 'current');
    
    if (config.role === 'host') {
      // Send cancellation message to clients
      const cancelMessage = JSON.stringify({
        type: 'file-error',
        transferId: transferId || 'current',
        error: 'Transfer cancelled by host'
      });
      
      if (hostPeer) {
        hostPeer.send(cancelMessage);
      }
    }
    
    // Clear transfer state
    setTransferProgress(prev => prev ? { 
      ...prev, 
      status: 'error', 
      error: 'Transfer cancelled' 
    } : null);
    
    // Clear all state
    clearTransfer();
  }, [config.role, hostPeer, clearTransfer]);

  return {
    sendFile,
    cancelTransfer,
    receivedFile,
    receivedFileName,
    receivedFileHandle,
    transferProgress,
    isTransferring,
    clearTransfer,
    onProgress: config.onProgress,
    onComplete: config.onComplete,
    onError: config.onError,
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