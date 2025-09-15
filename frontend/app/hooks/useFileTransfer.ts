'use client';

import { useCallback, useRef, useState } from 'react';
import { useWebRTCHostPeer } from './useWebRTCHostPeer';
import { useWebRTCClientPeer } from './useWebRTCClientPeer';
import { WebRTCPeerConfig } from './webrtcTypes';
// @ts-ignore - StreamSaver.js doesn't have TypeScript definitions
import streamSaver from 'streamsaver';

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
  
  // Client methods
  receivedFile: Blob | null;
  receivedFileName: string | null;
  receivedFileHandle: FileSystemFileHandle | null;
  
  // Common
  transferProgress: FileTransferProgress | null;
  isTransferring: boolean;
  clearTransfer: () => void;
  
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

export function useFileTransfer(config: WebRTCPeerConfig): FileTransferApi {
  const [transferProgress, setTransferProgress] = useState<FileTransferProgress | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [receivedFile, setReceivedFile] = useState<Blob | null>(null);
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null);
  const [receivedFileHandle, setReceivedFileHandle] = useState<FileSystemFileHandle | null>(null);
  
  // Streaming state
  const streamingWritersRef = useRef<Map<string, FileSystemWritableFileStream>>(new Map());
  const streamSaverWritersRef = useRef<Map<string, WritableStream>>(new Map());
  const streamSaverWriterRefs = useRef<Map<string, WritableStreamDefaultWriter>>(new Map());
  const streamingChunksRef = useRef<Map<string, { chunks: Uint8Array[], totalChunks: number, receivedChunks: number }>>(new Map());
  const fileResolversRef = useRef<Map<string, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>>(new Map());

  const handleFileChunk = useCallback(async (data: string | ArrayBuffer | Blob) => {
    console.log(`[FileTransfer ${config.role}] Received data:`, typeof data, data instanceof ArrayBuffer ? `ArrayBuffer(${data.byteLength})` : data instanceof Blob ? `Blob(${data.size})` : data);
    
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        console.log(`[FileTransfer ${config.role}] Parsed message:`, message);
        
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
                  streamSaver.mitm = 'https://jimmywarting.github.io/StreamSaver.js/mitm.html';
                  
                  const fileStream = streamSaver.createWriteStream(fileName, {
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
          console.log(`[FileTransfer ${config.role}] Received chunk ${chunkIndex + 1}/${totalChunks} for transfer ${transferId}`, {
            chunkDataLength: chunkData?.length,
            chunkDataType: typeof chunkData,
            isArray: Array.isArray(chunkData)
          });
          
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
            
            // Update progress
            setTransferProgress(prev => {
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
              setTimeout(() => setTransferProgress(null), 2000);
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

  // Simple fallback sending without backpressure
  const sendFileSimple = useCallback(async (file: File, clientId: string | undefined, transferId: string, totalChunks: number) => {
    console.log(`[FileTransfer Host] Using simple sending fallback for ${totalChunks} chunks`);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      console.log(`[FileTransfer Host] Starting to send ${totalChunks} chunks...`);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * STREAM_CHUNK_SIZE;
        const end = Math.min(start + STREAM_CHUNK_SIZE, file.size);
        const chunk = uint8Array.slice(start, end);
        
        const chunkMessage = JSON.stringify({
          type: 'file-chunk',
          transferId,
          chunkIndex: i,
          totalChunks,
          data: Array.from(chunk)
        });
        
        console.log(`[FileTransfer Host] Sending chunk ${i + 1}/${totalChunks} (${chunk.length} bytes)`);
        
        if (clientId) {
          hostPeer.send(chunkMessage, clientId);
        } else {
          hostPeer.send(chunkMessage);
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
        
        // Small delay to prevent overwhelming the data channel
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      console.log(`[FileTransfer Host] Simple file transfer completed successfully - sent ${totalChunks} chunks`);
      setTransferProgress(prev => prev ? { ...prev, status: 'completed' } : null);
      setTimeout(() => setTransferProgress(null), 2000);
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
        
        const chunkMessage = JSON.stringify({
          type: 'file-chunk',
          transferId,
          chunkIndex: Math.floor(start / STREAM_CHUNK_SIZE),
          totalChunks,
          data: Array.from(chunkUint8)
        });
        
        console.log(`[FileTransfer Host] Sending chunk ${Math.floor(start / STREAM_CHUNK_SIZE) + 1}/${totalChunks} (${chunkUint8.length} bytes)`);
        
        if (clientId) {
          hostPeer.send(chunkMessage, clientId);
        } else {
          hostPeer.send(chunkMessage);
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
        
        isSending = false;
        
        // Check if we're done
        if (currentPosition >= file.size) {
          console.log(`[FileTransfer Host] File transfer completed successfully`);
          setTransferProgress(prev => prev ? { ...prev, status: 'completed' } : null);
          setTimeout(() => setTransferProgress(null), 2000);
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
  }, [config.role]);

  return {
    sendFile,
    receivedFile,
    receivedFileName,
    receivedFileHandle,
    transferProgress,
    isTransferring,
    clearTransfer,
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