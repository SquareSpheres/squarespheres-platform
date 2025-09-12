import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

interface UserActivity {
  userId: string
  username?: string
  email?: string
  lastSeen: string
  sessionsToday: number
  totalSessions: number
  averageSessionDuration: string
  lastAction: string
  deviceInfo: {
    userAgent: string
    platform: string
  }
  recentActions: Array<{
    action: string
    timestamp: string
    page: string
  }>
}

// Simulated user activity data - in a real app, this would come from a database
const getUserActivityData = (userId: string, userAgent: string): UserActivity => {
  const sessionsToday = Math.floor(Math.random() * 10) + 1
  const totalSessions = Math.floor(Math.random() * 500) + 50
  const avgDurationMinutes = Math.floor(Math.random() * 45) + 5
  
  const actions = [
    'File uploaded',
    'Connection established',
    'Page viewed',
    'Settings updated',
    'File shared',
    'WebRTC connection started',
    'Signaling connected'
  ]
  
  const pages = ['/', '/receive', '/status', '/webrtc-demo', '/signaling-demo']
  
  const recentActions = Array.from({ length: 5 }, (_, i) => ({
    action: actions[Math.floor(Math.random() * actions.length)],
    timestamp: new Date(Date.now() - (i * 1000 * 60 * Math.random() * 30)).toISOString(),
    page: pages[Math.floor(Math.random() * pages.length)]
  }))
  
  const platform = userAgent.includes('Mac') ? 'macOS' : 
                  userAgent.includes('Windows') ? 'Windows' :
                  userAgent.includes('Linux') ? 'Linux' :
                  userAgent.includes('Mobile') ? 'Mobile' : 'Unknown'
  
  return {
    userId,
    lastSeen: new Date().toISOString(),
    sessionsToday,
    totalSessions,
    averageSessionDuration: `${avgDurationMinutes}m`,
    lastAction: recentActions[0].action,
    deviceInfo: {
      userAgent,
      platform
    },
    recentActions: recentActions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userAgent = request.headers.get('user-agent') || 'Unknown'
    const activityData = getUserActivityData(userId, userAgent)
    
    return NextResponse.json(activityData, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })
  } catch (error) {
    console.error('Failed to fetch user activity:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { action, page } = body
    
    if (!action || !page) {
      return NextResponse.json(
        { error: 'Missing required fields: action, page' },
        { status: 400 }
      )
    }
    
    // In a real app, you'd save this to a database
    console.log(`User ${userId} performed action: ${action} on page: ${page}`)
    
    return NextResponse.json({
      success: true,
      message: 'Activity logged successfully',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to log user activity:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
