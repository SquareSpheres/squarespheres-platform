import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { TurnServersResponse, RTCIceServer } from '../types/turnServers'

interface UseTurnServersOptions {
  expiryInSeconds?: number
}

interface UseTurnServersReturn {
  iceServers: RTCIceServer[] | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  expiryInSeconds: number | null
  credentialSource: 'existing' | 'new' | null
  credentialLabel: string | null
}

export function useTurnServers(options: UseTurnServersOptions = {}): UseTurnServersReturn {
  // Build URL with optional expiry parameter
  const buildUrl = useCallback(() => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
    const url = new URL('/api/turn-servers/', baseUrl)
    if (options.expiryInSeconds) {
      url.searchParams.set('expiry', options.expiryInSeconds.toString())
    }
    return url.toString()
  }, [options.expiryInSeconds])

  // Create a fetcher function for SWR
  const fetcher = useCallback(async (): Promise<TurnServersResponse | null> => {
    const url = buildUrl()
    console.log('Fetching TURN servers from:', url)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      
      // Handle quota exceeded error gracefully
      if (response.status === 429 && errorData.fallbackToStun) {
        console.warn('TURN server quota exceeded, falling back to STUN-only configuration')
        // Return null to indicate no TURN servers available, but don't treat as error
        return null
      }
      
      // Handle expired credential error - this should trigger a retry
      if (response.status === 410) {
        console.warn('TURN server credential expired during use, will retry with fresh credentials')
        throw new Error(errorData.error || 'Credential expired, retrying...')
      }
      
      throw new Error(errorData.error || 'Failed to fetch TURN servers')
    }

    return await response.json()
  }, [buildUrl])

  // Use SWR for data fetching with smart caching
  const { data, error, isLoading, mutate } = useSWR(
    'turn-servers', // Global cache key - all instances share the same data
    fetcher,
    {
      // Don't revalidate on window focus since TURN servers don't change frequently
      revalidateOnFocus: false,
      // Don't revalidate on reconnect
      revalidateOnReconnect: false,
      // Dedupe requests for 30 seconds to prevent rapid successive calls
      dedupingInterval: 30000,
      // Dynamic refresh interval based on credential expiry
      refreshInterval: (data) => {
        if (!data?.expiryInSeconds) return 300000 // 5 minutes default
        // Refresh 5 minutes before expiry to ensure fresh credentials
        const refreshBeforeExpiry = 300000 // 5 minutes in ms
        const timeUntilExpiry = (data.expiryInSeconds * 1000) - Date.now()
        return Math.max(timeUntilExpiry - refreshBeforeExpiry, 60000) // At least 1 minute
      },
      // Error retry configuration
      errorRetryCount: 2,
      errorRetryInterval: 5000,
      // Custom fetcher that builds the URL dynamically
      fetcher,
    }
  )

  // Convert data to the expected format
  const iceServers = data?.iceServers ? data.iceServers.map(server => ({
    urls: server.urls,
    username: server.username,
    credential: server.credential,
  })) : null

  return {
    iceServers,
    isLoading,
    error: error?.message ?? null,
    refetch: async () => {
      await mutate()
    },
    expiryInSeconds: data?.expiryInSeconds ?? null,
    credentialSource: data?.credentialSource ?? null,
    credentialLabel: data?.credentialLabel ?? null,
  }
}
