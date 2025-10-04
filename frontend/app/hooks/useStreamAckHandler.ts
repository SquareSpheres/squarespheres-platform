import { useCallback } from 'react';
import type { FileTransferAckProgress } from '../types/fileTransfer';
import type { Logger } from '../types/logger';

export function createAckHandler(params: {
  logger: Logger;
  transferInfoRef: React.RefObject<Map<string, {
    fileName: string;
    fileSize: number;
    bytesReceived: number;
    startTime: number;
    lastLoggedPercentage?: number;
    lastAckTime?: number;
  }>>;
  setAckProgress: React.Dispatch<React.SetStateAction<FileTransferAckProgress | null>>;
}) {
  const { logger, transferInfoRef, setAckProgress } = params;

  const handleFileAck = useCallback((transferId: string, progress: number) => {
    logger.log(`Received ACK for transfer ${transferId}: ${progress}%`);
    
    // Update ACK progress state
    setAckProgress(prev => {
      if (!prev) {
        // Initialize ACK progress if not set
        const transferInfo = transferInfoRef.current?.get(transferId);
        if (transferInfo) {
          return {
            fileName: transferInfo.fileName,
            fileSize: transferInfo.fileSize,
            bytesAcknowledged: Math.round((progress / 100) * transferInfo.fileSize),
            percentage: progress,
            status: 'acknowledging' as const
          };
        }
        return prev;
      }
      
      // Update existing ACK progress
      const bytesAcknowledged = Math.round((progress / 100) * prev.fileSize);
      return {
        ...prev,
        bytesAcknowledged,
        percentage: progress,
        status: progress >= 100 ? 'completed' as const : 'acknowledging' as const
      };
    });
  }, [logger, transferInfoRef, setAckProgress]);

  return { handleFileAck };
}
