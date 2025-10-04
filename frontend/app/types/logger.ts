// src/types/logger.ts

/**
 * Basic logging interface used throughout WebRTC file-transfer hooks.
 * Mirrors the common console methods but allows injection of custom loggers.
 */
export interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}
