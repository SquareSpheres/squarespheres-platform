// src/types/logger.ts

/**
 * Basic logging interface used throughout WebRTC file-transfer hooks.
 * Mirrors the common console methods but allows injection of custom loggers.
 */
export interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
}

/**
 * Default console logger implementation
 */
export const consoleLogger: Logger = {
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  info: (...args) => console.info(...args),
};

/**
 * Creates a logger with a prefix for consistent formatting
 */
export function createLogger(prefix: string, baseLogger: Logger = consoleLogger): Logger {
  return {
    log: (...args) => baseLogger.log(`[${prefix}]`, ...args),
    warn: (...args) => baseLogger.warn(`[${prefix}]`, ...args),
    error: (...args) => baseLogger.error(`[${prefix}]`, ...args),
    info: (...args) => baseLogger.info?.(`[${prefix}]`, ...args),
  };
}
