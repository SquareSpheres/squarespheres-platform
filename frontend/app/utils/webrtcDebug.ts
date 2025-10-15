import { Logger, consoleLogger } from '../types/logger';

export interface WebRTCDebugConfig {
  enabled: boolean;
  logger?: Logger;
  prefix?: string;
}

export class WebRTCDebugLogger {
  private enabled: boolean;
  private logger: Logger;
  private prefix: string;

  constructor(config: WebRTCDebugConfig) {
    this.enabled = config.enabled;
    this.logger = config.logger || consoleLogger;
    this.prefix = config.prefix || '[WebRTC]';
  }

  log(message: string, ...args: any[]): void {
    if (this.enabled) {
      this.logger.log(`${this.prefix} ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.enabled) {
      this.logger.warn(`${this.prefix} ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.enabled) {
      this.logger.error(`${this.prefix} ${message}`, ...args);
    }
  }

  logPeerConnectionCreation(config: {
    iceServers: RTCIceServer[];
    iceCandidatePoolSize: number;
    bundlePolicy: string;
    rtcpMuxPolicy: string;
    iceTransportPolicy: string;
    browser: string;
    isSafari: boolean;
    isChrome: boolean;
  }): void {
    if (!this.enabled) return;

    this.log('Created peer connection with config:', {
      iceServers: config.iceServers,
      iceCandidatePoolSize: config.iceCandidatePoolSize,
      bundlePolicy: config.bundlePolicy,
      rtcpMuxPolicy: config.rtcpMuxPolicy,
      iceTransportPolicy: config.iceTransportPolicy,
      browser: config.browser,
      isSafari: config.isSafari,
      isChrome: config.isChrome,
    });

    const stunServers = config.iceServers?.filter(
      (server) =>
        server.urls &&
        typeof server.urls === 'string' &&
        server.urls.startsWith('stun:')
    ) || [];
    
    const turnServers = config.iceServers?.filter(
      (server) =>
        server.urls &&
        typeof server.urls === 'string' &&
        (server.urls.startsWith('turn:') || server.urls.startsWith('turns:'))
    ) || [];

    this.log(`STUN servers configured: ${stunServers.length} server(s)`);
    
    if (turnServers.length > 0) {
      this.log(`TURN servers configured: ${turnServers.length} server(s)`);
    } else {
      this.log('ℹ️ Using STUN-only configuration - TURN servers can be added for restrictive networks');
    }
  }

  logConnectionStateChange(state: RTCPeerConnectionState): void {
    if (this.enabled) {
      this.log(`Connection state changed to: ${state}`);
    }
  }

  logIceCandidate(candidate: string): void {
    if (this.enabled) {
      this.log(`ICE candidate:`, candidate);
    }
  }

  logIceConnectionState(state: RTCIceConnectionState): void {
    if (this.enabled) {
      this.log(`ICE connection state: ${state}`);
    }
  }

  logDataChannelCreation(label: string, config: RTCDataChannelInit): void {
    if (this.enabled) {
      this.log(`Created data channel: ${label} with config:`, config);
    }
  }

  logDataChannelReceived(readyState: RTCDataChannelState): void {
    if (this.enabled) {
      this.log(`Data channel received: ${readyState}`);
    }
  }

  logDataChannelOpen(binaryType: BinaryType): void {
    if (this.enabled) {
      this.log(`Data channel opened (binaryType: ${binaryType})`);
    }
  }

  logDataChannelMaxMessageSize(maxMessageSize: number): void {
    if (this.enabled) {
      this.log(`Data channel maxMessageSize: ${maxMessageSize} bytes`);
    }
  }

  logDataChannelClosed(): void {
    if (this.enabled) {
      this.log('Data channel closed');
    }
  }

  logIceGatheringState(state: RTCIceGatheringState): void {
    if (this.enabled) {
      this.log(`ICE gathering state: ${state}`);
    }
  }

  logIceCandidateType(candidateType: string, isRelay: boolean, isSrflx: boolean, isPrflx: boolean, isHost: boolean): void {
    if (!this.enabled) return;

    if (isRelay) {
      this.log('✅ TURN relay candidate - works in restrictive networks');
    } else if (isSrflx) {
      this.log('📡 STUN reflexive candidate - direct connection through NAT');
    } else if (isPrflx) {
      this.log('🔍 Peer reflexive candidate - discovered during connectivity checks');
    } else if (isHost) {
      this.log('🏠 Host candidate - local network connection');
    }
  }

  logIceGatheringComplete(): void {
    if (this.enabled) {
      this.log('ICE gathering completed');
    }
  }

  logIceConnectionFailed(): void {
    if (this.enabled) {
      this.warn('ICE connection failed');
    }
  }

  logIceConnectionDisconnected(): void {
    if (this.enabled) {
      this.warn('ICE connection disconnected, waiting for reconnection...');
    }
  }

  logIceConnectionEstablished(): void {
    if (this.enabled) {
      this.log('ICE connection established!');
    }
  }

  logIceRestart(browserName: string, state: string): void {
    if (this.enabled) {
      this.log(`${browserName} ICE ${state === 'failed' ? 'failed' : 'still disconnected'} - attempting ${state === 'failed' ? 'immediate' : ''} restart`);
    }
  }

  logIceRestartSuccess(): void {
    if (this.enabled) {
      this.log('ICE restart initiated successfully');
    }
  }

  logIceRestartFailed(error: any): void {
    if (this.enabled) {
      this.error('ICE restart failed:', error);
    }
  }

  logIceConnectionRecovered(): void {
    if (this.enabled) {
      this.log('ICE connection recovered, no restart needed');
    }
  }

  logConnectionStats(stats: {
    type: string;
    local: string;
    remote: string;
    rtt?: number;
    bytesReceived?: number;
    bytesSent?: number;
  }): void {
    if (this.enabled) {
      this.log('Actual connection method:', stats);
    }
  }

  logConnectionStatsError(error: any): void {
    if (this.enabled) {
      this.warn('Failed to get connection stats:', error);
    }
  }

  logIceConnectionDiagnostics(pc: RTCPeerConnection): void {
    if (!this.enabled) return;

    this.log('ICE Connection Diagnostics:', {
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      connectionState: pc.connectionState,
      signalingState: pc.signalingState,
      hasLocalDescription: !!pc.localDescription,
      hasRemoteDescription: !!pc.remoteDescription,
      localDescriptionType: pc.localDescription?.type,
      remoteDescriptionType: pc.remoteDescription?.type,
    });

    if (pc.localDescription) {
      const sdp = pc.localDescription.sdp;
      const relayCandidates = sdp.match(/candidate:.*typ relay/g) || [];
      const hostCandidates = sdp.match(/candidate:.*typ host/g) || [];
      const srflxCandidates = sdp.match(/candidate:.*typ srflx/g) || [];

      this.log('ICE Candidate Summary:', {
        relay: relayCandidates.length,
        host: hostCandidates.length,
        srflx: srflxCandidates.length,
        total: relayCandidates.length + hostCandidates.length + srflxCandidates.length,
      });

      if (relayCandidates.length === 0) {
        this.log('ℹ️ Connected without TURN relay - using direct/STUN connection (faster)');
      } else {
        this.log(`✅ Using ${relayCandidates.length} TURN relay candidate(s) - works in restrictive networks`);
      }
    }
  }

  logBufferAlreadyDrained(): void {
    if (this.enabled) {
      this.log('Buffer already drained');
    }
  }

  logBufferDrainWaiting(bufferedAmount: number): void {
    if (this.enabled) {
      this.log(`Waiting for buffer to drain (${bufferedAmount} bytes remaining)`);
    }
  }

  logBufferDrainTimeout(timeoutMs: number, bufferedAmount: number): void {
    if (this.enabled) {
      this.warn(`Buffer drain timeout after ${timeoutMs}ms, ${bufferedAmount} bytes still pending`);
    }
  }

  logBufferDrained(): void {
    if (this.enabled) {
      this.log('Buffer fully drained');
    }
  }

  logBufferDrainProgress(bufferedAmount: number): void {
    if (this.enabled) {
      this.log(`Buffer drain progress: ${bufferedAmount} bytes remaining`);
    }
  }

  logConnectionNotReady(connectionState: RTCPeerConnectionState, iceConnectionState: RTCIceConnectionState): void {
    if (this.enabled) {
      this.log('Connection not ready:', connectionState, iceConnectionState);
    }
  }

  logNoTrafficYetWaiting(): void {
    if (this.enabled) {
      this.log('No traffic yet, waiting 200ms...');
    }
  }

  logAfterWait(maxBytes: number, nominated: boolean, selected: boolean): void {
    if (this.enabled) {
      this.log(`After wait: bytes=${maxBytes}, nominated=${nominated}, selected=${selected}`);
    }
  }

  logSelectedPairMethod(maxBytes: number, isNominated: boolean): void {
    if (this.enabled) {
      const method = `bytes (${maxBytes})${isNominated ? ' [nominated]' : ''}`;
      this.log(`Selected pair by: ${method}`);
    }
  }

  logConnectionType(connectionType: string, localType: string, remoteType: string): void {
    if (this.enabled) {
      this.log(`${connectionType}: ${localType} ↔ ${remoteType}`);
    }
  }
}

export function createDebugLogger(enabled: boolean, prefix?: string, logger?: Logger): WebRTCDebugLogger {
  return new WebRTCDebugLogger({ enabled, prefix, logger });
}

export interface IceCandidateStats {
  localCandidates: any[];
  remoteCandidates: any[];
  candidatePairs: any[];
}

/**
 * Gets detailed ICE candidate statistics for debugging
 * This function is useful for troubleshooting connection issues
 */
export async function getIceCandidateStats(pc: RTCPeerConnection): Promise<IceCandidateStats> {
  try {
    const stats = await pc.getStats();
    const localCandidates: any[] = [];
    const remoteCandidates: any[] = [];
    const candidatePairs: any[] = [];

    stats.forEach((stat: any) => {
      if (stat.type === "local-candidate") {
        localCandidates.push(stat);
      } else if (stat.type === "remote-candidate") {
        remoteCandidates.push(stat);
      } else if (stat.type === "candidate-pair") {
        candidatePairs.push(stat);
      }
    });

    return { localCandidates, remoteCandidates, candidatePairs };
  } catch (error) {
    console.error("Failed to get ICE candidate stats:", error);
    return { localCandidates: [], remoteCandidates: [], candidatePairs: [] };
  }
}

