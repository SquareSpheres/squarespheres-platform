/**
 * File Transfer Factory
 * 
 * Provides a unified interface to switch between polling and event-driven
 * file transfer implementations.
 */

import { WebRTCPeerConfig } from './webrtcTypes';
import { FileTransferApi, FileTransferProgress } from '../types/fileTransfer';
import { useFileTransfer } from './useFileTransfer';
import { useFileTransferEventDriven } from './useFileTransferEventDriven';

export type FileTransferMode = 'polling' | 'event-driven';

export interface FileTransferFactoryConfig extends WebRTCPeerConfig {
  mode?: FileTransferMode;
  debug?: boolean;
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;
  onConnectionRejected?: (reason: string, connectedClientId?: string) => void;
  onClientJoined?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
}

/**
 * Factory hook that returns the appropriate file transfer implementation
 * based on the mode configuration.
 * 
 * @example
 * ```tsx
 * // Use polling mode (default, more compatible)
 * const transfer = useFileTransferFactory({ role: 'host', mode: 'polling' });
 * 
 * // Use event-driven mode (better performance for large files)
 * const transfer = useFileTransferFactory({ role: 'host', mode: 'event-driven' });
 * ```
 */
export function useFileTransferFactory(config: FileTransferFactoryConfig): FileTransferApi {
  const mode = config.mode || 'polling';
  
  // Call both hooks to satisfy React rules (only one will be used)
  const pollingTransfer = useFileTransfer(config);
  const eventDrivenTransfer = useFileTransferEventDriven(config);
  
  // Return the appropriate implementation based on mode
  return mode === 'event-driven' ? eventDrivenTransfer : pollingTransfer;
}

