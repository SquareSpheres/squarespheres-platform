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
  // state visible to components
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  // Keep callbacks in refs so methods remain stable and always call the latest callbacks
  const callbacksRef = useRef<ProgressCallbacks>(initialCallbacks || {});
  useEffect(() => {
    callbacksRef.current = initialCallbacks || {};
  }, [initialCallbacks]);

  // Stable debug logger helper
  const debugLog = (...args: any[]) => {
    // toggle this to false to silence
    const DEBUG = false;
    if (DEBUG) console.log('[Progress]', ...args);
  };

  // Methods are created once and kept stable via refs (no deps)
  const startTransfer = useRef((fileName: string, fileSize: number) => {
    debugLog('========= START TRANSFER (manager) ==========');
    const initial: TransferProgress = {
      fileName,
      fileSize,
      bytesTransferred: 0,
      percentage: 0,
      status: 'transferring',
      startTime: Date.now()
    };

    // Use functional update to avoid depending on stale state
    setTransferProgress(() => {
      debugLog('startTransfer: setting initial progress:', initial);
      return initial;
    });
    setIsTransferring(true);

    // Call any registered callback
    try {
      callbacksRef.current.onProgress?.(initial);
    } catch (err) {
      debugLog('startTransfer callback error:', err);
    }
  }).current;

  const updateBytesTransferred = useRef((additionalBytes: number) => {
    debugLog('updateBytesTransferred called with', additionalBytes);
    setTransferProgress(prev => {
      if (!prev) {
        debugLog('updateBytesTransferred: No previous progress state!');
        // Instead of returning null (which keeps it null), we keep prev as null and rely on caller
        // to call startTransfer first. Still return prev (null) so UI knows nothing changed.
        return prev;
      }

      const bytes = prev.bytesTransferred + additionalBytes;
      const percent = prev.fileSize > 0 ? Math.min(100, Math.round((bytes / prev.fileSize) * 100)) : 0;
      const next: TransferProgress = {
        ...prev,
        bytesTransferred: bytes,
        percentage: percent
      };

      debugLog('updateBytesTransferred ->', next);
      // Fire throttled callbacks from outside if required; for now call onProgress directly
      try {
        callbacksRef.current.onProgress?.(next);
      } catch (err) {
        debugLog('onProgress callback error:', err);
      }

      return next;
    });
  }).current;

  const completeTransfer = useRef((maybeFile?: Blob, fileName?: string) => {
    debugLog('completeTransfer called', fileName);
    setTransferProgress(prev => {
      if (!prev) {
        debugLog('completeTransfer: no prev state, setting completed with unknown file');
        const completed = {
          fileName: fileName || 'unknown',
          fileSize: maybeFile ? maybeFile.size : 0,
          bytesTransferred: maybeFile ? maybeFile.size : 0,
          percentage: 100,
          status: 'completed' as const,
          startTime: undefined
        } as TransferProgress;
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

    try {
      callbacksRef.current.onComplete?.(maybeFile, fileName);
    } catch (err) {
      debugLog('onComplete callback error:', err);
    }
  }).current;

  const errorTransfer = useRef((errMsg: string) => {
    debugLog('errorTransfer called:', errMsg);
    setTransferProgress(prev => {
      const next: TransferProgress = prev ? { ...prev, status: 'error', error: errMsg } : {
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
  }).current;

  const clearTransfer = useRef(() => {
    debugLog('clearTransfer called');
    setTransferProgress(null);
    setIsTransferring(false);
  }).current;

  // Return a stable manager object (useRef ensures identity doesn't change)
  const managerRef = useRef({
    startTransfer,
    updateBytesTransferred,
    completeTransfer,
    errorTransfer,
    clearTransfer
  });

  return {
    transferProgress,
    isTransferring,
    // expose manager methods (callers should call manager.startTransfer(...))
    progressManager: managerRef.current,
    // also export direct helpers for convenience
    startTransfer: managerRef.current.startTransfer,
    updateBytesTransferred: managerRef.current.updateBytesTransferred,
    completeTransfer: managerRef.current.completeTransfer,
    errorTransfer: managerRef.current.errorTransfer,
    clearTransfer: managerRef.current.clearTransfer
  };
}
