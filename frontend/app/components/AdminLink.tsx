'use client'

import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { Settings } from 'lucide-react'

export function AdminLink() {
  const { user } = useUser()
  
  // Check if user has admin role (both publicMetadata and custom session claims)
  const publicMetadata = user?.publicMetadata as any
  const customMetadata = (user as any)?.metadata // Custom session claims
  const isAdmin = publicMetadata?.role === 'admin' || customMetadata?.role === 'admin'
  
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
