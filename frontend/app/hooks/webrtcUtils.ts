'use client';

import { WebRTCSignalPayload } from './webrtcTypes';

export interface PeerConnectionConfig {
  iceServers: RTCIceServer[];
  isChrome: boolean;
  debug?: boolean;
}

export interface EventHandlers {
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onDataChannelStateChange?: (state: RTCDataChannelState) => void;
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onChannelMessage?: (data: any) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit | null) => void;
  onIceGatheringStateChange?: (state: RTCIceGatheringState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
}

export interface ConnectionWatchdogConfig {
  connectionTimeoutMs: number;
  iceGatheringTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  onConnectionTimeout?: () => void;
  onConnectionFailed?: (error: Error) => void;
  debug?: boolean;
}

export class ConnectionWatchdog {
  private connectionTimeoutRef: NodeJS.Timeout | null = null;
  private iceGatheringTimeoutRef: NodeJS.Timeout | null = null;
  private retryCount = 0;
  private retryInProgress = false;
  private config: ConnectionWatchdogConfig;

  constructor(config: ConnectionWatchdogConfig) {
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
    return this.retryCount < this.config.maxRetries && !this.retryInProgress;
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
    return this.config.retryDelayMs;
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
    iceCandidatePoolSize: config.isChrome ? 10 : 0,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    ...(config.isChrome && {
      iceTransportPolicy: 'all',
      sdpSemantics: 'unified-plan',
    }),
  };

  const pc = new RTCPeerConnection(pcConfig);
  
  if (config.debug) {
    console.log('[WebRTC Utils] Created peer connection with config:', {
      iceServers: pcConfig.iceServers,
      iceCandidatePoolSize: pcConfig.iceCandidatePoolSize,
      bundlePolicy: pcConfig.bundlePolicy,
      rtcpMuxPolicy: pcConfig.rtcpMuxPolicy,
      isChrome: config.isChrome,
    });
  }

  return pc;
}

export function attachEventHandlers(
  pc: RTCPeerConnection,
  handlers: EventHandlers,
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
    /Chrome/.test(navigator.userAgent) && 
    !/Edge|Edg/.test(navigator.userAgent);
}

export function isLocalhost(): boolean {
  return typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1');
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export interface SignalingHandlers {
  onOffer: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  onAnswer: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  onIceCandidate: (candidate: RTCIceCandidateInit | null) => Promise<void>;
}

export function createSignalingMessageHandler(
  handlers: SignalingHandlers,
  debug = false
) {
  return async (message: { payload: string; clientId?: string }) => {
    const text = message.payload;
    if (!text) return;

    let parsed: WebRTCSignalPayload | undefined;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      if (debug) {
        console.warn('[WebRTC Utils] Failed to parse signaling message:', error);
      }
      return;
    }

    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return;

    try {
      if (parsed.kind === 'webrtc-offer') {
        await handlers.onOffer(parsed.sdp);
      } else if (parsed.kind === 'webrtc-answer') {
        await handlers.onAnswer(parsed.sdp);
      } else if (parsed.kind === 'webrtc-ice') {
        await handlers.onIceCandidate(parsed.candidate);
      }
    } catch (error) {
      if (debug) {
        console.error(`[WebRTC Utils] Error handling ${parsed.kind}:`, error);
      }
    }
  };
}
