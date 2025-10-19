'use client'

import { useAuth, useUser, useClerk } from '@clerk/nextjs'
import { LogOut, ChevronDown, ChevronUp, EyeOff, Copy, Check } from 'lucide-react'
import { useState, useEffect } from 'react'

export function AuthHeader() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [showFullId, setShowFullId] = useState(false)
  const [copied, setCopied] = useState(false)

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

  const copyUserId = async () => {
    if (userId) {
      await navigator.clipboard.writeText(userId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col">
        <button
          onClick={() => setShowFullId(!showFullId)}
          className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-colors"
          title={showFullId ? "Hide ID" : "Show ID"}
        >
          {isAnonymous ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-primary"></div>
          )}
          <span className="text-xs text-muted-foreground font-mono">
            {lastFourDigits}
          </span>
          {showFullId ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        {showFullId && (
          <div className="px-2 py-2 bg-muted/30 border border-border/30 rounded-md mt-1 relative">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground font-mono break-all flex-1 mr-2">
                {userId}
              </p>
              <button
                onClick={copyUserId}
                className="flex-shrink-0 p-1 hover:bg-muted/50 rounded transition-colors"
                title={copied ? "Copied!" : "Copy ID"}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
            </div>
            {isAnonymous && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                Temporary session
              </p>
            )}
          </div>
        )}
      </div>
      <button
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors disabled:opacity-50"
        title={isAnonymous ? "End temporary session" : "Sign out"}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
}
