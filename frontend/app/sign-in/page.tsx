'use client'

import { useSignIn } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LogIn, ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function SignInPage() {
  const { signIn, isLoaded, setActive } = useSignIn()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identifier, setIdentifier] = useState('')

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded || !identifier.trim()) return
    
    setLoading(true)
    setError(null)

    try {
      const result = await signIn.create({
        identifier: identifier.trim(),
      })

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.push('/')
      } else {
        setError('Sign-in incomplete. Please check your credentials.')
      }
    } catch (err: any) {
      console.error('[SignIn] ❌ Error signing in:', err)
      setError(err.message || 'Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground mt-2">Loading...</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="card p-8 rounded-xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="relative h-16 w-16">
              <div className="absolute h-12 w-12 top-0 left-0 bg-muted-foreground rounded"></div>
              <div className="absolute h-12 w-12 bottom-0 right-0 bg-primary rounded-full"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-card-foreground mb-2">Sign In</h1>
          <p className="text-muted-foreground">
            Welcome back to SquareSpheres
          </p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-card-foreground mb-2">
              Username or Email
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter your username or email"
              className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !identifier.trim()}
            className="w-full px-6 py-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="h-5 w-5" />
                Sign In
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}
        </form>

        <div className="text-center pt-6 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/sign-up" className="text-primary hover:text-primary/80 font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
