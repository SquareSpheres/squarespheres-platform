import { useMemo } from 'react'
import { useTurnServers } from './useTurnServers'
import { DEFAULT_ICE_SERVERS } from './webrtcUtils'
import { RTCIceServer } from '../types/turnServers'

interface UseWebRTCConfigOptions {
  /**
   * Whether to include TURN servers from the API
   * @default true
   */
  includeTurnServers?: boolean
  /**
   * Custom expiry for TURN server credentials in seconds
   * @default 7200 (2 hours) - longer expiry since we reuse credentials efficiently
   */
  turnExpiryInSeconds?: number
  /**
   * Fallback STUN servers to use if TURN servers fail to load
   * @default DEFAULT_ICE_SERVERS
   */
  fallbackIceServers?: RTCIceServer[]
}

interface UseWebRTCConfigReturn {
  /** Complete ICE servers configuration including TURN servers */
  iceServers: RTCIceServer[]
  /** Whether TURN servers are currently loading */
  isLoadingTurnServers: boolean
  /** Error message if TURN servers failed to load */
  turnServersError: string | null
  /** Whether TURN servers are being used (vs fallback STUN only) */
  usingTurnServers: boolean
  /** Refetch TURN servers */
  refetchTurnServers: () => Promise<void>
  /** TURN server credential expiry in seconds */
  turnExpiryInSeconds: number | null
}

/**
 * Hook that provides WebRTC ICE server configuration with dynamic TURN servers
 * Falls back to STUN-only configuration if TURN servers fail to load
 */
export function useWebRTCConfig(options: UseWebRTCConfigOptions = {}): UseWebRTCConfigReturn {
  const {
    includeTurnServers = true,
    turnExpiryInSeconds: customExpiry,
    fallbackIceServers = DEFAULT_ICE_SERVERS
  } = options

  const {
    iceServers: turnIceServers,
    isLoading: isLoadingTurnServers,
    error: turnServersError,
    refetch: refetchTurnServers,
    expiryInSeconds: turnExpiryInSeconds
  } = useTurnServers({
    expiryInSeconds: customExpiry
  })

  const iceServers = useMemo((): RTCIceServer[] => {
    // If not including TURN servers or they failed to load, use fallback
    if (!includeTurnServers || !turnIceServers) {
      return fallbackIceServers
    }

    // Use TURN servers from API (they already include STUN servers)
    return turnIceServers
  }, [includeTurnServers, turnIceServers, fallbackIceServers])

  const usingTurnServers = includeTurnServers && turnIceServers !== null && turnServersError === null

  return {
    iceServers,
    isLoadingTurnServers,
    turnServersError,
    usingTurnServers,
    refetchTurnServers,
    turnExpiryInSeconds
  }
}
