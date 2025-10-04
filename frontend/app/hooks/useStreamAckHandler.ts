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

  const handleFileAck = (transferId: string, progress: number) => {
    logger.log(`Received ACK for transfer ${transferId}: ${progress}%`);
    
    setAckProgress(prev => {
      if (!prev) {
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
      
      const bytesAcknowledged = Math.round((progress / 100) * prev.fileSize);
      return {
        ...prev,
        bytesAcknowledged,
        percentage: progress,
        status: progress >= 100 ? 'completed' as const : 'acknowledging' as const
      };
    });
  };

  return { handleFileAck };
}
