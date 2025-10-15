'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type TransferProgress = {
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  percentage: number;
  status: 'transferring' | 'completed' | 'error';
  startTime?: number;
  error?: string;
};

export type ProgressCallbacks = {
  onProgress?: (p: TransferProgress) => void;
  onComplete?: (file?: Blob, fileName?: string) => void;
  onError?: (err: string) => void;
};

export function useTransferProgress(initialCallbacks?: ProgressCallbacks) {
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  // Keep callbacks in ref so methods remain stable
  const callbacksRef = useRef<ProgressCallbacks>(initialCallbacks || {});
  useEffect(() => {
    callbacksRef.current = initialCallbacks || {};
  }, [initialCallbacks]);

  const startTransfer = useCallback((fileName: string, fileSize: number) => {
    const initial: TransferProgress = {
      fileName,
      fileSize,
      bytesTransferred: 0,
      percentage: 0,
      status: 'transferring',
      startTime: Date.now()
    };

    setTransferProgress(initial);
    setIsTransferring(true);
    callbacksRef.current.onProgress?.(initial);
  }, []);

  const updateBytesTransferred = useCallback((additionalBytes: number) => {
    setTransferProgress(prev => {
      if (!prev) return prev;

      const bytes = prev.bytesTransferred + additionalBytes;
      const percent = prev.fileSize > 0 
        ? Math.min(100, Math.round((bytes / prev.fileSize) * 100)) 
        : 0;
      
      const next: TransferProgress = {
        ...prev,
        bytesTransferred: bytes,
        percentage: percent
      };

      callbacksRef.current.onProgress?.(next);
      return next;
    });
  }, []);

  const completeTransfer = useCallback((maybeFile?: Blob, fileName?: string) => {
    setTransferProgress(prev => {
      if (!prev) {
        const completed: TransferProgress = {
          fileName: fileName || 'unknown',
          fileSize: maybeFile?.size || 0,
          bytesTransferred: maybeFile?.size || 0,
          percentage: 100,
          status: 'completed',
        };
        callbacksRef.current.onProgress?.(completed);
        return completed;
      }

      const completed: TransferProgress = {
        ...prev,
        bytesTransferred: prev.fileSize,
        percentage: 100,
        status: 'completed'
      };

      callbacksRef.current.onProgress?.(completed);
      return completed;
    });

    setIsTransferring(false);
    callbacksRef.current.onComplete?.(maybeFile, fileName);
  }, []);

  const errorTransfer = useCallback((errMsg: string) => {
    setTransferProgress(prev => {
      const next: TransferProgress = prev 
        ? { ...prev, status: 'error', error: errMsg }
        : {
            fileName: 'unknown',
            fileSize: 0,
            bytesTransferred: 0,
            percentage: 0,
            status: 'error',
            error: errMsg
          };
      
      callbacksRef.current.onProgress?.(next);
      callbacksRef.current.onError?.(errMsg);
      return next;
    });
    setIsTransferring(false);
  }, []);

  const clearTransfer = useCallback(() => {
    setTransferProgress(null);
    setIsTransferring(false);
  }, []);

  const resetProgress = useCallback(() => {
    setTransferProgress(null);
    setIsTransferring(false);
  }, []);

  // Create stable manager object
  const progressManager = useRef({
    startTransfer,
    updateBytesTransferred,
    completeTransfer,
    errorTransfer,
    clearTransfer,
    resetProgress
  });

  // Update manager methods when callbacks change
  useEffect(() => {
    progressManager.current = {
      startTransfer,
      updateBytesTransferred,
      completeTransfer,
      errorTransfer,
      clearTransfer,
      resetProgress
    };
  }, [startTransfer, updateBytesTransferred, completeTransfer, errorTransfer, clearTransfer, resetProgress]);

  return {
    transferProgress,
    isTransferring,
    progressManager: progressManager.current
  };
}
