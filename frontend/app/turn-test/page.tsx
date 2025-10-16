'use client'

import { useState, useEffect } from 'react'
import { useTurnServers } from '../hooks/useTurnServers'

export default function TurnTestPage() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])
  const [customExpiry, setCustomExpiry] = useState<number>(7200) // 2 hours default
  const [testExpiry, setTestExpiry] = useState<number | undefined>(undefined)
  
  const { iceServers, isLoading, error, refetch, expiryInSeconds, credentialSource, credentialLabel } = useTurnServers({
    expiryInSeconds: testExpiry
  })

  const handleTestExpiry = () => {
    setTestExpiry(customExpiry)
  }

  const handleReset = () => {
    setTestExpiry(undefined)
  }

  const formatExpiry = (seconds: number | null) => {
    if (!seconds) return 'Unknown'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  // Prevent hydration mismatch by only rendering on client
  if (!isClient) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
          TURN Servers Test
        </h1>
        <div className="card">
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4" suppressHydrationWarning>
      <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
        TURN Servers Test
      </h1>

      {/* Test Controls */}
      <div className="card mb-6">
        <h2 className="text-lg md:text-xl font-semibold text-card-foreground mb-4">
          Test Controls
        </h2>
        
        <div className="space-y-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <label htmlFor="expiry" className="text-sm font-medium text-muted-foreground min-w-0">
              Custom Expiry (seconds):
            </label>
            <div className="flex items-center gap-2">
              <input
                id="expiry"
                type="number"
                min="60"
                max="86400"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(parseInt(e.target.value) || 7200)}
                className="input w-24 sm:w-32"
                placeholder="7200"
              />
              <span className="text-xs sm:text-sm text-muted-foreground">
                ({formatExpiry(customExpiry)})
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={handleTestExpiry}
            disabled={isLoading}
            className="btn btn-primary flex-1 sm:flex-none"
          >
            Test Custom Expiry
          </button>
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="btn btn-secondary flex-1 sm:flex-none"
          >
            Use Default (2 hours)
          </button>
          <button
            onClick={refetch}
            disabled={isLoading}
            className="btn bg-accent text-accent-foreground hover:bg-accent/90 flex-1 sm:flex-none"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Status Display */}
      <div className="card mb-6">
        <h2 className="text-lg md:text-xl font-semibold text-card-foreground mb-4">
          Status
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-muted p-4 rounded-md">
            <div className="text-sm font-medium text-muted-foreground">Loading State</div>
            <div className={`text-lg font-semibold ${isLoading ? 'status-loading' : 'status-success'}`}>
              {isLoading ? 'Loading...' : 'Ready'}
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-md">
            <div className="text-sm font-medium text-muted-foreground">Credential Expiry</div>
            <div className="text-lg font-semibold status-info">
              {formatExpiry(expiryInSeconds)}
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-md sm:col-span-2 lg:col-span-1">
            <div className="text-sm font-medium text-muted-foreground">Server Count</div>
            <div className="text-lg font-semibold status-connected">
              {iceServers ? iceServers.length : '0'}
            </div>
          </div>
        </div>
      </div>

      {/* Credential Information */}
      {iceServers && (
        <div className="card mb-6">
          <h2 className="text-lg md:text-xl font-semibold text-card-foreground mb-4">
            Credential Information
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-muted p-4 rounded-md">
              <div className="text-sm font-medium text-muted-foreground">Credential Source</div>
              <div className={`text-lg font-semibold ${credentialSource === 'existing' ? 'status-success' : 'status-info'}`}>
                {credentialSource === 'existing' ? '🔄 Reused Existing' : '✨ New Credential'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {credentialSource === 'existing' 
                  ? 'Reusing existing non-expired credential to save quota' 
                  : 'Created new credential for this session'
                }
              </div>
            </div>
            
            <div className="bg-muted p-4 rounded-md">
              <div className="text-sm font-medium text-muted-foreground">Credential Label</div>
              <div className="text-sm font-semibold text-card-foreground font-mono break-all">
                {credentialLabel || 'Unknown'}
              </div>
            </div>
          </div>

          {credentialSource === 'existing' && (
            <div className="mt-4 p-3 status-success rounded-md">
              <div className="font-medium text-sm">💡 Quota Optimization</div>
              <div className="text-xs mt-1">
                This credential was reused from existing non-expired credentials, helping to preserve your TURN server quota limits.
              </div>
            </div>
          )}

          {credentialSource === 'new' && (
            <div className="mt-4 p-3 status-info rounded-md">
              <div className="font-medium text-sm">🆕 Fresh Credential</div>
              <div className="text-xs mt-1">
                A new credential was created for this session. This helps ensure maximum security and freshness.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="status-error rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold mb-2">Error</h3>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* TURN Servers Display */}
      {iceServers && (
        <div className="card">
          <h2 className="text-lg md:text-xl font-semibold text-card-foreground mb-4">
            TURN/STUN Servers ({iceServers.length} servers)
          </h2>
          
          <div className="space-y-4">
            {iceServers.map((server, index) => (
              <div key={index} className="bg-muted p-4 rounded-md border border-border">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-1">
                    <div className="text-sm font-medium text-muted-foreground">URLs</div>
                    <div className="text-sm text-card-foreground font-mono break-all mt-1">
                      {Array.isArray(server.urls) ? server.urls.join(', ') : server.urls}
                    </div>
                  </div>
                  
                  {server.username && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Username</div>
                      <div className="text-sm text-card-foreground font-mono break-all mt-1">
                        {server.username}
                      </div>
                    </div>
                  )}
                  
                  {server.credential && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Credential</div>
                      <div className="text-sm text-card-foreground font-mono break-all mt-1">
                        {server.credential}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON Display */}
      {iceServers && (
        <div className="card mt-6">
          <h2 className="text-lg md:text-xl font-semibold text-card-foreground mb-4">
            Raw Response
          </h2>
          <pre className="bg-muted p-4 rounded-md overflow-auto text-sm text-card-foreground font-mono">
            {JSON.stringify({ iceServers, expiryInSeconds, credentialSource, credentialLabel }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}