'use client';

import { Logger } from '../types/logger';

export type WebRTCSignalKind = 'webrtc-offer' | 'webrtc-answer' | 'webrtc-ice';

export interface WebRTCOfferPayload {
  kind: 'webrtc-offer';
  sdp: RTCSessionDescriptionInit;
}

export interface WebRTCAnswerPayload {
  kind: 'webrtc-answer';
  sdp: RTCSessionDescriptionInit;
}

export interface WebRTCIcePayload {
  kind: 'webrtc-ice';
  candidate: RTCIceCandidateInit;
}

export type WebRTCSignalPayload = WebRTCOfferPayload | WebRTCAnswerPayload | WebRTCIcePayload;

export interface WebRTCPeerConfig {
  role: 'host' | 'client';
  // For client role: hostId to join; for host: optional pre-registered id
  hostId?: string;
  // STUN/TURN servers
  iceServers?: RTCIceServer[];
  // Timeout configuration
  connectionTimeoutMs?: number; // Default: 30000ms (30 seconds)
  iceGatheringTimeoutMs?: number; // Default: 15000ms (15 seconds)
  // Debug logging
  debug?: boolean; // Default: false
  logger?: Logger; // Optional custom logger
  // Optional callbacks
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit | null, connectionType: string) => void;
  onChannelMessage?: (data: string | ArrayBuffer | Blob) => void;
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onConnectionTimeout?: () => void;
  onConnectionFailed?: (error: Error) => void;
  onDataChannelReady?: (maxMessageSize: number) => void;
}


