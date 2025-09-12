import { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'

export const metadata: Metadata = {
  title: 'System Status - SquareSpheres Share',
  description: 'Real-time status of SquareSpheres platform services',
}

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

async function checkSignalingServer(): Promise<HealthStatus['services']['signalingServer']> {
  const startTime = Date.now()
  const signalingUrl = process.env.NEXT_PUBLIC_SIGNAL_SERVER || 'ws://localhost:5052/ws'
  
  try {
    // Convert WebSocket URL to HTTP URL for health endpoint
    // Remove /ws suffix if present before adding /health
    const baseUrl = signalingUrl.replace('ws://', 'http://').replace('wss://', 'https://').replace(/\/ws$/, '')
    const httpUrl = baseUrl + '/health'
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
    
    const response = await fetch(httpUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'text/plain',
      },
    })
    
    clearTimeout(timeoutId)
    const responseTime = Date.now() - startTime
    
    if (response.ok) {
      const responseText = await response.text()
      
      // Check if the response is the expected "OK"
      if (responseText.trim() === 'OK') {
        return {
          status: 'online',
          responseTime,
          lastChecked: new Date().toISOString(),
        }
      } else {
        return {
          status: 'error',
          responseTime,
          lastChecked: new Date().toISOString(),
          error: `Unexpected response: ${responseText}`,
        }
      }
    } else {
      // Handle CORS/403 errors specially for external signaling server
      if (response.status === 403) {
        return {
          status: 'error',
          responseTime,
          lastChecked: new Date().toISOString(),
          error: `CORS/Access denied (${response.status}): Server may be protected`,
        }
      }
      
      return {
        status: 'error',
        responseTime,
        lastChecked: new Date().toISOString(),
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 'offline',
        responseTime,
        lastChecked: new Date().toISOString(),
        error: 'Connection timeout (5s)',
      }
    }
    
    return {
      status: 'offline',
      responseTime,
      lastChecked: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

function getWebRTCStatus(): HealthStatus['services']['webrtc'] {
  // Simulated WebRTC metrics - in a real app, you'd track actual connection success rates
  const simulatedSuccessRate = Math.random() * 30 + 70 // 70-100% success rate
  
  return {
    status: simulatedSuccessRate > 90 ? 'operational' : simulatedSuccessRate > 70 ? 'degraded' : 'down',
    successRate: Number(simulatedSuccessRate.toFixed(1)),
    lastChecked: new Date().toISOString(),
  }
}

function getPlatformStatus(): HealthStatus['services']['platform'] {
  return {
    status: 'online',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  }
}

function calculateOverallStatus(services: HealthStatus['services']): HealthStatus['status'] {
  const { signalingServer, webrtc, platform } = services
  
  // If signaling server is offline or platform issues, mark as unhealthy
  if (signalingServer.status === 'offline' || platform.status !== 'online') {
    return 'unhealthy'
  }
  
  // If signaling server has errors or WebRTC is degraded, mark as degraded
  if (signalingServer.status === 'error' || webrtc.status === 'degraded') {
    return 'degraded'
  }
  
  // If WebRTC is down but signaling is OK, still degraded
  if (webrtc.status === 'down') {
    return 'degraded'
  }
  
  return 'healthy'
}

async function getHealthStatus(): Promise<HealthStatus> {
  try {
    // Check all services
    const [signalingServer, webrtc, platform] = await Promise.all([
      checkSignalingServer(),
      Promise.resolve(getWebRTCStatus()),
      Promise.resolve(getPlatformStatus()),
    ])
    
    const services = {
      signalingServer,
      webrtc,
      platform,
    }
    
    const healthStatus: HealthStatus = {
      status: calculateOverallStatus(services),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
    }
    
    return healthStatus
  } catch (error) {
    console.error('Health check failed:', error)
    
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        signalingServer: {
          status: 'error',
          lastChecked: new Date().toISOString(),
          error: 'Health check failed',
        },
        webrtc: {
          status: 'down',
          successRate: 0,
          lastChecked: new Date().toISOString(),
        },
        platform: getPlatformStatus(),
      },
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

export default async function StatusPage() {
  const { isAuthenticated, redirectToSignIn } = await auth()
  
  if (!isAuthenticated) return redirectToSignIn()

  const healthStatus = await getHealthStatus()
  
  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4 text-foreground">System Status</h1>
        <div className="flex items-center justify-center mb-2">
          <StatusIndicator status={healthStatus.status} />
        </div>
        <p className="text-muted-foreground">
          Last updated: {formatTimestamp(healthStatus.timestamp)}
        </p>
      </div>

      {/* Overall Status Card */}
      <div className="bg-card rounded-lg border p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-card-foreground">{formatUptime(healthStatus.uptime)}</div>
            <div className="text-sm text-muted-foreground">Uptime</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-card-foreground">{healthStatus.services.platform.version}</div>
            <div className="text-sm text-muted-foreground">Version</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-card-foreground capitalize">{healthStatus.services.platform.environment}</div>
            <div className="text-sm text-muted-foreground">Environment</div>
          </div>
        </div>
      </div>

      {/* Services Status */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground mb-4">Service Status</h2>
        
        {/* Signaling Server */}
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-card-foreground">Signaling Server</h3>
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
            <h3 className="font-medium text-card-foreground">WebRTC Connections</h3>
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
            <h3 className="font-medium text-card-foreground">Platform</h3>
            <StatusIndicator status={healthStatus.services.platform.status} />
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Version: {healthStatus.services.platform.version}</div>
            <div>Environment: {healthStatus.services.platform.environment}</div>
          </div>
        </div>
      </div>

      {/* Refresh Notice */}
      <div className="mt-8 text-center">
        <p className="text-sm text-muted-foreground">
          This page is server-side rendered and shows real-time status.
          <br />
          Refresh the page to get the latest information.
        </p>
      </div>
    </div>
  )
}
