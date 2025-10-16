// src/types/fileTransfer.ts

// WebRTC types are available globally in the browser environment

/**
 * Represents an individual client connection managed by a host.
 */
export interface ClientConnection {
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  dc?: RTCDataChannel;
}

/**
 * Base WebRTC peer interface shared by host and client implementations.
 */
export interface WebRTCPeer {
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  disconnect: () => void;
  role: 'host' | 'client';
  peerId?: string;
  send: (data: string | ArrayBuffer) => void;
}

/**
 * Extended interface for the host peer, managing a single client.
 */
export interface WebRTCHostPeer extends WebRTCPeer {
  connectedClient?: string;
  getDataChannel: () => RTCDataChannel | null;
  sendMessageToClient: (clientId: string, payload: string) => void;
}

/**
 * Extended interface for the client peer.
 */
export interface WebRTCClientPeer extends WebRTCPeer {
  // Additional client-specific properties can be added here
}

/**
 * Progress tracking for active file transfers.
 */
export interface FileTransferProgress {
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  percentage: number;
  status: 'transferring' | 'completed' | 'error';
  startTime?: number;
  error?: string;
}

/**
 * Acknowledgment progress (used by the host to monitor client reception).
 */
export interface FileTransferAckProgress {
  fileName: string;
  fileSize: number;
  bytesAcknowledged: number;
  percentage: number;
  status: 'waiting' | 'acknowledging' | 'completed' | 'error';
}

/**
 * Full public API exposed by the useFileTransfer hook.
 */
export interface FileTransferApi {
  // Host methods
  sendFile: (file: File) => Promise<void>;
  sendFileInfo: (fileName: string, fileSize: number) => void;
  cancelTransfer: (transferId?: string) => void;

  // Client methods
  receivedFile: Blob | null;
  receivedFileName: string | null;

  // Common
  transferProgress: FileTransferProgress | null;
  ackProgress: FileTransferAckProgress | null;
  isTransferring: boolean;
  clearTransfer: () => void;

  // Progress callbacks
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;
  onFileInfoReceived?: (fileName: string, fileSize: number) => void;
  onFileSelected?: (fileName: string, fileSize: number) => void;

  // WebRTC connection methods
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  disconnect: () => void;
  getPeerConnection: () => RTCPeerConnection | null;
  role: 'host' | 'client';
  peerId?: string;
  connectedClient?: string;

  // Fixed chunk size
  getCurrentChunkSize: () => number;
}
