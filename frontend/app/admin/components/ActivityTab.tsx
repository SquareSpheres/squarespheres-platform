'use client'

import React from 'react'
import { useAuth } from '@clerk/nextjs'
import useSWR from 'swr'
import { Activity, Clock, Monitor, TrendingUp, Zap, User } from 'lucide-react'

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

const fetcher = async (url: string, token: string) => {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  return response.json()
}

function ActivitySkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-6 bg-muted rounded mb-4 w-48"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-lg"></div>
        ))}
      </div>
      <div className="h-64 bg-muted rounded-lg"></div>
    </div>
  )
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString()
}

function formatRelativeTime(timestamp: string): string {
  const now = new Date()
  const time = new Date(timestamp)
  const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60))
  
  if (diffInMinutes < 1) return 'Just now'
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
  return `${Math.floor(diffInMinutes / 1440)}d ago`
}

export default function ActivityTab() {
  const { getToken, isSignedIn, isLoaded } = useAuth()
  
  const { data: activity, error, isLoading, mutate } = useSWR<UserActivity>(
    isSignedIn && isLoaded ? '/api/user-activity/' : null,
    async (url: string) => {
      const token = await getToken()
      return fetcher(url, token || '')
    },
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    }
  )
  
  const logActivity = React.useCallback(async (action: string, page: string = '/admin') => {
    if (!isSignedIn) return
    
    try {
      const token = await getToken()
      await fetch('/api/user-activity/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, page })
      })
      mutate()
    } catch (error) {
      console.error('Failed to log activity:', error)
    }
  }, [isSignedIn, getToken, mutate])

  React.useEffect(() => {
    if (isSignedIn && isLoaded) {
      logActivity('Viewed admin activity tab')
    }
  }, [isSignedIn, isLoaded, logActivity])

  if (!isLoaded || !isSignedIn) {
    return <ActivitySkeleton />
  }

  if (isLoading) {
    return <ActivitySkeleton />
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Activity Dashboard</h2>
        </div>
        <div className="bg-card rounded-lg border p-8 text-center">
          <div className="text-red-500 mb-4">
            <Activity className="h-16 w-16 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Error Loading Activity</h3>
          <p className="text-muted-foreground mb-4">{error.message}</p>
          <button 
            onClick={() => mutate()} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!activity) {
    return <ActivitySkeleton />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Activity Dashboard</h2>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            <span className="font-medium">Sessions Today</span>
          </div>
          <div className="text-2xl font-bold">{activity.sessionsToday}</div>
        </div>

        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="h-5 w-5 text-blue-500" />
            <span className="font-medium">Total Sessions</span>
          </div>
          <div className="text-2xl font-bold">{activity.totalSessions}</div>
        </div>

        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="h-5 w-5 text-orange-500" />
            <span className="font-medium">Avg Duration</span>
          </div>
          <div className="text-2xl font-bold">{activity.averageSessionDuration}</div>
        </div>

        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center gap-3 mb-2">
            <Monitor className="h-5 w-5 text-purple-500" />
            <span className="font-medium">Platform</span>
          </div>
          <div className="text-lg font-semibold">{activity.deviceInfo.platform}</div>
        </div>

        <div className="bg-card rounded-lg border p-4 md:col-span-2">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="h-5 w-5 text-red-500" />
            <span className="font-medium">Last Action</span>
          </div>
          <div className="text-lg font-semibold">{activity.lastAction}</div>
          <div className="text-sm text-muted-foreground">
            {formatRelativeTime(activity.lastSeen)}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-xl font-semibold mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {activity.recentActions.map((action, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <div className="font-medium">{action.action}</div>
                <div className="text-sm text-muted-foreground">
                  {action.page} • {formatTimestamp(action.timestamp)}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatRelativeTime(action.timestamp)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          onClick={() => logActivity('Manual refresh triggered from admin')}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Log Test Activity
        </button>
        <button
          onClick={() => mutate()}
          className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors"
        >
          Refresh Data
        </button>
      </div>
    </div>
  )
}
