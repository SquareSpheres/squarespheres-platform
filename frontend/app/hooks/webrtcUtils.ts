'use client';

import { WebRTCSignalPayload } from './webrtcTypes';
import { SignalingMessage } from './useSignalingClient';
import { detectBrowser } from '../utils/browserUtils';

export interface PeerConnectionConfig {
  iceServers: RTCIceServer[];
  browserInfo: ReturnType<typeof detectBrowser>;
  debug?: boolean;
}


export class ConnectionWatchdog {
  private connectionTimeoutRef: NodeJS.Timeout | null = null;
  private iceGatheringTimeoutRef: NodeJS.Timeout | null = null;
  private retryCount = 0;
  private retryInProgress = false;
  private config: WatchdogConfig;

  constructor(config: WatchdogConfig) {
    this.config = config;
  }

  startConnectionTimeout(): void {
    this.clearConnectionTimeout();
    this.connectionTimeoutRef = setTimeout(() => {
      this.log('Connection timeout reached');
      this.config.onConnectionTimeout?.();
    }, this.config.connectionTimeoutMs);
  }

  startIceGatheringTimeout(): void {
    this.clearIceGatheringTimeout();
    this.iceGatheringTimeoutRef = setTimeout(() => {
      this.log('ICE gathering timeout reached');
    }, this.config.iceGatheringTimeoutMs);
  }

  clearTimeouts(): void {
    this.clearConnectionTimeout();
    this.clearIceGatheringTimeout();
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutRef) {
      clearTimeout(this.connectionTimeoutRef);
      this.connectionTimeoutRef = null;
    }
  }

  private clearIceGatheringTimeout(): void {
    if (this.iceGatheringTimeoutRef) {
      clearTimeout(this.iceGatheringTimeoutRef);
      this.iceGatheringTimeoutRef = null;
    }
  }

  canRetry(): boolean {
    const { browserInfo } = this.config;
    // Safari needs more retries, Chrome needs fewer to avoid interference
    const maxRetries = browserInfo.isChrome ? 0 : browserInfo.isSafari ? 3 : 2;
    return this.retryCount < maxRetries && !this.retryInProgress;
  }

  startRetry(): void {
    this.retryCount++;
    this.retryInProgress = true;
  }

  endRetry(): void {
    this.retryInProgress = false;
  }

  resetRetryCount(): void {
    this.retryCount = 0;
    this.retryInProgress = false;
  }

  getRetryDelay(): number {
    const { browserInfo } = this.config;
    // Safari needs longer delays, Chrome needs very long delays
    if (browserInfo.isChrome) return 15000;
    if (browserInfo.isSafari) return 5000; // Safari needs more time but not as much as Chrome
    return 3000; // Default for other browsers
  }

  handleConnectionStateChange(state: RTCPeerConnectionState): void {
    if (state === 'connected' || state === 'failed' || state === 'closed') {
      this.clearTimeouts();
    }

    if (state === 'connected') {
      this.resetRetryCount();
      this.log('Connection established successfully');
    }

    if (state === 'failed') {
      this.log('Connection failed');
      this.config.onConnectionFailed?.(new Error('WebRTC connection failed'));
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[ConnectionWatchdog] ${message}`);
    }
  }
}

export function createPeerConnection(config: PeerConnectionConfig): RTCPeerConnection {
  const { browserInfo } = config;
  
  const pcConfig: RTCConfiguration = {
    iceServers: config.iceServers,
    iceCandidatePoolSize: 0, // Set to 0 for all browsers to prevent overwhelming signaling
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    // Always use 'all' to ensure TURN servers are used when available
    // TODO: When TURN servers are added, this will automatically use them for restrictive networks
    iceTransportPolicy: 'all',
  };

  const pc = new RTCPeerConnection(pcConfig);
  
  if (config.debug) {
    console.log('[WebRTC Utils] Created peer connection with config:', {
      iceServers: pcConfig.iceServers,
      iceCandidatePoolSize: pcConfig.iceCandidatePoolSize,
      bundlePolicy: pcConfig.bundlePolicy,
      rtcpMuxPolicy: pcConfig.rtcpMuxPolicy,
      iceTransportPolicy: pcConfig.iceTransportPolicy,
      browser: browserInfo.name,
      isSafari: browserInfo.isSafari,
      isChrome: browserInfo.isChrome,
    });

    // Log ICE server configuration
    const stunServers = pcConfig.iceServers?.filter(server =>
      server.urls && typeof server.urls === 'string' && server.urls.startsWith('stun:')
    ) || [];
    const turnServers = pcConfig.iceServers?.filter(server =>
      server.urls && typeof server.urls === 'string' && server.urls.startsWith('turn:')
    ) || [];
    
    console.log(`[WebRTC Utils] STUN servers configured: ${stunServers.length} server(s)`);
    if (turnServers.length > 0) {
      console.log(`[WebRTC Utils] TURN servers configured: ${turnServers.length} server(s)`);
    } else {
      console.log('[WebRTC Utils] ℹ️ Using STUN-only configuration - TURN servers can be added for restrictive networks');
    }
  }

  return pc;
}

export interface WebRTCEventHandlers {
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onDataChannelStateChange?: (state: RTCDataChannelState) => void;
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onChannelMessage?: (data: any) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit | null) => void;
  onIceGatheringStateChange?: (state: RTCIceGatheringState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
}

export function attachEventHandlers(
  pc: RTCPeerConnection,
  handlers: WebRTCEventHandlers,
  debug = false
): void {
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (debug) {
      console.log(`[WebRTC] Connection state changed to: ${state}`);
    }
    handlers.onConnectionStateChange?.(state);
  };

  pc.onicecandidate = (evt) => {
    if (debug && evt.candidate) {
      console.log(`[WebRTC] ICE candidate:`, evt.candidate.candidate);
    }
    handlers.onIceCandidate?.(evt.candidate?.toJSON() || null);
  };

  pc.onicegatheringstatechange = () => {
    if (debug) {
      console.log(`[WebRTC] ICE gathering state: ${pc.iceGatheringState}`);
    }
    handlers.onIceGatheringStateChange?.(pc.iceGatheringState);
  };

  pc.oniceconnectionstatechange = () => {
    if (debug) {
      console.log(`[WebRTC] ICE connection state: ${pc.iceConnectionState}`);
    }
    handlers.onIceConnectionStateChange?.(pc.iceConnectionState);
  };

  // Note: Data channel handling is done specifically in each hook
  // to avoid conflicts between host and client implementations
}

export function createDataChannel(
  pc: RTCPeerConnection,
  label: string,
  browserInfo: ReturnType<typeof detectBrowser>,
  debug = false
): RTCDataChannel {
  const dcConfig: RTCDataChannelInit = {
    ordered: true,
    ...(browserInfo.isChrome ? {
      maxPacketLifeTime: 1000,
      protocol: 'sctp',
    } : browserInfo.isSafari ? {
      // Safari-specific configuration - more conservative settings
      maxRetransmits: 5,
      ordered: true,
    } : {
      maxRetransmits: 3,
    }),
  };

  const dc = pc.createDataChannel(label, dcConfig);
  
  if (debug) {
    console.log(`[WebRTC Utils] Created data channel: ${label}`);
  }

  return dc;
}

// Detect the maximum message size for a WebRTC data channel
export function getDataChannelMaxMessageSize(dataChannel: RTCDataChannel): number {
  // Try to get the maxMessageSize property if available
  if ('maxMessageSize' in dataChannel && typeof dataChannel.maxMessageSize === 'number') {
    return dataChannel.maxMessageSize;
  }
  
  // Fallback to conservative estimates based on browser
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  
  if (userAgent.includes('Chrome') || userAgent.includes('Chromium')) {
    return 256 * 1024; // 256KB for Chrome
  } else if (userAgent.includes('Firefox')) {
    return 256 * 1024; // 256KB for Firefox
  } else if (userAgent.includes('Safari')) {
    return 64 * 1024;  // 64KB for Safari (more conservative)
  }
  
  // Conservative fallback for unknown browsers
  return 64 * 1024; // 64KB
}

export function isChrome(): boolean {
  return typeof window !== 'undefined' && 
    typeof navigator !== 'undefined' &&
    /Chrome/.test(navigator.userAgent) && 
    !/Edge|Edg/.test(navigator.userAgent);
}

export function isLocalhost(): boolean {
  return typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1');
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  // Reliable STUN servers for NAT traversal
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.services.mozilla.com:3478' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  
  // TODO: Add TURN servers for production use when needed
  // TURN servers are required for connections in restrictive networks (corporate firewalls, etc.)
  // Consider using commercial TURN services like Twilio, Xirsys, or self-hosted CoTURN
  // Example TURN server configuration:
  // {
  //   urls: 'turn:your-turn-server.com:3478',
  //   username: 'your-username',
  //   credential: 'your-password'
  // }
];

export function createEnhancedIceServers(customServers?: RTCIceServer[]): RTCIceServer[] {
  const baseServers = customServers || DEFAULT_ICE_SERVERS;

  // TODO: Add TURN servers for production use when needed
  // TURN servers are required for connections in restrictive networks (corporate firewalls, etc.)
  // Consider using commercial TURN services like Twilio, Xirsys, or self-hosted CoTURN
  if (!isLocalhost()) {
    // Example: baseServers.push({ urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' });
  }

  return baseServers;
}

// TODO: Add TURN server validation function when TURN servers are needed
// This function would test TURN server connectivity and relay candidate generation
// For now, we're using STUN-only configuration for simplicity

export interface SignalingHandlers {
  onOffer: (sdp: RTCSessionDescriptionInit, message: SignalingMessage) => Promise<void>;
  onAnswer: (sdp: RTCSessionDescriptionInit, message: SignalingMessage) => Promise<void>;
  onIceCandidate: (candidate: RTCIceCandidateInit | null, message: SignalingMessage) => Promise<void>;
}

export interface WebRTCEventHandlerConfig {
  role: 'client' | 'host';
  clientId?: string; // For host role, the client ID this connection is for
  pc: RTCPeerConnection; // Add peer connection reference
  watchdog: ConnectionWatchdog;
  sendSignal: (payload: WebRTCSignalPayload, targetClientId?: string) => Promise<void>;
  onConnectionStateChange?: (state: RTCPeerConnectionState, clientId?: string) => void;
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onChannelMessage?: (data: any) => void;
  browserInfo: ReturnType<typeof detectBrowser>;
  debug?: boolean;
}

export function createWebRTCEventHandlers(config: WebRTCEventHandlerConfig): WebRTCEventHandlers {
  const { role, clientId, pc, watchdog, sendSignal, onConnectionStateChange, onChannelOpen, onChannelClose, onChannelMessage, browserInfo, debug } = config;
  const prefix = role === 'host' ? `[WebRTC Host]${clientId ? ` Client ${clientId}` : ''}` : '[WebRTC Client]';

  return {
    onConnectionStateChange: (state: RTCPeerConnectionState) => {
      watchdog.handleConnectionStateChange(state);
      onConnectionStateChange?.(state, clientId);

      if (state === 'connected') {
        if (debug) console.log(`${prefix} Connection established!`);
      } else if (state === 'failed') {
        if (debug) console.error(`${prefix} Connection failed`);
      }
    },

    onDataChannelStateChange: (state: RTCDataChannelState) => {
      // This will be handled by individual data channel setup
    },

    onChannelOpen,

    onChannelClose,

    onChannelMessage,

    onIceCandidate: (candidate: RTCIceCandidateInit | null) => {
      if (candidate) {
        if (debug) {
          const candidateType = candidate.candidate?.split(' ')[7] || 'unknown';
          const isHost = candidateType === 'host';
          const isSrflx = candidateType === 'srflx';
          const isRelay = candidateType === 'relay';

          let connectionType = '🔗 DIRECT';
          if (isRelay) {
            connectionType = '🔄 RELAY (TURN)';
          } else if (isHost) {
            connectionType = '🏠 HOST (Local)';
          } else if (isSrflx) {
            connectionType = '🌐 SRFLX (STUN)';
          }

          console.log(`${prefix} ICE candidate:`, {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            type: candidateType,
            connectionType
          });

          if (isRelay) {
            console.log(`${prefix} ✅ TURN relay candidate - works in restrictive networks`);
          } else if (isSrflx) {
            console.log(`${prefix} 📡 STUN reflexive candidate - direct connection through NAT`);
          } else if (isHost) {
            console.log(`${prefix} 🏠 Host candidate - local network connection`);
          }
        }
        sendSignal({ kind: 'webrtc-ice', candidate }, clientId);
      } else {
        if (debug) {
          console.log(`${prefix} ICE gathering completed - sending end-of-candidates`);
          console.log(`${prefix} Connection stats:`, {
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState,
            connectionState: pc.connectionState,
            signalingState: pc.signalingState
          });
        }
        sendSignal({ kind: 'webrtc-ice', candidate: null as any }, clientId);
      }
    },

    onIceGatheringStateChange: (state: RTCIceGatheringState) => {
      if (debug) console.log(`${prefix} ICE gathering state: ${state}`);
    },

    onIceConnectionStateChange: (state: RTCIceConnectionState) => {
      if (debug) console.log(`${prefix} ICE connection state: ${state}`);

      if (state === 'failed') {
        if (debug) {
          console.warn(`${prefix} ICE connection failed`);
          logIceConnectionDiagnostics(pc, prefix, debug);
        }
        // For Chrome and Safari, attempt ICE restart on failure
        if ((browserInfo.isChrome || browserInfo.isSafari) && pc.remoteDescription) {
          if (debug) console.log(`${prefix} ${browserInfo.name} ICE failed - attempting immediate restart`);
          try {
            pc.restartIce();
            if (debug) console.log(`${prefix} ICE restart initiated successfully`);
          } catch (error) {
            if (debug) console.error(`${prefix} ICE restart failed:`, error);
          }
        }
      } else if (state === 'disconnected') {
        if (debug) {
          console.warn(`${prefix} ICE connection disconnected, waiting for reconnection...`);
          logIceConnectionDiagnostics(pc, prefix, debug);
        }
        // For Chrome and Safari, attempt ICE restart after a short delay on disconnect
        if ((browserInfo.isChrome || browserInfo.isSafari) && pc.remoteDescription) {
          const delay = browserInfo.isSafari ? 3000 : 2000; // Safari needs a bit more time
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              if (debug) console.log(`${prefix} ${browserInfo.name} ICE still disconnected after ${delay}ms, attempting restart`);
              try {
                pc.restartIce();
                if (debug) console.log(`${prefix} ICE restart initiated successfully`);
              } catch (error) {
                if (debug) console.error(`${prefix} ICE restart failed:`, error);
              }
            } else {
              if (debug) console.log(`${prefix} ICE connection recovered, no restart needed`);
            }
          }, delay);
        }
      } else if (state === 'connected') {
        if (debug) {
          console.log(`${prefix} ICE connection established!`);
          logIceConnectionDiagnostics(pc, prefix, debug);
        }
      }
    },
  };
}

export interface DataChannelConfig {
  onOpen?: (readyState: RTCDataChannelState) => void;
  onClose?: (readyState: RTCDataChannelState) => void;
  onMessage?: (data: any) => void;
  onDataChannelReady?: (maxMessageSize: number) => void;
  debug?: boolean;
  role?: 'client' | 'host';
  clientId?: string; // For host role
}

export function setupDataChannel(dc: RTCDataChannel, config: DataChannelConfig): void {
  const { onOpen, onClose, onMessage, onDataChannelReady, debug, role = 'client', clientId } = config;
  const prefix = role === 'host' ? `[WebRTC Host]${clientId ? ` Client ${clientId}` : ''}` : '[WebRTC Client]';

  // Set binary type to ArrayBuffer for consistent binary data handling
  dc.binaryType = 'arraybuffer';

  dc.onopen = () => {
    if (debug) console.log(`${prefix} Data channel opened (binaryType: ${dc.binaryType})`);
    
    // Detect and report maxMessageSize when channel is ready
    const maxMessageSize = getDataChannelMaxMessageSize(dc);
    if (debug) {
      console.log(`${prefix} Data channel maxMessageSize: ${maxMessageSize} bytes`);
    }
    onDataChannelReady?.(maxMessageSize);
    
    onOpen?.(dc.readyState);
  };

  dc.onclose = () => {
    if (debug) console.log(`${prefix} Data channel closed`);
    onClose?.(dc.readyState);
  };

  dc.onmessage = (e) => {
    onMessage?.(e.data);
  };
}

export class ICECandidateManager {
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private browserInfo: ReturnType<typeof detectBrowser>;
  private debug: boolean;
  private role: 'client' | 'host';
  private prefix: string;

  constructor(browserInfo: ReturnType<typeof detectBrowser>, debug = false, role: 'client' | 'host' = 'client', clientId?: string) {
    this.browserInfo = browserInfo;
    this.debug = debug;
    this.role = role;
    this.prefix = role === 'host' ? `[WebRTC Host]${clientId ? ` Client ${clientId}` : ''}` : '[WebRTC Client]';
  }

  storePendingCandidate(candidate: RTCIceCandidateInit, clientId?: string): void {
    const key = clientId || 'default';
    if (!this.pendingCandidates.has(key)) {
      this.pendingCandidates.set(key, []);
    }
    this.pendingCandidates.get(key)!.push(candidate);
    if (this.debug) console.log(`${this.prefix} Storing ICE candidate as pending for ${key}`);
  }

  async addPendingCandidates(pc: RTCPeerConnection, clientId?: string): Promise<void> {
    const key = clientId || 'default';
    const candidates = this.pendingCandidates.get(key) || [];

    for (const candidate of candidates) {
      try {
        if (this.debug) console.log(`${this.prefix} Adding pending ICE candidate for ${key}:`, candidate.candidate);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        if (this.debug) console.log(`${this.prefix} Successfully added pending ICE candidate`);
      } catch (error) {
        if (this.debug) console.warn(`${this.prefix} Failed to add pending ICE candidate:`, error);
      }
    }

    this.pendingCandidates.delete(key);
  }

  async addCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit | null, clientId?: string): Promise<void> {
    if (!candidate) {
      if (this.debug) console.log(`${this.prefix} Received end-of-candidates${clientId ? ` from ${clientId}` : ''}`);
      return;
    }

    try {
      if (this.debug) console.log(`${this.prefix} Adding ICE candidate${clientId ? ` from ${clientId}` : ''}:`, candidate.candidate);
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      if (pc.remoteDescription === null) {
        this.storePendingCandidate(candidate, clientId);
      } else if (this.browserInfo.isChrome && (error as Error).name === 'OperationError') {
        if (this.debug) console.log(`${this.prefix} Chrome ICE candidate error (likely duplicate), ignoring`);
      } else {
        if (this.debug) console.warn(`${this.prefix} ICE candidate addition failed but remote description is set - this might be normal`);
      }
    }
  }

  clear(clientId?: string): void {
    if (clientId) {
      this.pendingCandidates.delete(clientId);
    } else {
      this.pendingCandidates.clear();
    }
  }
}

export interface WatchdogConfig {
  connectionTimeoutMs: number;
  iceGatheringTimeoutMs: number;
  browserInfo: ReturnType<typeof detectBrowser>;
  onConnectionTimeout?: () => void;
  onConnectionFailed?: (error: Error) => void;
  debug?: boolean;
}

export function createConnectionWatchdog(config: WatchdogConfig): ConnectionWatchdog {
  return new ConnectionWatchdog(config);
}

export function createSignalingMessageHandler(
  handlers: SignalingHandlers,
  debug = false
) {
  return async (message: SignalingMessage) => {
    if (!message.payload) return;

    let parsed: WebRTCSignalPayload | undefined;
    try {
      parsed = JSON.parse(message.payload);
    } catch (error) {
      if (debug) {
        console.warn('[WebRTC Utils] Failed to parse signaling message:', error);
      }
      return;
    }

    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return;

    try {
      if (parsed.kind === 'webrtc-offer') {
        await handlers.onOffer(parsed.sdp, message);
      } else if (parsed.kind === 'webrtc-answer') {
        await handlers.onAnswer(parsed.sdp, message);
      } else if (parsed.kind === 'webrtc-ice') {
        await handlers.onIceCandidate(parsed.candidate, message);
      }
    } catch (error) {
      if (debug) {
        console.error(`[WebRTC Utils] Error handling ${parsed.kind}:`, error);
      }
    }
  };
}

export function logIceConnectionDiagnostics(pc: RTCPeerConnection, prefix: string, debug = false): void {
  if (!debug) return;

  console.log(`${prefix} ICE Connection Diagnostics:`, {
    iceConnectionState: pc.iceConnectionState,
    iceGatheringState: pc.iceGatheringState,
    connectionState: pc.connectionState,
    signalingState: pc.signalingState,
    hasLocalDescription: !!pc.localDescription,
    hasRemoteDescription: !!pc.remoteDescription,
    localDescriptionType: pc.localDescription?.type,
    remoteDescriptionType: pc.remoteDescription?.type,
  });

  // Check ICE candidate types
  if (pc.localDescription) {
    const sdp = pc.localDescription.sdp;
    const relayCandidates = sdp.match(/candidate:.*typ relay/g) || [];
    const hostCandidates = sdp.match(/candidate:.*typ host/g) || [];
    const srflxCandidates = sdp.match(/candidate:.*typ srflx/g) || [];

    console.log(`${prefix} ICE Candidate Summary:`, {
      relay: relayCandidates.length,
      host: hostCandidates.length,
      srflx: srflxCandidates.length,
      total: relayCandidates.length + hostCandidates.length + srflxCandidates.length
    });

    if (relayCandidates.length === 0) {
      console.log(`${prefix} ℹ️ Using STUN-only configuration - TURN servers can be added for restrictive networks`);
    } else {
      console.log(`${prefix} ✅ Found ${relayCandidates.length} TURN relay candidate(s) - works in restrictive networks`);
    }
  }
}
