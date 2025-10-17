/**
 * Centralized route configuration for the application
 * 
 * This configuration is shared between:
 * - Client-side AuthGuard component
 * - Server-side middleware
 * - Any other route protection logic
 */

// Public routes that don't require authentication
export const PUBLIC_ROUTES = [
  '/sign-in',
  '/sign-up',
  // Add more public routes here as the app grows
  // '/about',
  // '/pricing',
  // '/docs',
] as const

// Helper function to check if a route is public (array-based)
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => {
    // Handle exact matches and sub-routes
    return pathname === route || pathname.startsWith(`${route}/`)
  })
}

// Alternative regex-based approach (more flexible and performant)
export function isPublicRouteRegex(pathname: string): boolean {
  // Matches /sign-in, /sign-up and their sub-routes
  return /^\/(sign-(in|up))(\/.*)?$/.test(pathname)
}

// Export for middleware usage
export const MIDDLEWARE_PUBLIC_ROUTES = PUBLIC_ROUTES
