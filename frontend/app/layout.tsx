import type { Metadata } from 'next'
import { Inter, Poppins } from 'next/font/google'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import './globals.css'
import Link from 'next/link'
import React from 'react'
import StaticBackground from './StaticBackground'
import { Share2 } from 'lucide-react'
import { ThemeProvider } from './Provider'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { ClerkThemeProvider } from "./components/ClerkThemeProvider"
import { AuthHeader } from './components/AuthHeader'
import { AuthGuard } from './components/AuthGuard'
import { HiddenAdminAccess } from './components/HiddenAdminAccess'
import { HeaderNavigation } from './components/HeaderNavigation'
import { ServiceStatusBanner } from './components/ServiceStatusBanner'
import StaticBackground2 from './StaticBackground2'

const inter = Inter({ subsets: ['latin'] })
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-poppins',
})

export const metadata: Metadata = {
  title: 'SquareSpheres Share',
  description: 'Share files securely with WebRTC',
  icons: {
    icon: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${poppins.variable} bg-background text-foreground relative`}>
        <ServiceStatusBanner />
        <ThemeProvider>
          <ClerkThemeProvider>
          <Analytics />
          <SpeedInsights />
          <div className="fixed inset-0 z-0 bg-gradient-to-b from-background via-muted to-background">
            <StaticBackground2 />
          </div>
          <div className="container mx-auto p-4 flex flex-col min-h-screen relative z-10">
            <header className="flex flex-col lg:flex-row justify-between items-center py-4 lg:space-x-4 space-y-4 lg:space-y-0 border-b border-border bg-card/50 backdrop-blur-sm rounded-lg px-4">
                  <h1 className="text-xl lg:text-2xl font-semibold font-poppins">
                    <Link href="/" className="flex items-center gap-3 group">
                      <div className="relative h-8 w-8 cursor-pointer">
                        <HiddenAdminAccess className="absolute inset-0" />
                        <div className="absolute h-6 w-6 top-0 left-0 bg-muted-foreground rounded"></div>
                        <div className="absolute h-6 w-6 bottom-0 right-0 bg-primary rounded-full"></div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>Square</span>
                        <Share2 className="h-6 w-6 text-muted-foreground" />
                        <span>pheres</span>
                      </div>
                    </Link>
                  </h1>
              <div className="flex items-center space-x-2 lg:space-x-4">
                <HeaderNavigation />
                <div className="flex items-center space-x-2">
                  <AuthHeader />
                  <ThemeSwitcher />
                </div>
              </div>
            </header>
            <main className="flex-grow flex items-center justify-center mt-4 md:mt-8">
              <AuthGuard>
                {children}
              </AuthGuard>
            </main>
          </div>
          </ClerkThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  )
} 