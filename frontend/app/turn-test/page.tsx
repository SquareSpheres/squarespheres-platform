'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { useTurnServers } from '../hooks/useTurnServers'
import { 
  Server, 
  Clock, 
  RefreshCw, 
  Settings, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Copy,
  Eye,
  EyeOff,
  Zap,
  Shield,
  Globe
} from 'lucide-react'

export default function TurnTestPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const [isClient, setIsClient] = useState(false)
  const [customExpiry, setCustomExpiry] = useState<number>(7200)
  const [testExpiry, setTestExpiry] = useState<number | undefined>(undefined)
  const { iceServers, isLoading, error, refetch, expiryInSeconds, credentialSource, credentialLabel } = useTurnServers({
    expiryInSeconds: testExpiry
  })

  const [showCredentials, setShowCredentials] = useState<boolean[]>([])
  const prevIceServersLength = useRef<number>(0)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (iceServers && iceServers.length !== prevIceServersLength.current) {
      setShowCredentials(new Array(iceServers.length).fill(false))
      prevIceServersLength.current = iceServers.length
    }
  }, [iceServers])

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const toggleCredentialVisibility = (index: number) => {
    const newVisibility = [...showCredentials]
    newVisibility[index] = !newVisibility[index]
    setShowCredentials(newVisibility)
  }

  const getStatusIcon = () => {
    if (error) return <XCircle className="h-5 w-5 text-destructive" />
    if (isLoading) return <RefreshCw className="h-5 w-5 text-yellow-500 animate-spin" />
    return <CheckCircle className="h-5 w-5 text-green-500" />
  }

  const getStatusText = () => {
    if (error) return 'Error'
    if (isLoading) return 'Loading'
    return 'Connected'
  }


  // Authentication loading state
  if (!isLoaded) {
    return (
      <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Server className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              TURN Server Test
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">Loading authentication...</p>
        </div>
        
        <div className="card animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  // Not authenticated - Clerk will handle redirect to sign-in
  if (!isSignedIn) {
    return (
      <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Server className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              TURN Server Test
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">Please sign in to access TURN server testing</p>
        </div>
        
        <div className="card text-center">
          <div className="p-8">
            <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-card-foreground mb-2">Authentication Required</h2>
            <p className="text-muted-foreground">You need to be signed in to access the TURN server testing tools.</p>
          </div>
        </div>
      </div>
    )
  }

  // Client-side hydration loading state
  if (!isClient) {
    return (
      <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Server className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              TURN Server Test
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">Testing WebRTC connectivity and TURN server configuration</p>
        </div>
        
        <div className="card animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-8" suppressHydrationWarning>
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            <Server className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            TURN Server Test
          </h1>
        </div>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-4">
          Test and configure your TURN server settings for optimal WebRTC connectivity
        </p>
        {user && (
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Signed in as <span className="font-medium text-foreground">{user.firstName || user.emailAddresses[0]?.emailAddress}</span></span>
          </div>
        )}
      </div>

      {/* Quick Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            {getStatusIcon()}
            <span className="font-semibold text-card-foreground">Status</span>
          </div>
          <div className={`text-lg font-bold ${error ? 'text-red-600 dark:text-red-400' : isLoading ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
            {getStatusText()}
          </div>
        </div>
        
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-blue-500" />
            <span className="font-semibold text-card-foreground">Expiry</span>
          </div>
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {formatExpiry(expiryInSeconds)}
          </div>
        </div>
        
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Globe className="h-5 w-5 text-green-500" />
            <span className="font-semibold text-card-foreground">Servers</span>
          </div>
          <div className="text-lg font-bold text-green-600 dark:text-green-400">
            {iceServers ? iceServers.length : '0'}
          </div>
        </div>
      </div>

      {/* Test Controls */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-accent/10 rounded-lg">
            <Settings className="h-5 w-5 text-accent" />
          </div>
          <h2 className="text-xl font-semibold text-card-foreground">Test Configuration</h2>
        </div>
        
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <label htmlFor="expiry" className="block text-sm font-medium text-muted-foreground mb-2">
                Credential Expiry Time
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="expiry"
                  type="number"
                  min="60"
                  max="86400"
                  value={customExpiry}
                  onChange={(e) => setCustomExpiry(parseInt(e.target.value) || 7200)}
                  className="input w-32"
                  placeholder="7200"
                />
                <span className="text-sm text-muted-foreground">
                  seconds ({formatExpiry(customExpiry)})
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleTestExpiry}
              disabled={isLoading}
              className="btn btn-primary flex-1 sm:flex-none"
            >
              <Zap className="h-4 w-4 mr-2" />
              Test Custom Expiry
            </button>
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="btn btn-secondary flex-1 sm:flex-none"
            >
              <Clock className="h-4 w-4 mr-2" />
              Use Default (2h)
            </button>
            <button
              onClick={refetch}
              disabled={isLoading}
              className="btn bg-accent text-accent-foreground hover:bg-accent/90 flex-1 sm:flex-none"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="status-error rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="h-6 w-6" />
            <h3 className="text-lg font-semibold">Connection Error</h3>
          </div>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Credential Information */}
      {iceServers && (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Shield className="h-5 w-5 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-card-foreground">Credential Information</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="text-sm font-medium text-muted-foreground mb-2">Credential Source</div>
              <div className={`text-lg font-semibold flex items-center gap-2 ${credentialSource === 'existing' ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                {credentialSource === 'existing' ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Reused Existing
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    New Credential
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {credentialSource === 'existing' 
                  ? 'Reusing existing non-expired credential to save quota' 
                  : 'Created new credential for this session'
                }
              </div>
            </div>
            
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="text-sm font-medium text-muted-foreground mb-2">Credential Label</div>
              <div className="text-sm font-mono text-card-foreground break-all bg-card p-2 rounded border">
                {credentialLabel || 'Unknown'}
              </div>
            </div>
          </div>

          {credentialSource === 'existing' && (
            <div className="mt-6 p-4 status-success rounded-lg">
              <div className="flex items-center gap-2 font-medium text-sm mb-1">
                <Zap className="h-4 w-4" />
                Quota Optimization Active
              </div>
              <div className="text-xs">
                This credential was reused from existing non-expired credentials, helping to preserve your TURN server quota limits.
              </div>
            </div>
          )}

          {credentialSource === 'new' && (
            <div className="mt-6 p-4 status-info rounded-lg">
              <div className="flex items-center gap-2 font-medium text-sm mb-1">
                <Shield className="h-4 w-4" />
                Fresh Credential Generated
              </div>
              <div className="text-xs">
                A new credential was created for this session. This helps ensure maximum security and freshness.
              </div>
            </div>
          )}
        </div>
      )}

      {/* TURN Servers Display */}
      {iceServers && (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Globe className="h-5 w-5 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold text-card-foreground">
              TURN/STUN Servers ({iceServers.length} servers)
            </h2>
          </div>
          
          <div className="space-y-4">
            {iceServers.map((server, index) => (
              <div key={index} className="bg-muted/30 p-6 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Server URLs</span>
                    </div>
                    <div className="space-y-2">
                      {Array.isArray(server.urls) ? server.urls.map((url, urlIndex) => (
                        <div key={urlIndex} className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-card p-2 rounded border flex-1 break-all">
                            {url}
                          </code>
                          <button
                            onClick={() => copyToClipboard(url)}
                            className="p-1 hover:bg-muted rounded transition-colors"
                            title="Copy URL"
                          >
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      )) : (
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-card p-2 rounded border flex-1 break-all">
                            {server.urls}
                          </code>
                          <button
                            onClick={() => copyToClipboard(typeof server.urls === 'string' ? server.urls : server.urls.join(', '))}
                            className="p-1 hover:bg-muted rounded transition-colors"
                            title="Copy URL"
                          >
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {server.username && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Username</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-card p-2 rounded border flex-1 break-all">
                          {server.username}
                        </code>
                        <button
                          onClick={() => copyToClipboard(server.username || '')}
                          className="p-1 hover:bg-muted rounded transition-colors"
                          title="Copy username"
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {server.credential && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Credential</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-card p-2 rounded border flex-1 break-all">
                          {showCredentials[index] ? server.credential : '•'.repeat(server.credential.length)}
                        </code>
                        <div className="flex gap-1">
                          <button
                            onClick={() => toggleCredentialVisibility(index)}
                            className="p-1 hover:bg-muted rounded transition-colors"
                            title={showCredentials[index] ? "Hide credential" : "Show credential"}
                          >
                            {showCredentials[index] ? (
                              <EyeOff className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Eye className="h-3 w-3 text-muted-foreground" />
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(server.credential || '')}
                            className="p-1 hover:bg-muted rounded transition-colors"
                            title="Copy credential"
                          >
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
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
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-muted rounded-lg">
              <Server className="h-4 w-4 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-card-foreground">Raw Response Data</h2>
          </div>
          <div className="relative">
            <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs text-card-foreground font-mono max-h-96">
              {JSON.stringify({ iceServers, expiryInSeconds, credentialSource, credentialLabel }, null, 2)}
            </pre>
            <button
              onClick={() => copyToClipboard(JSON.stringify({ iceServers, expiryInSeconds, credentialSource, credentialLabel }, null, 2))}
              className="absolute top-2 right-2 p-2 bg-card hover:bg-muted rounded transition-colors"
              title="Copy JSON"
            >
              <Copy className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}