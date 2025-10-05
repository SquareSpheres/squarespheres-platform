import { RTCIceServer } from '../types/turnServers'

/**
 * @deprecated Use useWebRTCConfig hook instead for dynamic TURN server integration
 * Legacy fallback STUN servers - kept for backward compatibility
 */
export const defaultIceServers: RTCIceServer[] = [
  {
    urls: 'stun:stun.l.google.com:19302'
  },
  {
    urls: 'stun:stun1.l.google.com:19302'
  }
]

/**
 * @deprecated Use useWebRTCConfig hook instead for dynamic TURN server integration
 * Legacy function for creating RTC configuration
 */
export function createRTCConfiguration(customIceServers?: RTCIceServer[]): RTCConfiguration {
  return {
    iceServers: customIceServers || defaultIceServers,
    iceCandidatePoolSize: 10,
  }
}

export function mergeIceServers(stunServers: RTCIceServer[], turnServers: RTCIceServer[]): RTCIceServer[] {
  return [...stunServers, ...turnServers]
}
