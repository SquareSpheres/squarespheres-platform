'use client'

import { useAuth, useUser, useClerk } from '@clerk/nextjs'
import { LogOut, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

export function AuthHeader() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [showFullId, setShowFullId] = useState(false)

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await signOut()
      localStorage.removeItem('anonMode')
    } catch (error) {
      console.error('Error signing out:', error)
    } finally {
      setIsSigningOut(false)
    }
  }

  if (!isLoaded) {
    return null
  }

  if (!isSignedIn) {
    return null
  }

  const isAnonymous = user?.unsafeMetadata?.isAnonymous === true
  const userId = user?.id || ''
  const lastFourDigits = userId.slice(-4) || '0000'
  const displayName = isAnonymous ? `User ${lastFourDigits}` : user?.username || user?.firstName || `User ${lastFourDigits}`

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
          <div className="w-2 h-2 rounded-full bg-primary"></div>
          <span className="text-sm font-medium text-foreground">
            {displayName}
          </span>
          {isAnonymous && (
            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
              anon
            </span>
          )}
          <button
            onClick={() => setShowFullId(!showFullId)}
            className="p-1 hover:bg-muted/50 rounded transition-colors"
            title={showFullId ? "Hide full ID" : "Show full ID"}
          >
            {showFullId ? (
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        </div>
        {showFullId && (
          <div className="px-3 py-2 bg-muted/20 border border-border/20 rounded-lg mt-1">
            <p className="text-xs text-muted-foreground font-mono break-all">
              {userId}
            </p>
          </div>
        )}
      </div>
      <button
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="p-2 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-50"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
}
