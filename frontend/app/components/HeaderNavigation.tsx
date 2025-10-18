'use client'

import Link from 'next/link'
import { ArrowUpCircle, ArrowDownCircle, TestTube } from 'lucide-react'
import { useAuth } from '@clerk/nextjs'
import { AdminLink } from './AdminLink'

export function HeaderNavigation() {
  const { isSignedIn } = useAuth()

  // Only show navigation items if user is signed in (including anonymous)
  if (!isSignedIn) {
    return null
  }

  return (
    <nav className="flex items-center space-x-1 lg:space-x-2">
      <Link href="/" className="flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Send">
        <ArrowUpCircle className="h-5 w-5" />
        <span className="hidden lg:inline font-medium text-sm">Send</span>
      </Link>
      <Link href="/receive" className="flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Receive">
        <ArrowDownCircle className="h-5 w-5" />
        <span className="hidden lg:inline font-medium text-sm">Receive</span>
      </Link>
      <Link href="/turn-test" className="flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="TURN Servers Test">
        <TestTube className="h-5 w-5" />
        <span className="hidden lg:inline font-medium text-sm">TURN Test</span>
      </Link>
      <AdminLink />
    </nav>
  )
}
