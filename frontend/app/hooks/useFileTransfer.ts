'use client';

import { WebRTCPeerConfig } from './webrtcTypes';
import { useFileTransferCore } from './useFileTransferCore';
import { FileTransferProgress } from './useTransferProgress';

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
  resumeTransfer: (transferId: string) => Promise<boolean>;

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

  // Sprint 2: Error management and metrics
  getErrorHistory: (transferId: string) => any[];
  getTransferMetrics: (transferId: string) => any;
  getActiveTransfers: () => any[];

  // Fixed chunk size
  getCurrentChunkSize: () => number;

  // Sprint 2: Transfer resumption
  canResumeTransfer: (transferId: string) => Promise<boolean>;
  getMissingChunks: (transferId: string) => Promise<number[]>;
  loadTransferState: (transferId: string) => Promise<any>;
}

// Re-export types for backward compatibility
export type { FileTransferProgress } from './useTransferProgress';

export function useFileTransfer(config: WebRTCPeerConfig & { 
  debug?: boolean;
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;
}): FileTransferApi {
  // Use the decomposed core implementation
  const core = useFileTransferCore(config);
  
  return {
    ...core,
    // Ensure callback properties are properly included
    onProgress: config.onProgress,
    onComplete: config.onComplete,
    onError: config.onError,
  };
}
