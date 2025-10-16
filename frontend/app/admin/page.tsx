/**
 * Hidden Admin Panel - /admin
 * 
 * This page is intentionally not linked in navigation and requires users to manually 
 * navigate to /admin. It provides administrative access to:
 * - User Activity Dashboard
 * - System Health Monitoring
 * 
 * Authentication: Required (Clerk)
 * Authorization: Admin role via publicMetadata (skeleton implementation)
 * Access: Hidden - no public navigation links
 */

'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { UserButton } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import { Activity, BarChart3, Shield, User, Lock, Settings } from 'lucide-react'
import ActivityTab from './components/ActivityTab'
import HealthTab from './components/HealthTab'

interface TabButtonProps {
  isActive: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function TabButton({ isActive, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}


function AdminAccessSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto p-6 text-center">
      <div className="bg-card rounded-lg border p-8">
        <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">Admin Access Required</h2>
        <p className="text-muted-foreground mb-4">
          This area is restricted to administrators only.
        </p>
        <p className="text-sm text-muted-foreground">
          Contact your system administrator if you believe you should have access.
        </p>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto p-6 animate-pulse">
      <div className="h-8 bg-muted rounded mb-6"></div>
      <div className="flex gap-4 mb-6">
        <div className="h-10 w-32 bg-muted rounded"></div>
        <div className="h-10 w-32 bg-muted rounded"></div>
      </div>
      <div className="h-64 bg-muted rounded-lg"></div>
    </div>
  )
}

function checkAdminAccess(user: any): boolean {
  // Clerk admin role verification using publicMetadata
  // To set admin role: user.publicMetadata = { role: 'admin' }
  // This can be done through Clerk Dashboard or API
  
  // Check if user has admin role in publicMetadata
  const userRole = user?.publicMetadata?.role
  const isAdmin = userRole === 'admin'
  
  // For development/testing, you can temporarily allow specific users
  // Example: Allow specific email addresses during development
  const isDevelopmentAdmin = process.env.NODE_ENV === 'development' && 
    user?.emailAddresses?.[0]?.emailAddress === 'admin@example.com'
  
  // Currently allowing all authenticated users for skeleton implementation
  // Change this to: return isAdmin
  console.log('Admin access check:', { userRole, isAdmin, isDevelopmentAdmin })
  
  return true // SKELETON: Change to `isAdmin` when ready to enforce admin-only access
}

function AdminContent() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'activity' | 'health'>('activity')

  // Handle URL parameters for tab selection
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'activity' || tabParam === 'health') {
      setActiveTab(tabParam)
    }
  }, [searchParams])

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Lock className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Admin Panel</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Admin Controls</span>
          </div>
          <UserButton 
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
                userButtonPopoverCard: "border border-border",
                userButtonPopoverActionButton: "text-foreground hover:bg-muted",
              }
            }}
          />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-border pb-4">
        <TabButton
          isActive={activeTab === 'activity'}
          onClick={() => setActiveTab('activity')}
          icon={<BarChart3 className="h-5 w-5" />}
          label="Activity"
        />
        <TabButton
          isActive={activeTab === 'health'}
          onClick={() => setActiveTab('health')}
          icon={<Activity className="h-5 w-5" />}
          label="Health"
        />
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'activity' && <ActivityTab />}
        {activeTab === 'health' && <HealthTab />}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const { isLoaded } = useAuth()
  const { user } = useUser()

  // Show loading while Clerk loads user data
  if (!isLoaded) {
    return <LoadingSkeleton />
  }

  // Future admin access check - skeleton implementation
  if (!checkAdminAccess(user)) {
    return <AdminAccessSkeleton />
  }

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AdminContent />
    </Suspense>
  )
}
