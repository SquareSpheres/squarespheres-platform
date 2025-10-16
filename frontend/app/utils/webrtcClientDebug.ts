/**
 * WebRTC Client Peer Debug Logger
 * 
 * Centralizes all debug logging for client peer operations
 */
export class WebRTCClientDebugLogger {
  constructor(
    private enabled: boolean = false
  ) {}

  logConnectionTimeout() {
    if (this.enabled) {
      console.warn('[WebRTC Client] Connection timeout');
    }
  }

  logConnectionFailed(error: unknown) {
    if (this.enabled) {
      console.error('[WebRTC Client] Connection failed:', error);
    }
  }

  logConnectionState(state: RTCPeerConnectionState) {
    if (this.enabled && (state === 'connected' || state === 'failed')) {
      console.log(`[WebRTC Client] Connection: ${state}`);
    }
  }

  logIceState(state: RTCIceConnectionState) {
    if (this.enabled && (state === 'connected' || state === 'failed')) {
      console.log(`[WebRTC Client] ICE: ${state}`);
    }
  }

  logConnectionRetryAttempt() {
    if (this.enabled) {
      console.log('[WebRTC Client] Attempting connection retry');
    }
  }

  logRetrying() {
    if (this.enabled) {
      console.log('[WebRTC Client] Retrying connection...');
    }
  }

  logRetryFailed(error: unknown) {
    if (this.enabled) {
      console.error('[WebRTC Client] Retry failed:', error);
    }
  }

  logDataChannelReceived(readyState: RTCDataChannelState) {
    if (this.enabled) {
      console.log(`[WebRTC Client] Data channel received: ${readyState}`);
    }
  }

  logReceivedOffer() {
    if (this.enabled) {
      console.log('[WebRTC Client] Received offer from host');
    }
  }

  logSendingAnswer() {
    if (this.enabled) {
      console.log('[WebRTC Client] Sending answer to host');
    }
  }

  logReceivedAnswer() {
    if (this.enabled) {
      console.log('[WebRTC Client] Received answer from host');
    }
  }

  logIceConnectionTimeout() {
    if (this.enabled) {
      console.log('[WebRTC Client] Setting ICE connection timeout');
    }
  }

  logIceConnectionStuck(state: RTCIceConnectionState) {
    if (this.enabled) {
      console.warn(`[WebRTC Client] ICE connection stuck in ${state} state, attempting restart`);
    }
  }

  logIceRestartFailed(error: unknown) {
    if (this.enabled) {
      console.error('[WebRTC Client] ICE restart failed:', error);
    }
  }

  logConnectionRejected(reason: string) {
    if (this.enabled) {
      console.log(`[WebRTC Client] Connection rejected: ${reason}`);
    }
  }

  logIceGatheringTimeout() {
    if (this.enabled) {
      console.warn('[WebRTC Client] ICE gathering timeout, proceeding anyway');
    }
  }

  logSendingOffer() {
    if (this.enabled) {
      console.log('[WebRTC Client] Sending offer to host');
    }
  }

  logFullyDisconnected() {
    if (this.enabled) {
      console.log('[WebRTC Client] Fully disconnected - WebRTC and signaling');
    }
  }

  logParseFailed(error: unknown) {
    if (this.enabled) {
      console.warn('[WebRTC Client] Failed to parse signaling message:', error);
    }
  }

  logIceDiagnostics(pc: RTCPeerConnection) {
    if (this.enabled) {
      console.log('[WebRTC Client] ICE connection state after adding pending candidates:', pc.iceConnectionState);
      console.log('[WebRTC Client] ICE gathering state:', pc.iceGatheringState);
      console.log('[WebRTC Client] Connection state:', pc.connectionState);
    }
  }

  logSignalingError(kind: string, error: unknown) {
    if (this.enabled) {
      console.error(`[WebRTC Client] Error handling ${kind}:`, error);
    }
  }
}

/**
 * Creates a WebRTC client debug logger
 */
export function createClientDebugLogger(enabled: boolean = false): WebRTCClientDebugLogger {
  return new WebRTCClientDebugLogger(enabled);
}

