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

  // Use centralized route configuration
  const isPublicRoute = isPublicRouteRegex(pathname)

  // Handle authentication redirect with guard to prevent multiple redirects
  useEffect(() => {
    if (!isLoaded) return
    
    console.log('[AuthGuard] Auth state:', { isLoaded, isSignedIn, isPublicRoute, pathname })
    
    if (!isSignedIn && !isPublicRoute && !hasRedirected.current) {
      hasRedirected.current = true
      console.log('[AuthGuard] 🔄 Redirecting to sign-up...')
      router.replace('/sign-up') // use replace to prevent history stack issues
    }
  }, [isLoaded, isSignedIn, isPublicRoute, router, pathname])

  // For public routes, always render children (they handle their own loading states)
  if (isPublicRoute) {
    return <>{children}</>
  }

  // Show loading while checking auth for protected routes
  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-muted-foreground mt-2">Loading...</p>
      </div>
    )
  }

  // Show fallback UI instead of null for unauthenticated users
  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mb-2"></div>
        <p className="text-muted-foreground">Redirecting to sign-up...</p>
      </div>
    )
  }

  // Render children for authenticated users
  return <>{children}</>
}
