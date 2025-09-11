import { NextResponse } from 'next/server'

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
  const signalingUrl = process.env.NEXT_PUBLIC_SIGNAL_SERVER || 'ws://localhost:5052'
  
  try {
    // Convert WebSocket URL to HTTP URL for health endpoint
    const httpUrl = signalingUrl.replace('ws://', 'http://').replace('wss://', 'https://') + '/health'
    
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

export async function GET() {
  const startTime = Date.now()
  
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
    
    const responseTime = Date.now() - startTime
    
    // Set appropriate HTTP status based on health
    const httpStatus = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 200 : 503
    
    return NextResponse.json(healthStatus, { 
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${responseTime}ms`,
      }
    })
  } catch (error) {
    console.error('Health check failed:', error)
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        error: 'Health check failed',
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
      },
      { status: 503 }
    )
  }
}
