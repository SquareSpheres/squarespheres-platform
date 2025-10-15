/**
 * Transfer timeout calculation utilities
 * 
 * Provides adaptive timeout calculations based on transfer rate and file size
 */

/**
 * Calculate adaptive timeout based on transfer rate and remaining bytes
 * 
 * @param fileSize - Total size of the file in bytes
 * @param bytesReceived - Number of bytes received so far
 * @param startTime - Timestamp when the transfer started
 * @param baseTimeoutMs - Base timeout in milliseconds (default: 30000)
 * @returns Adaptive timeout in milliseconds
 */
export function calculateAdaptiveTimeout(
  fileSize: number,
  bytesReceived: number,
  startTime: number,
  baseTimeoutMs: number = 30000
): number {
  const elapsedTime = Date.now() - startTime;
  const bytesRemaining = fileSize - bytesReceived;
  
  // If no progress yet or no time elapsed, use base timeout
  if (bytesReceived === 0 || elapsedTime === 0) {
    return baseTimeoutMs;
  }
  
  // Calculate transfer rate
  const bytesPerSecond = bytesReceived / (elapsedTime / 1000);
  const estimatedRemainingSeconds = bytesRemaining / bytesPerSecond;
  
  // Add 3x buffer and ensure minimum timeout
  const adaptiveTimeoutMs = Math.max(baseTimeoutMs, estimatedRemainingSeconds * 1000 * 3);
  
  // Cap at 5x base timeout to prevent extremely long timeouts
  return Math.min(adaptiveTimeoutMs, baseTimeoutMs * 5);
}

/**
 * Calculate transfer rate in bytes per second
 */
export function calculateTransferRate(
  bytesReceived: number,
  startTime: number
): number {
  const elapsedTime = Date.now() - startTime;
  if (elapsedTime === 0) return 0;
  return bytesReceived / (elapsedTime / 1000);
}

/**
 * Estimate remaining transfer time in seconds
 */
export function estimateRemainingTime(
  fileSize: number,
  bytesReceived: number,
  startTime: number
): number {
  const bytesRemaining = fileSize - bytesReceived;
  const transferRate = calculateTransferRate(bytesReceived, startTime);
  
  if (transferRate === 0) return Infinity;
  return bytesRemaining / transferRate;
}

/**
 * Format time duration for display (e.g., "1m 30s", "45s")
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return 'calculating...';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

