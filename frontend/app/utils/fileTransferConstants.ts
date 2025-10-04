// src/utils/fileTransferConstants.ts

/**
 * Backpressure thresholds in bytes.
 * These can be tuned based on device type.
 */
export const BACKPRESSURE_THRESHOLDS = {
  MOBILE: 64 * 1024,   // 64 KB
  DESKTOP: 128 * 1024, // 128 KB
} as const;

/**
 * Timeouts for file transfers, in milliseconds.
 */
export const TRANSFER_TIMEOUTS = {
  DEFAULT: 10000,
  LARGE: 30000,
} as const;

/**
 * Minimum delay between sending progress ACKs, in ms.
 */
export const MIN_ACK_INTERVAL_MS = 200;

/**
 * How many chunks between UI/yield intervals.
 */
export const YIELD_CHUNK_INTERVAL = 10;

/**
 * Maximum buffer sizes for different device types, in bytes.
 */
export const MAX_BUFFER_SIZES = {
  MOBILE: 512 * 1024,   // 512 KB
  DESKTOP: 1024 * 1024, // 1 MB
} as const;

/**
 * File size thresholds for different transfer strategies, in bytes.
 */
export const FILE_SIZE_THRESHOLDS = {
  SMALL: 10 * 1024 * 1024,    // 10 MB
  MEDIUM: 100 * 1024 * 1024,  // 100 MB
} as const;

/**
 * Progress milestone percentages for logging.
 */
export const PROGRESS_MILESTONES = [10, 30, 50, 70, 90, 100] as const;
