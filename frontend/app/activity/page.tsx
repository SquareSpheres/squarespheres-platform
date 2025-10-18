'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, ExternalLink } from 'lucide-react'

export default function ActivityPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin?tab=activity')
  }, [router])

  return (
    <div className="w-full max-w-4xl mx-auto p-6 text-center">
      <div className="bg-card rounded-lg border p-8">
        <Activity className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">Page Moved</h2>
        <p className="text-muted-foreground mb-4">
          The activity dashboard has been moved to the admin panel.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>Redirecting to</span>
          <ExternalLink className="h-4 w-4" />
          <code className="bg-muted px-2 py-1 rounded">/admin</code>
        </div>
      </div>
    </div>
  )
}
