'use client';

import { useCallback, useRef } from 'react';

// Error types for categorization
export enum FileTransferErrorType {
  NETWORK = 'network',
  VALIDATION = 'validation', 
  INTEGRITY = 'integrity',
  STORAGE = 'storage',
  PROTOCOL = 'protocol',
  USER_CANCELLED = 'user_cancelled',
  TIMEOUT = 'timeout',
  PERMISSION = 'permission'
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Structured error context
export interface FileTransferError {
  // Core identification
  correlationId: string;
  transferId: string;
  timestamp: number;
  
  // Error classification
  type: FileTransferErrorType;
  severity: ErrorSeverity;
  message: string;
  code?: string;
  
  // Context information
  context: {
    role: 'host' | 'client';
    fileName?: string;
    fileSize?: number;
    chunkIndex?: number;
    totalChunks?: number;
    bytesTransferred?: number;
    transferProgress?: number;
    connectionState?: RTCPeerConnectionState;
    dataChannelState?: RTCDataChannelState;
    dataSize?: number;
  };
  
  // Technical details
  stack?: string;
  originalError?: Error;
  
  // Recovery information
  retryable: boolean;
  retryAttempt?: number;
  maxRetries?: number;
  
  // Metrics
  transferDuration?: number;
  averageSpeed?: number;
  networkQuality?: 'excellent' | 'good' | 'fair' | 'poor';
}

// Transfer metrics for monitoring
export interface TransferMetrics {
  correlationId: string;
  transferId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  
  // File information
  fileName: string;
  fileSize: number;
  mimeType?: string;
  
  // Transfer performance
  bytesTransferred: number;
  averageSpeed: number; // bytes per second
  peakSpeed: number;
  
  // Network metrics
  totalChunks: number;
  chunksTransferred: number;
  chunksRetried: number;
  chunkFailures: number;
  
  // Quality metrics
  successRate: number; // percentage
  integrityChecksPassed: number;
  integrityChecksFailed: number;
  
  // Connection metrics
  connectionEstablishTime?: number;
  averageRTT?: number;
  bufferOverruns: number;
  
  // Final status
  status: 'completed' | 'failed' | 'cancelled';
  finalError?: FileTransferError;
}

// Recovery strategy definitions
export interface RecoveryStrategy {
  errorType: FileTransferErrorType;
  action: 'retry' | 'reconnect' | 'restart' | 'abort' | 'user_intervention';
  delay?: number;
  maxAttempts: number;
  condition?: (error: FileTransferError) => boolean;
}

// Recovery strategies - defined outside component to avoid recreation
const DEFAULT_RECOVERY_STRATEGIES: RecoveryStrategy[] = [
  {
    errorType: FileTransferErrorType.NETWORK,
    action: 'retry',
    delay: 1000,
    maxAttempts: 3
  },
  {
    errorType: FileTransferErrorType.INTEGRITY,
    action: 'retry',
    delay: 500,
    maxAttempts: 2
  },
  {
    errorType: FileTransferErrorType.TIMEOUT,
    action: 'reconnect',
    delay: 2000,
    maxAttempts: 3
  },
  {
    errorType: FileTransferErrorType.PROTOCOL,
    action: 'restart',
    delay: 1000,
    maxAttempts: 2
  },
  {
    errorType: FileTransferErrorType.USER_CANCELLED,
    action: 'abort',
    maxAttempts: 0
  },
  {
    errorType: FileTransferErrorType.PERMISSION,
    action: 'user_intervention',
    maxAttempts: 0
  }
];

export function useErrorManager(role: 'host' | 'client', debug: boolean = false) {
  // Error history and metrics storage
  const errorsRef = useRef<Map<string, FileTransferError[]>>(new Map());
  const metricsRef = useRef<Map<string, TransferMetrics>>(new Map());
  const activeTransfersRef = useRef<Map<string, { startTime: number; correlationId: string }>>(new Map());

  // Generate correlation ID for tracking related operations
  const generateCorrelationId = useCallback((): string => {
    return `${role}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, [role]);

  // Create structured error
  const createError = useCallback((
    transferId: string,
    type: FileTransferErrorType,
    message: string,
    context: Partial<FileTransferError['context']> = {},
    originalError?: Error
  ): FileTransferError => {
    const correlationId = generateCorrelationId();
    
    // Determine severity based on error type
    let severity: ErrorSeverity;
    switch (type) {
      case FileTransferErrorType.INTEGRITY:
      case FileTransferErrorType.PROTOCOL:
        severity = ErrorSeverity.HIGH;
        break;
      case FileTransferErrorType.NETWORK:
      case FileTransferErrorType.TIMEOUT:
        severity = ErrorSeverity.MEDIUM;
        break;
      case FileTransferErrorType.USER_CANCELLED:
        severity = ErrorSeverity.LOW;
        break;
      case FileTransferErrorType.PERMISSION:
      case FileTransferErrorType.STORAGE:
        severity = ErrorSeverity.CRITICAL;
        break;
      default:
        severity = ErrorSeverity.MEDIUM;
    }
    
    // Determine if error is retryable
    const retryable = ![
      FileTransferErrorType.USER_CANCELLED,
      FileTransferErrorType.PERMISSION
    ].includes(type);
    
    const error: FileTransferError = {
      correlationId,
      transferId,
      timestamp: Date.now(),
      type,
      severity,
      message,
      context: {
        role,
        ...context
      },
      stack: originalError?.stack || new Error().stack,
      originalError,
      retryable
    };
    
    // Store error in history
    if (!errorsRef.current.has(transferId)) {
      errorsRef.current.set(transferId, []);
    }
    errorsRef.current.get(transferId)!.push(error);
    
    if (debug) {
      console.error(`[FileTransfer ${role}] Structured Error:`, {
        correlationId,
        type,
        severity,
        message,
        context
      });
    }
    
    return error;
  }, [role, debug, generateCorrelationId]);

  // Start tracking a transfer
  const startTransfer = useCallback((
    transferId: string,
    fileName: string,
    fileSize: number,
    mimeType?: string
  ): string => {
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    
    activeTransfersRef.current.set(transferId, { startTime, correlationId });
    
    const metrics: TransferMetrics = {
      correlationId,
      transferId,
      startTime,
      fileName,
      fileSize,
      mimeType,
      bytesTransferred: 0,
      averageSpeed: 0,
      peakSpeed: 0,
      totalChunks: 0,
      chunksTransferred: 0,
      chunksRetried: 0,
      chunkFailures: 0,
      successRate: 100,
      integrityChecksPassed: 0,
      integrityChecksFailed: 0,
      bufferOverruns: 0,
      status: 'completed' // Will be updated on completion/failure
    };
    
    metricsRef.current.set(transferId, metrics);
    
    if (debug) {
      console.log(`[FileTransfer ${role}] Transfer started:`, { correlationId, transferId, fileName });
    }
    
    return correlationId;
  }, [role, debug, generateCorrelationId]);

  // Update transfer metrics
  const updateMetrics = useCallback((
    transferId: string,
    updates: Partial<TransferMetrics>
  ) => {
    const metrics = metricsRef.current.get(transferId);
    if (metrics) {
      Object.assign(metrics, updates);
      
      // Calculate derived metrics
      if (updates.bytesTransferred !== undefined && metrics.startTime) {
        const duration = (Date.now() - metrics.startTime) / 1000; // seconds
        metrics.averageSpeed = updates.bytesTransferred / duration;
        metrics.duration = duration;
        
        if (updates.bytesTransferred > 0) {
          metrics.peakSpeed = Math.max(metrics.peakSpeed, metrics.averageSpeed);
        }
      }
    }
  }, []);

  // Complete a transfer
  const completeTransfer = useCallback((
    transferId: string,
    status: 'completed' | 'failed' | 'cancelled',
    finalError?: FileTransferError
  ) => {
    const metrics = metricsRef.current.get(transferId);
    const transfer = activeTransfersRef.current.get(transferId);
    
    if (metrics && transfer) {
      const endTime = Date.now();
      const duration = (endTime - transfer.startTime) / 1000;
      
      updateMetrics(transferId, {
        endTime,
        duration,
        status,
        finalError,
        successRate: status === 'completed' ? 100 : 
                    metrics.chunksTransferred > 0 ? 
                    (metrics.chunksTransferred / metrics.totalChunks) * 100 : 0
      });
      
      if (debug) {
        console.log(`[FileTransfer ${role}] Transfer ${status}:`, {
          correlationId: transfer.correlationId,
          transferId,
          duration,
          averageSpeed: metrics.averageSpeed,
          successRate: metrics.successRate
        });
      }
    }
    
    activeTransfersRef.current.delete(transferId);
  }, [role, debug, updateMetrics]);

  // Get recovery strategy for an error
  const getRecoveryStrategy = useCallback((error: FileTransferError): RecoveryStrategy | null => {
    return DEFAULT_RECOVERY_STRATEGIES.find(strategy => 
      strategy.errorType === error.type &&
      (!strategy.condition || strategy.condition(error))
    ) || null;
  }, []);

  // Get error history for a transfer
  const getErrorHistory = useCallback((transferId: string): FileTransferError[] => {
    return errorsRef.current.get(transferId) || [];
  }, []);

  // Get metrics for a transfer
  const getMetrics = useCallback((transferId: string): TransferMetrics | null => {
    return metricsRef.current.get(transferId) || null;
  }, []);

  // Clean up transfer data
  const cleanup = useCallback((transferId: string) => {
    errorsRef.current.delete(transferId);
    metricsRef.current.delete(transferId);
    activeTransfersRef.current.delete(transferId);
  }, []);

  // Get all active transfers
  const getActiveTransfers = useCallback(() => {
    return Array.from(activeTransfersRef.current.entries()).map(([transferId, data]) => ({
      transferId,
      ...data,
      metrics: metricsRef.current.get(transferId)
    }));
  }, []);

  return {
    // Error management
    createError,
    getErrorHistory,
    getRecoveryStrategy,
    
    // Transfer tracking
    startTransfer,
    updateMetrics,
    completeTransfer,
    
    // Data access
    getMetrics,
    getActiveTransfers,
    cleanup,
    
    // Utilities
    generateCorrelationId
  };
}
