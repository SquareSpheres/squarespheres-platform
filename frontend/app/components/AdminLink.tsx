'use client'

import { useAuth, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { Settings } from 'lucide-react'

export function AdminLink() {
  const { user } = useUser()
  const { sessionClaims } = useAuth()
  
  const userRoleFromSession = (sessionClaims as any)?.user_role
  const userRoleFromUser = (user as any)?.user_role
  const userRole = userRoleFromSession || userRoleFromUser
  const isAdmin = userRole === 'admin'
  
  if (!isAdmin) {
    return null
  }
  
  return (
    <Link 
      href="/admin" 
      className="flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" 
      title="Admin Panel"
    >
      <Settings className="h-5 w-5" />
      <span className="hidden lg:inline font-medium text-sm">Admin</span>
    </Link>
  )
}
