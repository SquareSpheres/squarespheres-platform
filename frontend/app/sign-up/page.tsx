'use client'

import { useSignUp, useAuth, useUser, SignInButton,SignUp } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { User, ArrowRight, Loader2, EyeOff } from 'lucide-react'
import { getKeyboardShortcutText } from '../utils/browserUtils'
import Link from 'next/link'

export default function SignUpPage() {
  const { signUp, isLoaded, setActive } = useSignUp()
  const { isSignedIn, sessionClaims } = useAuth()
  const { user } = useUser()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showAdminAccess, setShowAdminAccess] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

      useEffect(() => {
        if (isSignedIn && user) {
          const userRoleFromSession = (sessionClaims as any)?.user_role
          const userRoleFromUser = (user as any)?.user_role
          const userRole = userRoleFromSession || userRoleFromUser
          const isAdmin = userRole === 'admin'
          const isAnonymous = user.unsafeMetadata?.isAnonymous === true
      
          if (isAdmin) {
            router.replace('/admin')
          } else if (success || isAnonymous) {
            router.replace('/')
          }
        }
      }, [isSignedIn, user, sessionClaims, success, router])


  const handleAnonymousSignup = async () => {
    if (!isLoaded) return
    setLoading(true)
    setError(null)

        try {
          const username = `anon_${Date.now()}`

          const result = await signUp.create({
            username,
            unsafeMetadata: { isAnonymous: true },
          })

          if (result.createdSessionId) {
            await setActive({ session: result.createdSessionId })
            
            // Store preference for future visits
            localStorage.setItem('anonMode', 'true')
            
            // Set success flag to trigger redirect via useEffect
            setSuccess(true)
          } else {
            // In some cases Clerk might require verification (captcha, etc.)
            setError('Verification required. Please complete the challenge and try again.')
          }
        } catch (err: any) {
          console.error('[SignUpPage] Error creating anonymous user:', err)
      
      // Handle CAPTCHA-related errors more gracefully
      if (err.message?.includes('CAPTCHA') || err.message?.includes('captcha')) {
        setError('Security verification required. Please try again - the system will show a verification challenge if needed.')
      } else {
        setError(err.message || 'Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }


  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground mt-2">Loading Clerk...</p>
      </div>
    )
  }

      // Show loading state if admin is signing in or if user is already signed in
      if (isSignedIn && user) {
        const userRoleFromSession = (sessionClaims as any)?.user_role
        const userRoleFromUser = (user as any)?.user_role
        const userRole = userRoleFromSession || userRoleFromUser
        const isAdmin = userRole === 'admin'
        const isAnonymous = user.unsafeMetadata?.isAnonymous === true
    
    if (isAdmin) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground mt-2">Redirecting to admin panel...</p>
        </div>
      )
    } else if (isAnonymous) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground mt-2">Redirecting to app...</p>
        </div>
      )
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="card p-8 rounded-xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div 
              className="relative h-16 w-16 cursor-pointer"
              onDoubleClick={() => setShowAdminAccess(!showAdminAccess)}
              title="Double-click for admin access"
            >
              <div className="absolute h-12 w-12 top-0 left-0 bg-muted-foreground rounded"></div>
              <div className="absolute h-12 w-12 bottom-0 right-0 bg-primary rounded-full"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-card-foreground mb-2">Welcome to SquareSpheres</h1>
          <p className="text-muted-foreground">
            Share files securely with WebRTC. No account required.
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleAnonymousSignup}
            disabled={loading || success}
            className="w-full px-6 py-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {success ? 'Redirecting to app...' : 'Setting up temporary session...'}
              </>
            ) : (
              <>
                <EyeOff className="h-5 w-5" />
                Continue Anonymously
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              By clicking "Continue Anonymously" or using the Service, you acknowledge that this is a non-commercial, experimental project and agree to the{' '}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>.
            </p>
          </div>

          {/* Admin Access - Hidden by default */}
          {showAdminAccess && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 text-sm font-medium mb-2">Admin Access</p>
              <p className="text-blue-700 text-xs mb-3">
                Use your admin credentials to sign in with full access.
              </p>
              <SignInButton>
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                  <User className="h-4 w-4" />
                  Admin Sign In
                </button>
              </SignInButton>
            </div>
          )}

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          {mounted && !showAdminAccess && (
            <div className="text-center pt-1">
              <p className="text-xs text-muted-foreground/50 opacity-0 hover:opacity-100 transition-opacity duration-300">
                Admin access: {getKeyboardShortcutText()}
              </p>
            </div>
          )}
        </div>
        <div id="clerk-captcha" />
      </div>
    </div>
  )
}