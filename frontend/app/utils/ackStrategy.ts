import { FILE_SIZE_THRESHOLDS } from './fileTransferConstants';

/**
 * ACK (Acknowledgment) strategy for different file sizes
 * 
 * Determines when to send acknowledgments based on file size and transfer progress
 */

export interface AckDecision {
  send: boolean;
  reason: string;
  currentPercentage: number;
}

export interface TransferInfo {
  fileSize: number;
  bytesReceived: number;
  startTime: number;
  lastLoggedPercentage?: number;
  lastAckTime?: number;
}

/**
 * Small file strategy: Send ACK on every 1% progress
 */
function smallFileStrategy(
  transferInfo: TransferInfo,
  currentPercentage: number
): AckDecision {
  const send = currentPercentage > (transferInfo.lastLoggedPercentage || 0);
  return {
    send,
    reason: '1% interval (small file)',
    currentPercentage
  };
}

/**
 * Medium file strategy: Send ACK on every 2% progress
 */
function mediumFileStrategy(
  transferInfo: TransferInfo,
  currentPercentage: number
): AckDecision {
  const send = currentPercentage > (transferInfo.lastLoggedPercentage || 0) &&
               currentPercentage % 2 === 0;
  return {
    send,
    reason: '2% interval (medium file)',
    currentPercentage
  };
}

/**
 * Large file strategy: Send ACK based on time (500ms) or percentage (5%)
 */
function largeFileStrategy(
  transferInfo: TransferInfo,
  currentPercentage: number
): AckDecision {
  const lastAckTime = transferInfo.lastAckTime || transferInfo.startTime;
  const timeSinceLastAck = Date.now() - lastAckTime;
  const sendByTime = timeSinceLastAck >= 500;
  const sendByPercentage = currentPercentage > (transferInfo.lastLoggedPercentage || 0) &&
                           currentPercentage % 5 === 0;

  const send = sendByTime || sendByPercentage;
  const reason = sendByTime ? '500ms interval (large file)' : '5% interval (large file)';
  
  return { send, reason, currentPercentage };
}

/**
 * Determines if an ACK should be sent based on transfer info
 */
export function shouldSendAck(transferInfo: TransferInfo): AckDecision {
  const currentPercentage = Math.round((transferInfo.bytesReceived / transferInfo.fileSize) * 100);

  // Always send ACK at 100% completion
  if (currentPercentage >= 100 && (transferInfo.lastLoggedPercentage || 0) < 100) {
    return {
      send: true,
      reason: '100% completion',
      currentPercentage
    };
  }

  // Select strategy based on file size
  if (transferInfo.fileSize < FILE_SIZE_THRESHOLDS.SMALL) {
    return smallFileStrategy(transferInfo, currentPercentage);
  } else if (transferInfo.fileSize < FILE_SIZE_THRESHOLDS.MEDIUM) {
    return mediumFileStrategy(transferInfo, currentPercentage);
  } else {
    return largeFileStrategy(transferInfo, currentPercentage);
  }
}

