'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { isPublicRouteRegex } from '../config/routes'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const hasRedirected = useRef(false)

  const isPublicRoute = isPublicRouteRegex(pathname)

  useEffect(() => {
    if (!isLoaded) return
    
    if (isPublicRoute || isSignedIn) {
      hasRedirected.current = false
      return
    }
    
    if (!isSignedIn && !isPublicRoute && !hasRedirected.current) {
      hasRedirected.current = true
      router.replace('/sign-up')
    }
  }, [isLoaded, isSignedIn, isPublicRoute, router, pathname])

  if (isPublicRoute) {
    return <>{children}</>
  }

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-muted-foreground mt-2">Loading...</p>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mb-2"></div>
        <p className="text-muted-foreground">Redirecting to sign-up...</p>
      </div>
    )
  }

  return <>{children}</>
}
