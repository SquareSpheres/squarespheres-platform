'use client';

import { useCallback, useRef, useState } from 'react';

export interface FileTransferProgress {
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  percentage: number;
  status: 'pending' | 'transferring' | 'completed' | 'error';
  error?: string;
}

interface ProgressCallbacks {
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (file: Blob | null, fileName: string | null) => void;
  onError?: (error: string) => void;
}

const PROGRESS_UPDATE_THROTTLE = 16; // Update at most every 16ms (~60fps for smooth progress)

export function useTransferProgress(callbacks: ProgressCallbacks = {}) {
  const [transferProgress, setTransferProgress] = useState<FileTransferProgress | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const lastProgressUpdateRef = useRef<number>(0);

  const updateProgress = useCallback((newProgress: FileTransferProgress | null) => {
    setTransferProgress(newProgress);
    
    if (newProgress && callbacks.onProgress) {
      callbacks.onProgress(newProgress);
    }
    
    // Handle completion
    if (newProgress?.status === 'completed' && callbacks.onComplete) {
      callbacks.onComplete(null, newProgress.fileName);
    }
    
    // Handle errors
    if (newProgress?.status === 'error' && newProgress.error && callbacks.onError) {
      callbacks.onError(newProgress.error);
    }
  }, [callbacks]);

  const updateProgressThrottled = useCallback((updateFn: (prev: FileTransferProgress | null) => FileTransferProgress | null) => {
    const now = Date.now();
    if (now - lastProgressUpdateRef.current >= PROGRESS_UPDATE_THROTTLE) {
      const newProgress = updateFn(transferProgress);
      updateProgress(newProgress);
      lastProgressUpdateRef.current = now;
    }
  }, [transferProgress, updateProgress]);

  const startTransfer = useCallback((fileName: string, fileSize: number) => {
    const initialProgress: FileTransferProgress = {
      fileName,
      fileSize,
      bytesTransferred: 0,
      percentage: 0,
      status: 'transferring'
    };
    setTransferProgress(initialProgress);
    setIsTransferring(true);
    
    console.log('[Progress] Starting transfer:', { fileName, fileSize });
    
    if (callbacks.onProgress) {
      console.log('[Progress] Calling onProgress callback');
      callbacks.onProgress(initialProgress);
    } else {
      console.warn('[Progress] No onProgress callback registered');
    }
  }, [callbacks]);

  const completeTransfer = useCallback(() => {
    setTransferProgress(prev => {
      if (!prev) return null;
      
      // Ensure progress shows 100% before completion
      const completed = { 
        ...prev, 
        status: 'completed' as const,
        bytesTransferred: prev.fileSize,
        percentage: 100
      };
      
      // Show 100% progress first
      if (callbacks.onProgress) {
        callbacks.onProgress(completed);
      }
      
      // Then call completion callback
      if (callbacks.onComplete) {
        callbacks.onComplete(null, completed.fileName);
      }
      
      return completed;
    });
    setIsTransferring(false);
  }, [callbacks]);

  const failTransfer = useCallback((error: string) => {
    setTransferProgress(prev => {
      if (!prev) return null;
      const failed = { ...prev, status: 'error' as const, error };
      
      if (callbacks.onError) {
        callbacks.onError(error);
      }
      
      return failed;
    });
    setIsTransferring(false);
  }, [callbacks]);

  const clearTransfer = useCallback(() => {
    setTransferProgress(null);
    setIsTransferring(false);
    lastProgressUpdateRef.current = 0;
  }, []);

  const updateBytesTransferred = useCallback((additionalBytes: number) => {
    // Always update the internal state immediately for UI responsiveness
    setTransferProgress(prev => {
      if (!prev) return null;
      const newBytesTransferred = prev.bytesTransferred + additionalBytes;
      const percentage = Math.round((newBytesTransferred / prev.fileSize) * 100);
      
      const newProgress = {
        ...prev,
        bytesTransferred: newBytesTransferred,
        percentage
      };
      
      // Force update at milestone percentages (every 5%) to ensure visible progress
      const oldPercentage = Math.round((prev.bytesTransferred / prev.fileSize) * 100);
      const shouldForceUpdate = Math.floor(percentage / 5) > Math.floor(oldPercentage / 5);
      
      console.log('[Progress] Update:', { 
        additionalBytes, 
        newBytesTransferred, 
        percentage, 
        shouldForceUpdate,
        hasCallback: !!callbacks.onProgress 
      });
      
      // Always call progress callback for UI updates (not just milestones)
      if (callbacks.onProgress) {
        console.log('[Progress] Updating progress callback');
        callbacks.onProgress(newProgress);
        lastProgressUpdateRef.current = Date.now();
      }
      
      return newProgress;
    });
    
    // Also update via throttled mechanism for external callbacks
    updateProgressThrottled(prev => {
      if (!prev) return null;
      const newBytesTransferred = prev.bytesTransferred + additionalBytes;
      const percentage = Math.round((newBytesTransferred / prev.fileSize) * 100);
      
      return {
        ...prev,
        bytesTransferred: newBytesTransferred,
        percentage
      };
    });
  }, [updateProgressThrottled, callbacks]);

  return {
    transferProgress,
    isTransferring,
    startTransfer,
    completeTransfer,
    failTransfer,
    clearTransfer,
    updateProgress,
    updateProgressThrottled,
    updateBytesTransferred
  };
}
