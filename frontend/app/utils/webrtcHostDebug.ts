/**
 * WebRTC Host Peer Debug Logger
 * 
 * Centralizes all debug logging for host peer operations
 */
export class WebRTCHostDebugLogger {
  constructor(
    private enabled: boolean = false
  ) {}

  logClientJoined(clientId: string) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Client ${clientId} joined`);
    }
  }

  logClientIgnored(clientId: string, connectedClient: string) {
    if (this.enabled) {
      console.warn(`[WebRTC Host] Ignoring additional client ${clientId} - already connected to ${connectedClient}`);
    }
  }

  logClientDisconnected(clientId: string) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Client ${clientId} disconnected from signaling server`);
    }
  }

  logClientDisconnectedForwarded(clientId: string) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Forwarded onClientDisconnected callback for ${clientId}`);
    }
  }

  logConnectionTimeout(clientId: string) {
    if (this.enabled) {
      console.warn(`[WebRTC Host] Connection timeout for client ${clientId}`);
    }
  }

  logConnectionFailed(clientId: string, error: unknown) {
    if (this.enabled) {
      console.error(`[WebRTC Host] Connection failed for client ${clientId}:`, error);
    }
  }

  logConnectionState(clientId: string, state: RTCPeerConnectionState) {
    if (this.enabled && (state === 'connected' || state === 'failed')) {
      console.log(`[WebRTC Host] Client ${clientId}: ${state}`);
    }
  }

  logClientCleared(clientId: string, state: RTCPeerConnectionState) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Cleared connected client ${clientId} due to ${state} state`);
    }
  }

  logIceConnectionState(clientId: string, state: RTCIceConnectionState) {
    if (this.enabled && (state === 'connected' || state === 'failed')) {
      console.log(`[WebRTC Host] Client ${clientId} ICE: ${state}`);
    }
  }

  logDataChannelReceived(clientId: string, label: string) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Data channel received from client ${clientId} (${label})`);
    }
  }

  logDataChannelOpened(clientId: string) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Data channel opened for client ${clientId}`);
    }
  }

  logDataChannelMaxSize(clientId: string, maxSize: number) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Data channel max message size for client ${clientId}: ${maxSize} bytes`);
    }
  }

  logClosingConnection(clientId?: string) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Closing connection${clientId ? ` for client ${clientId}` : ''}`);
    }
  }

  logUnexpectedOffer(clientId: string) {
    if (this.enabled) {
      console.warn(`[WebRTC Host] Received unexpected offer from ${clientId}`);
    }
  }

  logAnswerCreated(clientId: string) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Created answer for client ${clientId}`);
    }
  }

  logAnswerSet(clientId: string) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Set local description (answer) for client ${clientId}`);
    }
  }

  logRemoteDescriptionSet(clientId: string) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Set remote description for client ${clientId}`);
    }
  }

  logIceCandidateAdded(clientId: string) {
    if (this.enabled) {
      console.log(`[WebRTC Host] Added ICE candidate for client ${clientId}`);
    }
  }
}

/**
 * Creates a WebRTC host debug logger
 */
export function createHostDebugLogger(enabled: boolean = false): WebRTCHostDebugLogger {
  return new WebRTCHostDebugLogger(enabled);
}

