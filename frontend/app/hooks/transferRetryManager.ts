'use client';

import { useCallback, useRef } from 'react';
import { createLogger } from './fileTransferUtils';

interface RetryInfo {
  chunkIndex: number;
  retryCount: number;
  maxRetries: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second delay between retries

export function useTransferRetryManager(role: 'host' | 'client', debug: boolean = false) {
  const logger = createLogger(role, debug);
  const retryQueueRef = useRef<Map<string, RetryInfo>>(new Map());

  const addToRetryQueue = useCallback((transferId: string, chunkIndex: number) => {
    const retryKey = `${transferId}-${chunkIndex}`;
    const existing = retryQueueRef.current.get(retryKey);
    
    if (existing) {
      existing.retryCount++;
    } else {
      retryQueueRef.current.set(retryKey, {
        chunkIndex,
        retryCount: 1,
        maxRetries: MAX_RETRIES
      });
    }
    
    logger.log(`Added chunk ${chunkIndex} to retry queue (attempt ${existing ? existing.retryCount : 1}/${MAX_RETRIES})`);
  }, [logger]);

  const removeFromRetryQueue = useCallback((transferId: string, chunkIndex: number) => {
    const retryKey = `${transferId}-${chunkIndex}`;
    retryQueueRef.current.delete(retryKey);
  }, []);

  const getRetriesForTransfer = useCallback((transferId: string): RetryInfo[] => {
    return Array.from(retryQueueRef.current.entries())
      .filter(([key]) => key.startsWith(transferId))
      .map(([, retryInfo]) => retryInfo);
  }, []);

  const shouldRetry = useCallback((transferId: string, chunkIndex: number): boolean => {
    const retryKey = `${transferId}-${chunkIndex}`;
    const retryInfo = retryQueueRef.current.get(retryKey);
    
    if (!retryInfo) return true; // First attempt
    
    return retryInfo.retryCount <= retryInfo.maxRetries;
  }, []);

  const getRetryCount = useCallback((transferId: string, chunkIndex: number): number => {
    const retryKey = `${transferId}-${chunkIndex}`;
    const retryInfo = retryQueueRef.current.get(retryKey);
    return retryInfo?.retryCount || 0;
  }, []);

  const clearRetryQueue = useCallback((transferId?: string) => {
    if (transferId) {
      // Clear retries for specific transfer
      const keysToDelete = Array.from(retryQueueRef.current.keys())
        .filter(key => key.startsWith(transferId));
      
      keysToDelete.forEach(key => {
        retryQueueRef.current.delete(key);
      });
    } else {
      // Clear all retries
      retryQueueRef.current.clear();
    }
  }, []);

  const processRetryQueue = useCallback(async (
    transferId: string,
    retrySendFunction: (chunkIndex: number, retryCount: number) => Promise<boolean>
  ): Promise<number> => {
    const retries = getRetriesForTransfer(transferId);
    
    if (retries.length === 0) return 0;
    
    logger.log(`Processing ${retries.length} retries for transfer ${transferId}`);
    
    let successfulRetries = 0;
    
    for (const retry of retries) {
      if (retry.retryCount > retry.maxRetries) {
        logger.error(`Max retries exceeded for chunk ${retry.chunkIndex}`);
        removeFromRetryQueue(transferId, retry.chunkIndex);
        continue;
      }
      
      try {
        const success = await retrySendFunction(retry.chunkIndex, retry.retryCount);
        
        if (success) {
          logger.log(`Successfully retried chunk ${retry.chunkIndex} (attempt ${retry.retryCount})`);
          removeFromRetryQueue(transferId, retry.chunkIndex);
          successfulRetries++;
        } else {
          logger.error(`Retry failed for chunk ${retry.chunkIndex}`);
          addToRetryQueue(transferId, retry.chunkIndex); // This will increment retry count
        }
        
        // Add delay between retries
        if (retry.chunkIndex < retries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
        
      } catch (error) {
        logger.error(`Retry failed for chunk ${retry.chunkIndex}:`, error);
        addToRetryQueue(transferId, retry.chunkIndex); // This will increment retry count
      }
    }
    
    return successfulRetries;
  }, [logger, getRetriesForTransfer, removeFromRetryQueue, addToRetryQueue]);

  return {
    addToRetryQueue,
    removeFromRetryQueue,
    getRetriesForTransfer,
    shouldRetry,
    getRetryCount,
    clearRetryQueue,
    processRetryQueue
  };
}
