'use client'

import { useState, useEffect } from 'react'
import { SignInButton } from '@clerk/nextjs'
import { User, Key, X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface HiddenAdminAccessProps {
  className?: string
  variant?: 'button' | 'link' | 'easter-egg'
}

export function HiddenAdminAccess({ className = '', variant = 'easter-egg' }: HiddenAdminAccessProps) {
  const [showAdminAccess, setShowAdminAccess] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Handle mounting for portal
  useEffect(() => {
    setMounted(true)
  }, [])

  // Keyboard shortcut for admin access (Cmd+Alt+9 on Mac, Ctrl+Alt+9 on Windows/Linux)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Use metaKey (Cmd) on Mac, ctrlKey on Windows/Linux
      const isModifierPressed = event.metaKey || event.ctrlKey
      
      // Check for Digit9 code (more reliable than key value) and altKey (Option on Mac)
      const isDigit9 = event.code === 'Digit9'
      
      if (isModifierPressed && event.altKey && isDigit9) {
        event.preventDefault()
        setShowAdminAccess(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Add escape key handler for modal
  useEffect(() => {
    if (!showAdminAccess) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setShowAdminAccess(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showAdminAccess])

  const handleDoubleClick = () => {
    setShowAdminAccess(!showAdminAccess)
  }

  // Modal component
  const Modal = () => {
    if (!showAdminAccess || !mounted) return null

    const handleBackdropClick = (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Add a small delay to prevent race conditions with auth state
      requestAnimationFrame(() => {
        setShowAdminAccess(false)
      })
    }

    const handleModalClick = (e: React.MouseEvent) => {
      // Prevent event bubbling to backdrop
      e.stopPropagation()
    }

    const modalContent = (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
          onClick={handleBackdropClick}
        />
        {/* Modal */}
        <div 
          className="relative bg-card border border-border rounded-lg shadow-xl p-6 max-w-sm w-full"
          onClick={handleModalClick}
        >
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setShowAdminAccess(false)
            }}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <Key className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Admin Access</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Sign in to access admin features
            </p>
            <div 
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <SignInButton>
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                  <User className="h-4 w-4" />
                  Admin Sign In
                </button>
              </SignInButton>
            </div>
          </div>
        </div>
      </div>
    )

    return createPortal(modalContent, document.body)
  }

  if (variant === 'button') {
    return (
      <>
        <div className={className}>
          <button
            onClick={() => setShowAdminAccess(!showAdminAccess)}
            className="text-xs text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
            title="Admin access (Cmd+Option+9 on Mac, Ctrl+Alt+9 on Windows/Linux)"
          >
            <Key className="h-3 w-3" />
          </button>
        </div>
        <Modal />
      </>
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
    <>
      <div className={className}>
        <div 
          className="cursor-pointer"
          onDoubleClick={handleDoubleClick}
          title="Double-click for admin access"
        >
          {/* The logo/content goes here */}
        </div>
      </div>
      <Modal />
    </>
  )
}
