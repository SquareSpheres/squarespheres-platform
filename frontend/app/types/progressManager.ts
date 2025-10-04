// src/types/progressManager.ts

/**
 * Interface defining the core methods of a progress manager
 * used during WebRTC file transfers.
 *
 * The implementation is responsible for tracking, updating,
 * and completing file transfer progress states.
 */
export interface ProgressManager {
  /** Called when a new file transfer starts */
  startTransfer: (fileName: string, fileSize: number) => void;

  /** Updates progress as bytes are received */
  updateBytesTransferred: (bytesTransferred: number) => void;

  /** Marks a transfer as successfully completed */
  completeTransfer: () => void;

  /** Marks a transfer as failed with an error message */
  errorTransfer: (errorMessage: string) => void;
}
