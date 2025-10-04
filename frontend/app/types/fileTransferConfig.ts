// src/types/fileTransferConfig.ts

/**
 * Configuration options for WebRTC file transfer hooks.
 */
export interface FileTransferConfig {
  /** Role of this peer in the transfer */
  role: 'host' | 'client';

  /** Enables verbose debug logging */
  debug?: boolean;

  /**
   * Optional callback invoked when a file transfer completes successfully.
   * Provides the resulting file blob and filename.
   */
  onComplete?: (file: Blob | null, fileName: string | null) => void;
}
