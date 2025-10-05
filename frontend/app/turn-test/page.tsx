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
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            TURN Servers Test Page
          </h1>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8" suppressHydrationWarning>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          TURN Servers Test Page
        </h1>

        {/* Test Controls */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Test Controls
          </h2>
          
          <div className="flex items-center gap-4 mb-4">
            <label htmlFor="expiry" className="text-sm font-medium text-gray-700">
              Custom Expiry (seconds):
            </label>
            <input
              id="expiry"
              type="number"
              min="60"
              max="86400"
              value={customExpiry}
              onChange={(e) => setCustomExpiry(parseInt(e.target.value) || 7200)}
              className="border border-gray-300 rounded-md px-3 py-2 w-32"
              placeholder="7200"
            />
            <span className="text-sm text-gray-500">
              ({formatExpiry(customExpiry)})
            </span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleTestExpiry}
              disabled={isLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Test Custom Expiry
            </button>
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Use Default (2 hours)
            </button>
            <button
              onClick={refetch}
              disabled={isLoading}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Status Display */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Status
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-sm font-medium text-gray-600">Loading State</div>
              <div className={`text-lg font-semibold ${isLoading ? 'text-yellow-600' : 'text-green-600'}`}>
                {isLoading ? 'Loading...' : 'Ready'}
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-sm font-medium text-gray-600">Credential Expiry</div>
              <div className="text-lg font-semibold text-blue-600">
                {formatExpiry(expiryInSeconds)}
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-sm font-medium text-gray-600">Server Count</div>
              <div className="text-lg font-semibold text-purple-600">
                {iceServers ? iceServers.length : '0'}
              </div>
            </div>
          </div>
        </div>

        {/* Credential Information */}
        {iceServers && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Credential Information
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="text-sm font-medium text-gray-600">Credential Source</div>
                <div className={`text-lg font-semibold ${credentialSource === 'existing' ? 'text-green-600' : 'text-blue-600'}`}>
                  {credentialSource === 'existing' ? '🔄 Reused Existing' : '✨ New Credential'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {credentialSource === 'existing' 
                    ? 'Reusing existing non-expired credential to save quota' 
                    : 'Created new credential for this session'
                  }
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="text-sm font-medium text-gray-600">Credential Label</div>
                <div className="text-sm font-semibold text-gray-800 font-mono">
                  {credentialLabel || 'Unknown'}
                </div>
              </div>
            </div>

            {credentialSource === 'existing' && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <div className="text-green-800 font-medium text-sm">💡 Quota Optimization</div>
                <div className="text-green-700 text-xs mt-1">
                  This credential was reused from existing non-expired credentials, helping to preserve your TURN server quota limits.
                </div>
              </div>
            )}

            {credentialSource === 'new' && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="text-blue-800 font-medium text-sm">🆕 Fresh Credential</div>
                <div className="text-blue-700 text-xs mt-1">
                  A new credential was created for this session. This helps ensure maximum security and freshness.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* TURN Servers Display */}
        {iceServers && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              TURN/STUN Servers ({iceServers.length} servers)
            </h2>
            
            <div className="space-y-4">
              {iceServers.map((server, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-md border">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-600">URLs</div>
                      <div className="text-sm text-gray-800 font-mono break-all">
                        {Array.isArray(server.urls) ? server.urls.join(', ') : server.urls}
                      </div>
                    </div>
                    
                    {server.username && (
                      <div>
                        <div className="text-sm font-medium text-gray-600">Username</div>
                        <div className="text-sm text-gray-800 font-mono">
                          {server.username}
                        </div>
                      </div>
                    )}
                    
                    {server.credential && (
                      <div>
                        <div className="text-sm font-medium text-gray-600">Credential</div>
                        <div className="text-sm text-gray-800 font-mono">
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
          <div className="bg-white rounded-lg shadow-md p-6 mt-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Raw Response
            </h2>
            <pre className="bg-gray-100 p-4 rounded-md overflow-auto text-sm">
              {JSON.stringify({ iceServers, expiryInSeconds, credentialSource, credentialLabel }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
