'use client';

import { WebRTCPeerConfig } from './webrtcTypes';
import { useWebRTCHostPeer, WebRTCHostPeerApi } from './useWebRTCHostPeer';
import { useWebRTCClientPeer, WebRTCClientPeerApi } from './useWebRTCClientPeer';

export type WebRTCPeerApi = WebRTCHostPeerApi | WebRTCClientPeerApi;

// Type guards to help with type narrowing
export function isHostPeer(peer: WebRTCPeerApi): peer is WebRTCHostPeerApi {
  return peer.role === 'host';
}

export function isClientPeer(peer: WebRTCPeerApi): peer is WebRTCClientPeerApi {
  return peer.role === 'client';
}

export function useWebRTCPeer(config: WebRTCPeerConfig): WebRTCPeerApi {
  const hostPeer = useWebRTCHostPeer(config);
  const clientPeer = useWebRTCClientPeer(config);

  return config.role === 'host' ? hostPeer : clientPeer;
}