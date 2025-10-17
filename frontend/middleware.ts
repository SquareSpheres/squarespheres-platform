import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Protect admin, api, and trpc routes (except TURN servers which need to be accessible before auth)
const isProtectedRoute = createRouteMatcher([
  '/admin(.*)',
  '/api/user-activity(.*)',
  '/trpc(.*)',
])

// Admin routes that require admin role
const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
  
  // Additional admin role check for admin routes
  if (isAdminRoute(req)) {
    const { userId, sessionClaims } = await auth()
    
    if (!userId) {
      console.log('[AdminMiddleware] Unauthenticated access to admin route, redirecting to sign-up')
      return NextResponse.redirect(new URL('/sign-up/', req.url))
    }
    
    // Check both publicMetadata and custom session claims
    const publicMetadata = sessionClaims?.publicMetadata as any
    const customMetadata = sessionClaims?.metadata as any
    const userRole = publicMetadata?.role || customMetadata?.role
    
    if (userRole !== 'admin') {
      console.log('[AdminMiddleware] Non-admin user attempted admin access, redirecting to home')
      return NextResponse.redirect(new URL('/', req.url))
    }
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API and trpc routes
    '/(api|trpc)(.*)',
  ],
}
