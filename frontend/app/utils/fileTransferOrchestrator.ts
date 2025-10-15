import { MESSAGE_TYPES } from '../constants/messageTypes';
import { YIELD_CHUNK_INTERVAL, PROGRESS_MILESTONES } from './fileTransferConstants';
import { Logger } from '../types/logger';

export interface TransferMetadata {
  transferId: string;
  fileName: string;
  fileSize: number;
  startTime: number;
}

export interface ChunkData {
  buffer: ArrayBuffer;
  size: number;
  offset: number;
}

/**
 * Encodes a file chunk into a binary message format
 */
export function encodeFileChunk(
  transferId: string,
  chunkData: Uint8Array,
  offset: number
): ArrayBuffer {
  const transferIdBytes = new TextEncoder().encode(transferId);
  const buffer = new ArrayBuffer(12 + transferIdBytes.length + chunkData.length);
  const view = new DataView(buffer);
  
  view.setUint32(0, MESSAGE_TYPES.FILE_DATA, true);
  view.setUint32(4, transferIdBytes.length, true);
  view.setUint32(8, offset, true);
  
  new Uint8Array(buffer, 12).set(transferIdBytes);
  new Uint8Array(buffer, 12 + transferIdBytes.length).set(chunkData);
  
  return buffer;
}

/**
 * Creates a transfer start message
 */
export function createTransferStartMessage(metadata: TransferMetadata): string {
  return JSON.stringify({
    type: MESSAGE_TYPES.FILE_START,
    transferId: metadata.transferId,
    fileName: metadata.fileName,
    fileSize: metadata.fileSize
  });
}

/**
 * Creates a transfer end message
 */
export function createTransferEndMessage(
  transferId: string,
  totalBytes: number,
  transferTime: number,
  checksum?: string
): string {
  return JSON.stringify({
    type: MESSAGE_TYPES.FILE_END,
    transferId,
    totalBytes,
    transferTime,
    checksum
  });
}

/**
 * Creates an error message
 */
export function createTransferErrorMessage(transferId: string, error: string): string {
  return JSON.stringify({
    type: MESSAGE_TYPES.FILE_ERROR,
    transferId,
    error
  });
}

/**
 * Checks if a progress milestone should be logged
 */
export function shouldLogProgress(
  currentPercentage: number,
  lastLoggedPercentage: number
): boolean {
  return (
    PROGRESS_MILESTONES.includes(currentPercentage as any) &&
    currentPercentage > lastLoggedPercentage
  );
}

/**
 * Checks if the event loop should yield
 */
export function shouldYield(bytesTransferred: number, chunkSize: number): boolean {
  return bytesTransferred % (chunkSize * YIELD_CHUNK_INTERVAL) === 0;
}

/**
 * Generates a unique transfer ID
 */
export function generateTransferId(): string {
  return `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Yields control to the event loop
 */
export async function yieldToEventLoop(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Logs progress milestones
 */
export function logProgressMilestone(
  logger: Logger,
  currentPercentage: number,
  bytesTransferred: number,
  totalSize: number
): void {
  logger.log(
    `Host progress milestone: ${currentPercentage}% (${bytesTransferred}/${totalSize} bytes)`
  );
}

/**
 * Reads a file chunk
 */
export async function readFileChunk(
  file: File,
  start: number,
  end: number
): Promise<Uint8Array> {
  const fileSlice = file.slice(start, end);
  const chunkArrayBuffer = await fileSlice.arrayBuffer();
  return new Uint8Array(chunkArrayBuffer);
}

/**
 * Calculates the end position for a chunk
 */
export function getChunkEnd(start: number, chunkSize: number, fileSize: number): number {
  return Math.min(start + chunkSize, fileSize);
}

