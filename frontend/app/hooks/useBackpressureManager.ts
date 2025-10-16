// src/hooks/useBackpressureManager.ts

import { useCallback, useRef } from 'react';
import { isMobileDevice } from './fileTransferUtils';
import { BACKPRESSURE_THRESHOLDS, MAX_BUFFER_SIZES, TRANSFER_TIMEOUTS } from '../utils/fileTransferConstants';
import type { WebRTCHostPeer } from '../types/fileTransfer';
import type { Logger } from '../types/logger';
import type { FileTransferConfig } from '../types/fileTransferConfig';

/**
 * Hook to manage WebRTC DataChannel backpressure.
 * Ensures smooth sending without flooding the buffer.
 */
export function useBackpressureManager(config: FileTransferConfig, logger: Logger, hostPeer: WebRTCHostPeer) {
  const backpressurePromises = useRef<Map<string, { resolve: () => void; reject: () => void }>>(new Map());
  const backpressureHandlers = useRef<Map<string, () => void>>(new Map());

  /**
   * Attaches a `bufferedamountlow` event listener to a data channel
   * and resolves promises waiting for the buffer to drain.
   */
  const setupBackpressureHandling = useCallback((dataChannel: RTCDataChannel, clientId: string) => {
    const threshold = isMobileDevice() ? BACKPRESSURE_THRESHOLDS.MOBILE : BACKPRESSURE_THRESHOLDS.DESKTOP;
    dataChannel.bufferedAmountLowThreshold = threshold;

    const existingHandler = backpressureHandlers.current.get(clientId);
    if (existingHandler) {
      dataChannel.removeEventListener('bufferedamountlow', existingHandler);
      backpressureHandlers.current.delete(clientId);
    }

    const handleBufferLow = () => {
      const promise = backpressurePromises.current.get(clientId);
      if (promise) {
        promise.resolve();
        backpressurePromises.current.delete(clientId);
        logger.log(`Buffer drained for client ${clientId}, resuming transfer`);
      }
    };

    backpressureHandlers.current.set(clientId, handleBufferLow);
    dataChannel.addEventListener('bufferedamountlow', handleBufferLow);

    return () => {
      dataChannel.removeEventListener('bufferedamountlow', handleBufferLow);
      backpressureHandlers.current.delete(clientId);
    };
  }, [logger]);

  /**
   * Waits for DataChannel buffer to drain before continuing.
   * Prevents overflows and enforces pacing for large file transfers.
   */
  const waitForBackpressure = useCallback(async (clientId: string): Promise<void> => {
    if (config.role !== 'host') return;

    const dataChannel = hostPeer.getDataChannel();

    if (!dataChannel) {
      await new Promise(resolve => setTimeout(resolve, 1));
      return;
    }

    const MAX_BUFFER_SIZE = isMobileDevice() ? MAX_BUFFER_SIZES.MOBILE : MAX_BUFFER_SIZES.DESKTOP;

    if (dataChannel.bufferedAmount < MAX_BUFFER_SIZE) return;

    logger.log(`Buffer full (${Math.round(dataChannel.bufferedAmount / 1024)}KB), waiting for drain event...`);

    return new Promise<void>((resolve, reject) => {
      const promiseKey = clientId || 'default';
      backpressurePromises.current.set(promiseKey, { resolve, reject });

      setupBackpressureHandling(dataChannel, promiseKey);

      // Fallback timeout after 10s
      setTimeout(() => {
        const promise = backpressurePromises.current.get(promiseKey);
        if (promise) {
          promise.reject();
          backpressurePromises.current.delete(promiseKey);
          logger.warn(`Backpressure timeout for client ${promiseKey}`);
        }
      }, TRANSFER_TIMEOUTS.DEFAULT);
    }).catch(() => {
      logger.warn(`Backpressure failed for client ${clientId}, continuing anyway`);
    });
  }, [config.role, hostPeer, logger, setupBackpressureHandling]);

  return { waitForBackpressure, setupBackpressureHandling };
}
