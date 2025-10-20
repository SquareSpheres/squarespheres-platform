'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { isPublicRouteRegex } from '../config/routes'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const hasRedirected = useRef(false)
  const [clerkError, setClerkError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const isPublicRoute = isPublicRouteRegex(pathname)

  // Add timeout to detect stuck Clerk loading state
  useEffect(() => {
    if (!isLoaded) {
      const timeoutId = setTimeout(() => {
        console.warn('Clerk loading timeout - possible stuck state')
        setClerkError(true)
      }, 15000) // 15 second timeout

      return () => clearTimeout(timeoutId)
    } else {
      setClerkError(false)
      setRetryCount(0)
    }
  }, [isLoaded])

  useEffect(() => {
    if (!isLoaded) return
    
    // Clear any stale localStorage flags that might cause confusion
    if (typeof window !== 'undefined') {
      try {
        const anonMode = localStorage.getItem('anonMode')
        if (anonMode && !isSignedIn) {
          // Clear stale anon mode flag if user is not actually signed in
          console.log('Clearing stale anonMode flag')
          localStorage.removeItem('anonMode')
        }
      } catch (error) {
        console.warn('Failed to check/clear localStorage:', error)
      }
    }
    
    if (isPublicRoute || isSignedIn) {
      hasRedirected.current = false
      return
    }
    
    if (!isSignedIn && !isPublicRoute && !hasRedirected.current) {
      hasRedirected.current = true
      router.replace('/sign-up')
    }
  }, [isLoaded, isSignedIn, isPublicRoute, router, pathname])

  const handleRetry = () => {
    setRetryCount(prev => prev + 1)
    setClerkError(false)
    // Force page reload to reset Clerk state
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  if (isPublicRoute) {
    return <>{children}</>
  }

  // Show error state if Clerk is stuck loading
  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-muted-foreground mt-2">Loading...</p>
        {clerkError && (
          <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg max-w-md text-center">
            <p className="text-destructive text-sm mb-3">
              Loading is taking longer than expected. This might be due to service issues.
            </p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
            >
              Retry {retryCount > 0 && `(${retryCount})`}
            </button>
          </div>
        )}
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
