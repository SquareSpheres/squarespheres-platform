// Mobile-friendly chunk size for WebRTC data channels
// Research shows 16KB is safe for desktop, 8KB is better for mobile
export const DEFAULT_CHUNK_SIZE = 8192; // 8KB chunks - mobile optimized
export const DESKTOP_CHUNK_SIZE = 16384; // 16KB chunks - desktop optimized
export const STREAM_CHUNK_SIZE = DEFAULT_CHUNK_SIZE; // Backwards compatibility

// Device detection for optimal chunk sizing
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ||
         window.innerWidth <= 768;
};

// Get optimal chunk size based on device type
export const getOptimalChunkSize = (): number => {
  return isMobileDevice() ? DEFAULT_CHUNK_SIZE : DESKTOP_CHUNK_SIZE;
};

// Mobile debugging helper - logs to console and shows alert on mobile
export const mobileDebug = (message: string, data?: any) => {
  console.log(`[Mobile Debug] ${message}`, data);
  
  // On mobile, also show alert for critical errors (only in development)
  if (isMobileDevice() && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    if (message.includes('error') || message.includes('failed') || message.includes('Error')) {
      alert(`Mobile Debug: ${message}`);
    }
  }
};
export const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB threshold for streaming vs memory

import * as mime from 'mime-types';

// Helper function to get MIME type from filename
export const getMimeType = (fileName: string): string => {
  return mime.lookup(fileName) || 'application/octet-stream';
};

// Binary message format constants
export const MESSAGE_TYPES = {
  FILE_START: 0x01,
  FILE_CHUNK: 0x02,
  FILE_END: 0x03,
  FILE_ERROR: 0x04,
} as const;

// Binary message header format (little-endian):
// [4 bytes: message type][4 bytes: transferId length][4 bytes: data length][transferId string][data]
export const BINARY_HEADER_SIZE = 12; // 3 * 4 bytes

// Debug logging utility
export const createLogger = (role: string, debug: boolean = false) => ({
  log: (...args: any[]) => debug && console.log(`[FileTransfer ${role}]`, ...args),
  error: (...args: any[]) => console.error(`[FileTransfer ${role}]`, ...args),
  warn: (...args: any[]) => console.warn(`[FileTransfer ${role}]`, ...args),
  info: (...args: any[]) => debug && console.info(`[FileTransfer ${role}]`, ...args),
});

// Legacy JSON message types removed - only binary protocol supported

// Helper functions for binary message encoding/decoding
export function encodeBinaryMessage(type: number, transferId: string, data: Uint8Array): ArrayBuffer {
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

export function decodeBinaryMessage(buffer: ArrayBuffer): { type: number; transferId: string; data: Uint8Array } | null {
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

// Chunk integrity utilities using Web Crypto API
export async function calculateChunkHash(chunkData: Uint8Array): Promise<string> {
  // Ensure we have a proper ArrayBuffer for Web Crypto API
  const buffer = chunkData.buffer instanceof ArrayBuffer 
    ? chunkData.buffer.slice(chunkData.byteOffset, chunkData.byteOffset + chunkData.byteLength)
    : new ArrayBuffer(chunkData.byteLength);
  
  if (!(buffer instanceof ArrayBuffer)) {
    // Fallback: copy data to new ArrayBuffer
    const newBuffer = new ArrayBuffer(chunkData.byteLength);
    const newView = new Uint8Array(newBuffer);
    newView.set(chunkData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', newBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyChunkHash(chunkData: Uint8Array, expectedHash: string): Promise<boolean> {
  const actualHash = await calculateChunkHash(chunkData);
  return actualHash === expectedHash;
}

// File integrity utilities
export async function calculateFileHash(file: File): Promise<string> {
  const HASH_CHUNK_SIZE = 1024 * 1024; // 1MB chunks for hashing
  const hasher = await crypto.subtle.digest('SHA-256', new ArrayBuffer(0)); // Initialize
  
  let offset = 0;
  const chunks: Uint8Array[] = [];
  
  while (offset < file.size) {
    const end = Math.min(offset + HASH_CHUNK_SIZE, file.size);
    const slice = file.slice(offset, end);
    const arrayBuffer = await slice.arrayBuffer();
    chunks.push(new Uint8Array(arrayBuffer));
    offset = end;
  }
  
  // Combine all chunks and hash
  const totalSize = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const combined = new Uint8Array(totalSize);
  let position = 0;
  
  for (const chunk of chunks) {
    combined.set(chunk, position);
    position += chunk.length;
  }
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyFileHash(receivedChunks: Uint8Array[], expectedHash: string): Promise<boolean> {
  const totalSize = receivedChunks.reduce((size, chunk) => size + chunk.length, 0);
  const combined = new Uint8Array(totalSize);
  let position = 0;
  
  for (const chunk of receivedChunks) {
    combined.set(chunk, position);
    position += chunk.length;
  }
  
  const actualHash = await calculateChunkHash(combined);
  return actualHash === expectedHash;
}