'use client'

import React, { useState, useEffect } from 'react'
import { Activity, RefreshCw } from 'lucide-react'

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  services: {
    signalingServer: {
      status: 'online' | 'offline' | 'error'
      responseTime?: number
      lastChecked: string
      error?: string
    }
    webrtc: {
      status: 'operational' | 'degraded' | 'down'
      successRate: number
      lastChecked: string
    }
    platform: {
      status: 'online'
      version: string
      environment: string
    }
  }
}

function StatusIndicator({ status }: { status: 'healthy' | 'degraded' | 'unhealthy' | 'online' | 'offline' | 'error' | 'operational' | 'down' }) {
  const getStatusColor = () => {
    switch (status) {
      case 'healthy':
      case 'online':
      case 'operational':
        return 'bg-green-500'
      case 'degraded':
        return 'bg-yellow-500'
      case 'unhealthy':
      case 'offline':
      case 'error':
      case 'down':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'healthy':
        return 'All Systems Operational'
      case 'degraded':
        return 'Partial Outage'
      case 'unhealthy':
        return 'Major Outage'
      case 'online':
        return 'Online'
      case 'offline':
        return 'Offline'
      case 'error':
        return 'Error'
      case 'operational':
        return 'Operational'
      case 'down':
        return 'Down'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
      <span className="font-medium">{getStatusText()}</span>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else {
    return `${minutes}m`
  }
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString()
}

function HealthSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 bg-muted rounded"></div>
        <div className="h-8 w-48 bg-muted rounded"></div>
      </div>
      <div className="bg-muted rounded-lg h-32"></div>
      <div className="space-y-4">
        <div className="h-6 w-32 bg-muted rounded"></div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-muted rounded-lg h-24"></div>
        ))}
      </div>
    </div>
  )
}

export default function HealthTab() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchHealthStatus = async () => {
    try {
      setError(null)
      
      // Since we can't directly call the server-side functions from the client,
      // we'll need to create an API endpoint for health status
      // For now, we'll simulate the health check with static data
      
      // TODO: Create /api/health endpoint that performs the same checks as status/page.tsx
      
      // Simulated health data for demonstration
      await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate API call
      
      const mockHealthStatus: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(Math.random() * 86400) + 3600, // Random uptime between 1-25 hours
        services: {
          signalingServer: {
            status: 'online',
            responseTime: Math.floor(Math.random() * 200) + 50,
            lastChecked: new Date().toISOString(),
          },
          webrtc: {
            status: 'operational',
            successRate: Math.floor(Math.random() * 20) + 80, // 80-100%
            lastChecked: new Date().toISOString(),
          },
          platform: {
            status: 'online',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
          },
        },
      }
      
      setHealthStatus(mockHealthStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health status')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchHealthStatus()
  }

  useEffect(() => {
    fetchHealthStatus()
  }, [])

  if (isLoading) {
    return <HealthSkeleton />
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">System Health</h2>
        </div>
        <div className="bg-card rounded-lg border p-8 text-center">
          <div className="text-red-500 mb-4">
            <Activity className="h-16 w-16 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Error Loading Health Status</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button 
            onClick={handleRefresh}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!healthStatus) {
    return <HealthSkeleton />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">System Health</h2>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Overall Status */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center mb-2">
          <StatusIndicator status={healthStatus.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Last updated: {formatTimestamp(healthStatus.timestamp)}
        </p>
      </div>

      {/* Overall Status Card */}
      <div className="bg-card rounded-lg border p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{formatUptime(healthStatus.uptime)}</div>
            <div className="text-sm text-muted-foreground">Uptime</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{healthStatus.services.platform.version}</div>
            <div className="text-sm text-muted-foreground">Version</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold capitalize">{healthStatus.services.platform.environment}</div>
            <div className="text-sm text-muted-foreground">Environment</div>
          </div>
        </div>
      </div>

      {/* Services Status */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Service Status</h3>
        
        {/* Signaling Server */}
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">Signaling Server</h4>
            <StatusIndicator status={healthStatus.services.signalingServer.status} />
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            {healthStatus.services.signalingServer.responseTime && (
              <div>Response time: {healthStatus.services.signalingServer.responseTime}ms</div>
            )}
            <div>Last checked: {formatTimestamp(healthStatus.services.signalingServer.lastChecked)}</div>
            {healthStatus.services.signalingServer.error && (
              <div className="text-red-600 dark:text-red-400">Error: {healthStatus.services.signalingServer.error}</div>
            )}
          </div>
        </div>

        {/* WebRTC Service */}
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">WebRTC Connections</h4>
            <StatusIndicator status={healthStatus.services.webrtc.status} />
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Success rate: {healthStatus.services.webrtc.successRate}%</div>
            <div>Last checked: {formatTimestamp(healthStatus.services.webrtc.lastChecked)}</div>
          </div>
          <div className="mt-2">
            <div className="bg-muted rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  healthStatus.services.webrtc.successRate > 90 ? 'bg-green-500' :
                  healthStatus.services.webrtc.successRate > 70 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${healthStatus.services.webrtc.successRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Platform */}
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">Platform</h4>
            <StatusIndicator status={healthStatus.services.platform.status} />
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Version: {healthStatus.services.platform.version}</div>
            <div>Environment: {healthStatus.services.platform.environment}</div>
          </div>
        </div>
      </div>

      {/* Notice */}
      <div className="bg-muted/50 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> This is currently showing simulated health data. 
          The health monitoring will be connected to real backend services in a future implementation.
        </p>
      </div>
    </div>
  )
}
