// src/hooks/useStreamMessageHandlers.ts

import { useCallback } from 'react';
import { MESSAGE_TYPES } from '../constants/messageTypes';
import type {
  FileTransferAckProgress,
} from '../types/fileTransfer';
import type { Logger } from '../types/logger';
import type { ProgressManager } from '../types/progressManager';
import type { FileTransferConfig } from '../types/fileTransferConfig';
import { createStreamHandlersCore } from './useStreamHandlersCore';
import { createAckHandler } from './useStreamAckHandler';

export function useStreamMessageHandlers({
  logger,
  progressManager,
  transferBuffersRef,
  transferInfoRef,
  transferTimeoutsRef,
  resetTimeout,
  setReceivedFile,
  setReceivedFileName,
  setAckProgress,
  config,
  sendAckWithPeers,
}: {
  logger: Logger;
  progressManager: ProgressManager;
  transferBuffersRef: React.RefObject<Map<string, Uint8Array>>;
  transferInfoRef: React.RefObject<Map<string, {
    fileName: string;
    fileSize: number;
    bytesReceived: number;
    startTime: number;
    lastLoggedPercentage?: number;
    lastAckTime?: number;
  }>>;
  transferTimeoutsRef: React.RefObject<Map<string, NodeJS.Timeout>>;
  resetTimeout: (transferId: string, ms: number, callback: () => void) => void;
  setReceivedFile: React.Dispatch<React.SetStateAction<Blob | null>>;
  setReceivedFileName: React.Dispatch<React.SetStateAction<string | null>>;
  setAckProgress: React.Dispatch<React.SetStateAction<FileTransferAckProgress | null>>;
  config: FileTransferConfig;
  sendAckWithPeers: (transferId: string, progress: number) => void;
}) {

  const { handleFileError, handleFileStart, handleFileData, handleFileComplete } = createStreamHandlersCore({
    logger,
    progressManager,
    transferBuffersRef,
    transferInfoRef,
    transferTimeoutsRef,
    resetTimeout,
    setReceivedFile,
    setReceivedFileName,
    setAckProgress,
    config,
    sendAckWithPeers,
  });

  const { handleFileAck } = createAckHandler({
    logger,
    transferInfoRef,
    setAckProgress,
  });

  const parseAndHandleMessage = useCallback(async (
    data: string | ArrayBuffer,
    handlers: {
      handleFileStart: (transferId: string, fileName: string, fileSize: number) => Promise<void>;
      handleFileData: (transferId: string, data: Uint8Array, offset: number) => Promise<void>;
      handleFileComplete: (transferId: string, completionData?: { totalBytes?: number; checksum?: string; transferTime?: number }) => Promise<void>;
      handleFileError: (transferId: string, error: string) => void;
      handleFileAck: (transferId: string, progress: number) => void;
      logger: Logger;
    }
  ) => {
    const { handleFileStart, handleFileData, handleFileComplete, handleFileError, handleFileAck, logger } = handlers;

    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        switch (message.type) {
          case MESSAGE_TYPES.FILE_START:
            await handleFileStart(message.transferId, message.fileName, message.fileSize);
            break;
          case MESSAGE_TYPES.FILE_COMPLETE:
            await handleFileComplete(message.transferId, {
              totalBytes: message.totalBytes,
              checksum: message.checksum,
              transferTime: message.transferTime
            });
            break;
          case MESSAGE_TYPES.FILE_ERROR:
            handleFileError(message.transferId, message.error);
            break;
          case MESSAGE_TYPES.FILE_ACK:
            handleFileAck(message.transferId, message.progress);
            break;
          default:
            logger.warn('Unknown string message type:', message.type);
        }
      } catch (error) {
        logger.error('Failed to parse string message:', error);
      }
    } else if (data instanceof ArrayBuffer) {
      if (data.byteLength < 4) {
        logger.error('Binary data message too short');
        return;
      }
      
      const view = new DataView(data);
      const type = view.getUint32(0, true);
      
      if (type === MESSAGE_TYPES.FILE_DATA) {
        if (data.byteLength < 12) {
          logger.error('File data message too short');
          return;
        }
        
        const transferIdLength = view.getUint32(4, true);
        const offset = view.getUint32(8, true);
        
        if (data.byteLength < 12 + transferIdLength) {
          logger.error('File data message invalid length');
          return;
        }
        
        const transferIdBytes = new Uint8Array(data, 12, transferIdLength);
        const transferId = new TextDecoder().decode(transferIdBytes);
        const fileData = new Uint8Array(data, 12 + transferIdLength);
        
        await handleFileData(transferId, fileData, offset);
      } else {
        logger.warn('Unknown binary message type:', type);
      }
    }
  }, []);



  const handleMessage = useCallback(async (data: string | ArrayBuffer | Blob) => {
    if (data instanceof Blob) {
      try {
        const arrayBuffer = await data.arrayBuffer();
        await handleMessage(arrayBuffer);
      } catch (error) {
        logger.error('Failed to convert blob to array buffer:', error);
      }
      return;
    }

    await parseAndHandleMessage(data, {
      handleFileStart,
      handleFileData,
      handleFileComplete,
      handleFileError,
      handleFileAck,
      logger
    });
  }, [handleFileStart, handleFileData, handleFileComplete, handleFileError, handleFileAck, logger, parseAndHandleMessage]);

  return {
    handleMessage,
    handleFileStart,
    handleFileData,
    handleFileComplete,
    handleFileAck,
    handleFileError,
  };
}
