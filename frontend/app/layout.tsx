import type { Metadata } from 'next'
import { Inter, Poppins } from 'next/font/google'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import './globals.css'
import Link from 'next/link'
import React from 'react'
import StaticBackground from './StaticBackground'
import { Share2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'

const inter = Inter({ subsets: ['latin'] })
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-poppins',
})

export const metadata: Metadata = {
  title: 'SquareSpheres Share',
  description: 'Share files securely with WebRTC',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} ${poppins.variable} bg-gray-900 text-white relative`}>
        <Analytics />
        <SpeedInsights />
        <div className="fixed inset-0 z-0 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
          <StaticBackground />
        </div>
        <div className="container mx-auto p-4 flex flex-col min-h-screen relative z-10">
          <header className="flex flex-col md:flex-row justify-between items-center py-4 md:space-x-4 space-y-4 md:space-y-0 border-b border-gray-700 bg-gray-900 bg-opacity-50 backdrop-blur-sm rounded-lg px-4">
            <h1 className="text-xl md:text-2xl font-semibold font-poppins">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="relative h-8 w-8">
                  <div className="absolute h-6 w-6 top-0 left-0 bg-slate-400 rounded-md"></div>
                  <div className="absolute h-6 w-6 bottom-0 right-0 bg-slate-600 rounded-full"></div>
                </div>
                <div className="flex items-center gap-1">
                  <span>Square</span>
                  <Share2 className="h-6 w-6 text-slate-400" />
                  <span>pheres</span>
                </div>
              </Link>
            </h1>
            <nav className="flex items-center space-x-2 md:space-x-4">
              <Link href="/" className="flex items-center gap-2 p-2 rounded-lg text-slate-300 hover:bg-gray-800 hover:text-white transition-colors" title="Send">
                <ArrowUpCircle className="h-6 w-6" />
                <span className="hidden md:inline font-medium text-sm">Send</span>
              </Link>
              <Link href="/receive" className="flex items-center gap-2 p-2 rounded-lg text-slate-300 hover:bg-gray-800 hover:text-white transition-colors" title="Receive">
                <ArrowDownCircle className="h-6 w-6" />
                <span className="hidden md:inline font-medium text-sm">Receive</span>
              </Link>
            </nav>
          </header>
          <main className="flex-grow flex items-center justify-center mt-4 md:mt-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
} 