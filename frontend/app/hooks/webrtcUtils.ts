'use client';

import { WebRTCSignalPayload } from './webrtcTypes';
import { SignalingMessage } from './useSignalingClient';

export interface PeerConnectionConfig {
  iceServers: RTCIceServer[];
  isChrome: boolean;
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
    // Reduce Chrome retries to prevent interference with natural connection process
    const maxRetries = this.config.isChrome ? 0 : 2;
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
    // Increase Chrome retry delay to give more time for natural reconnection
    return this.config.isChrome ? 15000 : 3000;
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
  const pcConfig: RTCConfiguration = {
    iceServers: config.iceServers,
    iceCandidatePoolSize: 0, // Set to 0 for all browsers to prevent overwhelming signaling
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    ...(config.isChrome && {
      iceTransportPolicy: 'all',
      // Remove sdpSemantics as it's deprecated and can cause issues
    }),
  };

  const pc = new RTCPeerConnection(pcConfig);
  
  if (config.debug) {
    console.log('[WebRTC Utils] Created peer connection with config:', {
      iceServers: pcConfig.iceServers,
      iceCandidatePoolSize: pcConfig.iceCandidatePoolSize,
      bundlePolicy: pcConfig.bundlePolicy,
      rtcpMuxPolicy: pcConfig.rtcpMuxPolicy,
      iceTransportPolicy: pcConfig.iceTransportPolicy,
      // sdpSemantics: pcConfig.sdpSemantics, // Commented out as it's not in RTCConfiguration type
      isChrome: config.isChrome,
    });

    // Add Chrome-specific debugging
    if (config.isChrome) {
      console.log('[WebRTC Utils] Chrome-specific config applied');
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
  isChrome: boolean,
  debug = false
): RTCDataChannel {
  const dcConfig: RTCDataChannelInit = {
    ordered: true,
    ...(isChrome ? {
      maxPacketLifeTime: 1000,
      protocol: 'sctp',
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
  // Primary STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  // Additional STUN servers for better connectivity
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.services.mozilla.com:3478' },
  // TURN server for same-network issues (free test server)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
];

export function createEnhancedIceServers(customServers?: RTCIceServer[]): RTCIceServer[] {
  const baseServers = customServers || DEFAULT_ICE_SERVERS;

  // Add TURN servers for production if needed
  if (!isLocalhost()) {
    // You can add TURN server URLs here for production
    // Example: baseServers.push({ urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' });
  }

  return baseServers;
}

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
  isChrome: boolean;
  debug?: boolean;
}

export function createWebRTCEventHandlers(config: WebRTCEventHandlerConfig): WebRTCEventHandlers {
  const { role, clientId, pc, watchdog, sendSignal, onConnectionStateChange, onChannelOpen, onChannelClose, onChannelMessage, isChrome, debug } = config;
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
          console.log(`${prefix} ICE candidate:`, {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            type: candidate.candidate?.split(' ')[7] || 'unknown'
          });
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
          console.log(`${prefix} ICE failure stats:`, {
            hasRemoteDescription: !!pc.remoteDescription,
            signalingState: pc.signalingState,
            iceGatheringState: pc.iceGatheringState,
            connectionState: pc.connectionState
          });
        }
        // For Chrome, attempt ICE restart on failure
        if (isChrome && pc.remoteDescription) {
          if (debug) console.log(`${prefix} Chrome ICE failed - attempting immediate restart`);
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
          console.log(`${prefix} Disconnect stats:`, {
            hasRemoteDescription: !!pc.remoteDescription,
            signalingState: pc.signalingState,
            iceGatheringState: pc.iceGatheringState
          });
        }
        // For Chrome, attempt ICE restart after a short delay on disconnect
        if (isChrome && pc.remoteDescription) {
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              if (debug) console.log(`${prefix} Chrome ICE still disconnected after 2s, attempting restart`);
              try {
                pc.restartIce();
                if (debug) console.log(`${prefix} ICE restart initiated successfully`);
              } catch (error) {
                if (debug) console.error(`${prefix} ICE restart failed:`, error);
              }
            } else {
              if (debug) console.log(`${prefix} ICE connection recovered, no restart needed`);
            }
          }, 2000); // Reduced from 3000ms to 2000ms for faster recovery
        }
      } else if (state === 'connected') {
        if (debug) console.log(`${prefix} ICE connection established!`);
      }
    },
  };
}

export interface DataChannelConfig {
  onOpen?: (readyState: RTCDataChannelState) => void;
  onClose?: (readyState: RTCDataChannelState) => void;
  onMessage?: (data: any) => void;
  debug?: boolean;
  role?: 'client' | 'host';
  clientId?: string; // For host role
}

export function setupDataChannel(dc: RTCDataChannel, config: DataChannelConfig): void {
  const { onOpen, onClose, onMessage, debug, role = 'client', clientId } = config;
  const prefix = role === 'host' ? `[WebRTC Host]${clientId ? ` Client ${clientId}` : ''}` : '[WebRTC Client]';

  dc.onopen = () => {
    if (debug) console.log(`${prefix} Data channel opened`);
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
  private isChrome: boolean;
  private debug: boolean;
  private role: 'client' | 'host';
  private prefix: string;

  constructor(isChrome: boolean, debug = false, role: 'client' | 'host' = 'client', clientId?: string) {
    this.isChrome = isChrome;
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
      } else if (this.isChrome && (error as Error).name === 'OperationError') {
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
  isChrome: boolean;
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
