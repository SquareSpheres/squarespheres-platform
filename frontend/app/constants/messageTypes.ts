// src/constants/messageTypes.ts

/**
 * Defines the numeric message type codes for WebRTC file transfers.
 * Using constants ensures consistent interpretation between host and client.
 */
export const MESSAGE_TYPES = {
  FILE_START: 1,       // File metadata (start of transfer)
  FILE_DATA: 2,        // Raw file data chunk
  FILE_COMPLETE: 3,    // Explicit transfer completion
  FILE_ERROR: 4,       // Error or cancellation signal
  FILE_ACK: 5          // Progress acknowledgment
} as const;

export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];
