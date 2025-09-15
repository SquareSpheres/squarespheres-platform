'use client';

import { useCallback, useRef, useState } from 'react';
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
  
  // Client methods
  receivedFile: Blob | null;
  receivedFileName: string | null;
  
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

export function useFileTransfer(config: WebRTCPeerConfig): FileTransferApi {
  const [transferProgress, setTransferProgress] = useState<FileTransferProgress | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [receivedFile, setReceivedFile] = useState<Blob | null>(null);
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null);
  
  const receivedChunksRef = useRef<Map<string, Uint8Array[]>>(new Map());
  const fileResolversRef = useRef<Map<string, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>>(new Map());

  const handleFileChunk = useCallback((data: string | ArrayBuffer | Blob) => {
    console.log(`[FileTransfer ${config.role}] Received data:`, typeof data, data instanceof ArrayBuffer ? `ArrayBuffer(${data.byteLength})` : data instanceof Blob ? `Blob(${data.size})` : data);
    
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        console.log(`[FileTransfer ${config.role}] Parsed message:`, message);
        
        if (message.type === 'file-start') {
          const { fileName, fileSize, transferId } = message;
          console.log(`[FileTransfer ${config.role}] File transfer started:`, { fileName, fileSize, transferId });
          
          setTransferProgress({
            fileName,
            fileSize,
            bytesTransferred: 0,
            percentage: 0,
            status: 'transferring'
          });
          receivedChunksRef.current.set(transferId, []);
          setReceivedFileName(fileName);
        } else if (message.type === 'file-chunk') {
          const { transferId, chunkIndex, totalChunks, data: chunkData } = message;
          console.log(`[FileTransfer ${config.role}] Received chunk ${chunkIndex + 1}/${totalChunks} for transfer ${transferId}`);
          
          const chunks = receivedChunksRef.current.get(transferId) || [];
          chunks[chunkIndex] = new Uint8Array(chunkData);
          receivedChunksRef.current.set(transferId, chunks);
          
          setTransferProgress(prev => {
            if (!prev) return null;
            const newBytesTransferred = prev.bytesTransferred + chunkData.byteLength;
            return {
              ...prev,
              bytesTransferred: newBytesTransferred,
              percentage: Math.round((newBytesTransferred / prev.fileSize) * 100)
            };
          });
          
          // Check if all chunks received
          if (chunks.length === totalChunks && chunks.every(chunk => chunk !== undefined)) {
            console.log(`[FileTransfer ${config.role}] All chunks received, assembling file...`);
            const fileBlob = new Blob(chunks);
            console.log(`[FileTransfer ${config.role}] File assembled:`, { size: fileBlob.size, type: fileBlob.type });
            
            setReceivedFile(fileBlob);
            
            const resolver = fileResolversRef.current.get(transferId);
            if (resolver) {
              resolver.resolve(fileBlob);
              fileResolversRef.current.delete(transferId);
            }
            receivedChunksRef.current.delete(transferId);
            
            setTransferProgress(prev => prev ? { ...prev, status: 'completed' } : null);
            setTimeout(() => setTransferProgress(null), 2000);
          }
        } else if (message.type === 'file-error') {
          const { transferId, error } = message;
          console.error(`[FileTransfer ${config.role}] File transfer error:`, { transferId, error });
          
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

  const sendFile = useCallback(async (file: File, clientId?: string) => {
    if (config.role !== 'host') {
      throw new Error('sendFile can only be called on host');
    }

    const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    console.log(`[FileTransfer Host] Starting file transfer:`, {
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

      // Send file in chunks
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      console.log(`[FileTransfer Host] Sending ${totalChunks} chunks...`);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
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
      
      console.log(`[FileTransfer Host] File transfer completed successfully`);
      setTransferProgress(prev => prev ? { ...prev, status: 'completed' } : null);
      setTimeout(() => setTransferProgress(null), 2000);
      
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
    } finally {
      setIsTransferring(false);
    }
  }, [config.role, hostPeer]);

  const clearTransfer = useCallback(() => {
    console.log(`[FileTransfer ${config.role}] Clearing transfer state`);
    setTransferProgress(null);
    setIsTransferring(false);
    setReceivedFile(null);
    setReceivedFileName(null);
    receivedChunksRef.current.clear();
    fileResolversRef.current.clear();
  }, [config.role]);

  return {
    sendFile,
    receivedFile,
    receivedFileName,
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
