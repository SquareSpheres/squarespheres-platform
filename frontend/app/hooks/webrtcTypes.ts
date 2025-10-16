'use client';

import { Logger } from '../types/logger';

export type WebRTCSignalKind = 'webrtc-offer' | 'webrtc-answer' | 'webrtc-ice' | 'webrtc-rejection';

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

export interface WebRTCRejectionPayload {
  kind: 'webrtc-rejection';
  reason: string;
  connectedClientId?: string;
}

export type WebRTCSignalPayload = WebRTCOfferPayload | WebRTCAnswerPayload | WebRTCIcePayload | WebRTCRejectionPayload;

export interface FileTransferMessagePayload {
  type: number;
  fileName?: string;
  fileSize?: number;
  transferId?: string;
  data?: string;
  percentage?: number;
  error?: string;
}

export type ParsedSignalingMessage = WebRTCSignalPayload | FileTransferMessagePayload;

export interface WebRTCPeerConfig {
  role: 'host' | 'client';
  hostId?: string;
  iceServers?: RTCIceServer[];
  connectionTimeoutMs?: number; // Default: 30000ms (30 seconds)
  iceGatheringTimeoutMs?: number; // Default: 15000ms (15 seconds)
  debug?: boolean; // Default: false
  logger?: Logger; // Optional custom logger
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit | null, connectionType: string) => void;
  onChannelMessage?: (data: string | ArrayBuffer | Blob) => void;
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onConnectionTimeout?: () => void;
  onConnectionFailed?: (error: Error) => void;
  onDataChannelReady?: (maxMessageSize: number) => void;
  onConnectionRejected?: (reason: string, connectedClientId?: string) => void;
  onClientJoined?: (clientId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
}


