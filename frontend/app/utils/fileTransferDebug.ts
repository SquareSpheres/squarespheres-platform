import { Logger } from '../types/logger';

/**
 * File transfer debug logger
 * 
 * Centralizes all debug logging for file transfer operations
 */
export class FileTransferDebugLogger {
  constructor(
    private logger: Logger,
    private enabled: boolean = true
  ) {}

  logTransferStart(fileName: string, fileSize: number, transferId: string) {
    if (this.enabled) {
      this.logger.log('Starting stream-based file transfer:', {
        fileName,
        fileSize,
        transferId
      });
    }
  }

  logProgressMilestone(percentage: number, bytesTransferred: number, totalSize: number) {
    if (this.enabled) {
      this.logger.log(
        `Host progress milestone: ${percentage}% (${bytesTransferred}/${totalSize} bytes)`
      );
    }
  }

  logBufferDrainStart() {
    if (this.enabled) {
      this.logger.log('Waiting for buffer to drain before marking transfer complete...');
    }
  }

  logBufferDrainSuccess() {
    if (this.enabled) {
      this.logger.log('Buffer drained successfully, sending completion message');
    }
  }

  logBufferDrainWarning(message: string) {
    if (this.enabled) {
      this.logger.warn(message);
    }
  }

  logBufferDrainError(error: unknown) {
    if (this.enabled) {
      this.logger.warn('Buffer drain failed, proceeding with completion:', error);
    }
  }

  logFileEndSent() {
    if (this.enabled) {
      this.logger.log('Sent FILE_END, waiting for FILE_END_ACK...');
    }
  }

  logTransferError(error: unknown) {
    this.logger.error('Stream file transfer failed:', error);
  }

  logTransferCancel(transferId?: string) {
    if (this.enabled) {
      this.logger.log('Cancelling transfer:', transferId || 'current');
    }
  }

  logTransferClear() {
    if (this.enabled) {
      this.logger.log('Clearing stream transfer state');
    }
  }

  logAckSent(transferId: string, progress: number) {
    if (this.enabled) {
      this.logger.log(`Sent ACK for transfer ${transferId}: ${progress}%`);
    }
  }
}

/**
 * Creates a file transfer debug logger
 */
export function createFileTransferLogger(logger: Logger, enabled: boolean = true): FileTransferDebugLogger {
  return new FileTransferDebugLogger(logger, enabled);
}

