'use client'

import { useState, useEffect } from 'react'
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart, 
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts'

interface User {
  id: string
  username: string | null
  firstName: string | null
  lastName: string | null
  emailAddresses: Array<{ emailAddress: string }>
  createdAt: string
  lastSignInAt: string | null
  publicMetadata: Record<string, any>
  unsafeMetadata: Record<string, any>
}

interface UserAnalyticsProps {
  users: User[]
}

interface ChartData {
  date: string
  users: number
  cumulative: number
}

interface ActivityData {
  period: string
  active: number
  inactive: number
}

interface UserTypeData {
  name: string
  value: number
  color: string
}

export function UserAnalytics({ users }: UserAnalyticsProps) {
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [activityData, setActivityData] = useState<ActivityData[]>([])
  const [userTypeData, setUserTypeData] = useState<UserTypeData[]>([])

  useEffect(() => {
    if (users.length === 0) {
      setLoading(false)
      return
    }

    const processUserGrowth = () => {
      const now = new Date()
      const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      
      // Group users by creation date
      const groupedByDate = users.reduce((acc, user) => {
        const createdAt = new Date(user.createdAt)
        if (createdAt < last90Days) return acc
        
        const dateKey = createdAt.toISOString().split('T')[0]
        acc[dateKey] = (acc[dateKey] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      // Create chart data for last 90 days
      const chartData: ChartData[] = []
      let cumulative = 0
      
      for (let i = 89; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const dateKey = date.toISOString().split('T')[0]
        const dayUsers = groupedByDate[dateKey] || 0
        cumulative += dayUsers
        
        chartData.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          users: dayUsers,
          cumulative
        })
      }

      return chartData
    }

    const processActivityData = () => {
      const now = new Date()
      const periods = [
        { name: 'Last 7 days', days: 7 },
        { name: 'Last 30 days', days: 30 },
        { name: 'Last 90 days', days: 90 }
      ]

      return periods.map(period => {
        const cutoffDate = new Date(now.getTime() - period.days * 24 * 60 * 60 * 1000)
        
        const active = users.filter(user => 
          user.lastSignInAt && new Date(user.lastSignInAt) > cutoffDate
        ).length

        return {
          period: period.name,
          active,
          inactive: users.length - active
        }
      })
    }

    const processUserTypeData = () => {
      const anonymous = users.filter(u => u.unsafeMetadata?.isAnonymous).length
      const regular = users.length - anonymous

      return [
        { name: 'Regular Users', value: regular, color: 'var(--chart-1)' },
        { name: 'Anonymous Users', value: anonymous, color: 'var(--chart-3)' }
      ]
    }

    setChartData(processUserGrowth())
    setActivityData(processActivityData())
    setUserTypeData(processUserTypeData())
    setLoading(false)
  }, [users])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2 text-muted-foreground">Loading analytics...</span>
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No user data available for analytics
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <div className="bg-card rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">User Growth (Last 90 Days)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="opacity-30" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--card-foreground)'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="users" 
                  stroke="var(--chart-2)" 
                  strokeWidth={2}
                  dot={{ fill: 'var(--chart-2)', strokeWidth: 2, r: 4 }}
                  name="New Users"
                />
                <Line 
                  type="monotone" 
                  dataKey="cumulative" 
                  stroke="var(--chart-1)" 
                  strokeWidth={2}
                  dot={{ fill: 'var(--chart-1)', strokeWidth: 2, r: 4 }}
                  name="Total Users"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Activity Chart */}
        <div className="bg-card rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">User Activity</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="opacity-30" />
                <XAxis dataKey="period" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--card-foreground)'
                  }}
                />
                <Bar dataKey="active" fill="var(--chart-1)" name="Active Users" />
                <Bar dataKey="inactive" fill="var(--destructive)" name="Inactive Users" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Type Distribution */}
        <div className="bg-card rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">User Type Distribution</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={userTypeData as any}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {userTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--card-foreground)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Signup Trend */}
        <div className="bg-card rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Signups (Last 30 Days)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.slice(-30)}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="opacity-30" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--card-foreground)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="users"
                  stroke="var(--chart-2)"
                  fillOpacity={1}
                  fill="url(#colorUsers)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
