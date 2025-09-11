import type { Metadata } from 'next'
import { Inter, Poppins } from 'next/font/google'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import './globals.css'
import Link from 'next/link'
import React from 'react'
import StaticBackground from './StaticBackground'
import { Share2, ArrowUpCircle, ArrowDownCircle, Wifi, Zap, Activity } from 'lucide-react'
import { ThemeProvider } from './Provider'
import { ThemeSwitcher } from './components/ThemeSwitcher'

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
        <ThemeProvider>
          <Analytics />
          <SpeedInsights />
          <div className="fixed inset-0 z-0 bg-gradient-to-b from-background via-muted to-background">
            <StaticBackground />
          </div>
          <div className="container mx-auto p-4 flex flex-col min-h-screen relative z-10">
            <header className="flex flex-col lg:flex-row justify-between items-center py-4 lg:space-x-4 space-y-4 lg:space-y-0 border-b border-border bg-card/50 backdrop-blur-sm rounded-lg px-4">
              <h1 className="text-xl lg:text-2xl font-semibold font-poppins">
                <Link href="/" className="flex items-center gap-3 group">
                  <div className="relative h-8 w-8">
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
                <nav className="flex items-center space-x-1 lg:space-x-2">
                  <Link href="/" className="flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Send">
                    <ArrowUpCircle className="h-5 w-5" />
                    <span className="hidden lg:inline font-medium text-sm">Send</span>
                  </Link>
                  <Link href="/receive" className="flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Receive">
                    <ArrowDownCircle className="h-5 w-5" />
                    <span className="hidden lg:inline font-medium text-sm">Receive</span>
                  </Link>
                  <Link href="/signaling-demo" className="flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Signaling Demo">
                    <Wifi className="h-5 w-5" />
                    <span className="hidden lg:inline font-medium text-sm">Signaling</span>
                  </Link>
                  <Link href="/webrtc-demo" className="flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="WebRTC Demo">
                    <Zap className="h-5 w-5" />
                    <span className="hidden lg:inline font-medium text-sm">WebRTC</span>
                  </Link>
                  <Link href="/status" className="flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="System Status">
                    <Activity className="h-5 w-5" />
                    <span className="hidden lg:inline font-medium text-sm">Status</span>
                  </Link>
                </nav>
                <ThemeSwitcher />
              </div>
            </header>
            <main className="flex-grow flex items-center justify-center mt-4 md:mt-8">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
} 