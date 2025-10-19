import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Protect admin, api, and trpc routes including TURN servers (now require authentication)
const isProtectedRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/user-activity(.*)",
  "/api/turn-servers(.*)",
  "/trpc(.*)",
]);

// Admin routes that require admin role
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

// Build connect-src directives based on environment
const getConnectSrcDirectives = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isVercel = process.env.VERCEL === '1';
  
  const directives = ["wss://*.squarespheres.com"];
  
  // Only add localhost URLs in development
  if (isDevelopment && !isVercel) {
    directives.unshift("ws://localhost:5052", "wss://localhost:5052");
  }
  
  return directives;
};

export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedRoute(req)) {
      await auth.protect();
    }

    // Additional admin role check for admin routes
    if (isAdminRoute(req)) {
      const { userId, sessionClaims } = await auth();

      if (!userId) {
        return NextResponse.redirect(new URL("/sign-up/", req.url));
      }

      // Check role from direct claim only
      const userRole = (sessionClaims as any)?.user_role;

      if (userRole !== "admin") {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
  },
  {
    contentSecurityPolicy: {
      directives: {
        'connect-src': getConnectSrcDirectives()
      }
    },
  }
);

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API and trpc routes
    "/(api|trpc)(.*)",
  ],
};
