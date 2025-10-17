'use client'

import { useState, useEffect } from 'react'
import { SignInButton } from '@clerk/nextjs'
import { User, Key } from 'lucide-react'

interface HiddenAdminAccessProps {
  className?: string
  variant?: 'button' | 'link' | 'easter-egg'
}

export function HiddenAdminAccess({ className = '', variant = 'easter-egg' }: HiddenAdminAccessProps) {
  const [showAdminAccess, setShowAdminAccess] = useState(false)

  // Keyboard shortcut for admin access (Ctrl+Shift+A)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'A') {
        event.preventDefault()
        setShowAdminAccess(!showAdminAccess)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showAdminAccess])

  const handleDoubleClick = () => {
    setShowAdminAccess(!showAdminAccess)
  }

  if (variant === 'button') {
    return (
      <div className={className}>
        <button
          onClick={() => setShowAdminAccess(!showAdminAccess)}
          className="text-xs text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
          title="Admin access (Ctrl+Shift+A)"
        >
          <Key className="h-3 w-3" />
        </button>
        
        {showAdminAccess && (
          <div className="absolute top-8 right-0 p-3 bg-card border border-border rounded-lg shadow-lg z-50">
            <p className="text-xs text-muted-foreground mb-2">Admin Access</p>
            <SignInButton>
              <button className="inline-flex items-center gap-2 px-3 py-1 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors">
                <User className="h-3 w-3" />
                Sign In
              </button>
            </SignInButton>
          </div>
        )}
      </div>
    )
  }

  if (variant === 'link') {
    return (
      <div className={className}>
        <SignInButton>
          <button
            className="text-xs text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
            title="Admin access"
          >
            <Key className="h-3 w-3" />
          </button>
        </SignInButton>
      </div>
    )
  }

  // Default: easter-egg variant
  return (
    <div className={className}>
      <div 
        className="cursor-pointer"
        onDoubleClick={handleDoubleClick}
        title="Double-click for admin access"
      >
        {showAdminAccess && (
          <div className="absolute top-0 left-0 right-0 p-2 bg-blue-50 border-b border-blue-200 z-50">
            <div className="flex items-center justify-between">
              <p className="text-blue-800 text-xs font-medium">Admin Access Available</p>
              <SignInButton>
                <button className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">
                  <User className="h-3 w-3" />
                  Sign In
                </button>
              </SignInButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
