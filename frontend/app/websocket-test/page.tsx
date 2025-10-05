'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSignalHost } from '../hooks/useSignalingClient'
import { detectBrowser } from '../utils/browserUtils'

export default function WebSocketTestPage() {
  const [testResults, setTestResults] = useState<string[]>([])
  const [isTesting, setIsTesting] = useState(false)
  const [browserInfo, setBrowserInfo] = useState<any>(null)
  const [connectionStatus, setConnectionStatus] = useState<string>('Not connected')
  const [retryCount, setRetryCount] = useState(0)
  const [lastError, setLastError] = useState<string>('')
  const [isClient, setIsClient] = useState(false)
  const originalConsoleLog = useRef<typeof console.log | undefined>(undefined)
  const originalConsoleError = useRef<typeof console.error | undefined>(undefined)

  const addResult = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setTestResults(prev => [...prev, `[${timestamp}] ${message}`])
  }, [])

  const captureConsoleLogs = useCallback(() => {
    originalConsoleLog.current = console.log
    originalConsoleError.current = console.error
    
    console.log = (...args) => {
      originalConsoleLog.current?.(...args)
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')
      addResult(`LOG: ${message}`)
    }
    
    console.error = (...args) => {
      originalConsoleError.current?.(...args)
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')
      addResult(`ERROR: ${message}`)
      setLastError(message)
    }
  }, [addResult])

  // Initialize signaling client at component level
  const signalHost = useSignalHost({
    onOpen: () => {
      addResult('✅ WebSocket connection successful!')
      setConnectionStatus('Connected')
    },
    onError: (error) => {
      addResult(`❌ WebSocket error: ${error.message}`)
      addResult(`Error code: ${(error as any).code}`)
      addResult(`Error details: ${JSON.stringify((error as any).details, null, 2)}`)
      setConnectionStatus('Error')
      setLastError(error.message)
    },
    onClose: () => {
      addResult('🔌 WebSocket connection closed')
      setConnectionStatus('Disconnected')
    }
  })

  useEffect(() => {
    setIsClient(true)
    const browser = detectBrowser()
    setBrowserInfo(browser)
    addResult(`Browser detected: ${browser.name} ${browser.version}`)
    addResult(`Safari: ${browser.isSafari}, iOS: ${browser.isIOS}`)
    addResult(`User Agent: ${browser.userAgent}`)
    
    // Capture console logs for mobile debugging
    captureConsoleLogs()
    
    return () => {
      restoreConsoleLogs()
    }
  }, [captureConsoleLogs, addResult])

  const restoreConsoleLogs = () => {
    if (originalConsoleLog.current) {
      console.log = originalConsoleLog.current
    }
    if (originalConsoleError.current) {
      console.error = originalConsoleError.current
    }
  }

  const testWebSocketConnection = async () => {
    setIsTesting(true)
    setTestResults([])
    setConnectionStatus('Connecting...')
    setRetryCount(0)
    setLastError('')
    
    try {
      addResult('🚀 Starting WebSocket connection test...')
      addResult('Using default WebSocket URL configuration')
      
      // Test basic connectivity first
      addResult('🔍 Testing basic connectivity...')
      const testUrl = process.env.NEXT_PUBLIC_SIGNAL_SERVER || 'ws://localhost:5052/ws'
      addResult(`Target URL: ${testUrl}`)
      
      // Test if we can reach the server with a simple fetch
      try {
        const httpsUrl = testUrl.replace('wss://', 'https://').replace('ws://', 'http://')
        addResult(`Testing HTTP connectivity to: ${httpsUrl}`)
        const response = await fetch(httpsUrl, { method: 'HEAD', mode: 'no-cors' })
        addResult(`HTTP test completed (no-cors mode)`)
      } catch (fetchError) {
        addResult(`HTTP test failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`)
      }
      
      addResult('📡 Attempting WebSocket connection...')
      setConnectionStatus('Connecting...')
      await signalHost.connect()
      
      addResult('📝 Attempting to register as host...')
      const hostId = await signalHost.registerHost()
      addResult(`✅ Host registered with ID: ${hostId}`)
      setConnectionStatus('Registered as Host')
      
      // Keep connection alive for a bit to test stability
      addResult('⏱️ Keeping connection alive for 5 seconds...')
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      signalHost.disconnect()
      addResult('✅ Test completed successfully - connection closed')
      setConnectionStatus('Test Completed')
      
    } catch (error) {
      addResult(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`)
      if (error instanceof Error && (error as any).code) {
        addResult(`Error code: ${(error as any).code}`)
      }
      setConnectionStatus('Failed')
      setLastError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsTesting(false)
    }
  }

  const clearResults = () => {
    setTestResults([])
    setConnectionStatus('Not connected')
    setLastError('')
    setRetryCount(0)
  }

  const copyResults = async () => {
    const resultsText = testResults.join('\n')
    try {
      await navigator.clipboard.writeText(resultsText)
      addResult('📋 Results copied to clipboard!')
    } catch (err) {
      addResult('❌ Failed to copy results to clipboard')
    }
  }

  const getNetworkInfo = () => {
    if (typeof navigator === 'undefined') return null
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
    if (connection) {
      return {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData
      }
    }
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">WebSocket Connection Test</h1>
        
        {browserInfo && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Browser & Network Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><strong>Browser:</strong> {browserInfo.name} {browserInfo.version}</div>
              <div><strong>Platform:</strong> {browserInfo.isMobile ? 'Mobile' : 'Desktop'}</div>
              <div><strong>Safari:</strong> {browserInfo.isSafari ? 'Yes' : 'No'}</div>
              <div><strong>iOS:</strong> {browserInfo.isIOS ? 'Yes' : 'No'}</div>
              <div className="md:col-span-2"><strong>User Agent:</strong> {browserInfo.userAgent}</div>
            </div>
            
            {getNetworkInfo() && (
              <div className="mt-4 pt-4 border-t">
                <h3 className="font-medium mb-2">Network Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>Connection Type:</strong> {getNetworkInfo()?.effectiveType || 'Unknown'}</div>
                  <div><strong>Downlink:</strong> {getNetworkInfo()?.downlink || 'Unknown'} Mbps</div>
                  <div><strong>RTT:</strong> {getNetworkInfo()?.rtt || 'Unknown'} ms</div>
                  <div><strong>Data Saver:</strong> {getNetworkInfo()?.saveData ? 'Enabled' : 'Disabled'}</div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Connection Test</h2>
          
          {/* WebSocket URL Info */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm">
              <strong>WebSocket URL:</strong> {process.env.NEXT_PUBLIC_SIGNAL_SERVER || 'ws://localhost:5052/ws'}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              Uses environment variable NEXT_PUBLIC_SIGNAL_SERVER or defaults to localhost for development
            </div>
          </div>
          
          {/* Connection Status */}
          <div className="mb-4 p-4 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Connection Status:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                connectionStatus === 'Connected' || connectionStatus === 'Registered as Host' || connectionStatus === 'Test Completed' 
                  ? 'bg-green-100 text-green-800' 
                  : connectionStatus === 'Error' || connectionStatus === 'Failed'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {connectionStatus}
              </span>
            </div>
            {lastError && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                <strong>Last Error:</strong> {lastError}
              </div>
            )}
            {retryCount > 0 && (
              <div className="mt-2 text-sm text-gray-600">
                Retry attempts: {retryCount}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <button
              onClick={testWebSocketConnection}
              disabled={isTesting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTesting ? 'Testing...' : 'Test WebSocket Connection'}
            </button>
            
            <button
              onClick={clearResults}
              className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 ml-4"
            >
              Clear Results
            </button>
            
            {testResults.length > 0 && (
              <button
                onClick={copyResults}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 ml-4"
              >
                Copy Results
              </button>
            )}
          </div>
        </div>

        {testResults.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
              {testResults.map((result, index) => (
                <div key={index} className="mb-1">
                  {result}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-6">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">Safari iOS Troubleshooting</h3>
          <ul className="text-yellow-700 space-y-2">
            <li>• Check Safari Settings → Advanced → Experimental Features and disable &quot;NSURLSession WebSocket&quot;</li>
            <li>• Ensure the server certificate is valid and not self-signed</li>
            <li>• Try refreshing the page or restarting Safari</li>
            <li>• Check if the connection works in other browsers on the same device</li>
            <li>• Try switching between WiFi and cellular data</li>
            <li>• Check if Low Power Mode is enabled (can affect network connections)</li>
          </ul>
          
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
            <h4 className="font-semibold text-red-800 mb-2">Error Code 1006 (Abnormal Closure)</h4>
            <p className="text-red-700 text-sm">
              This error indicates the WebSocket connection was closed without a proper close handshake. 
              Common causes:
            </p>
            <ul className="text-red-700 text-sm mt-2 space-y-1">
              <li>• Server is not responding to WebSocket upgrade requests</li>
              <li>• SSL/TLS certificate issues specific to Safari iOS</li>
              <li>• Server blocking connections from Safari user agent</li>
              <li>• Network firewall or proxy blocking WebSocket connections</li>
              <li>• Server overload or configuration issues</li>
            </ul>
          </div>
        </div>

        {isClient && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-4">
            <h3 className="text-lg font-semibold text-blue-800 mb-2">Diagnostic Information</h3>
            <div className="text-blue-700 text-sm space-y-2">
              <div><strong>WebSocket Support:</strong> {typeof WebSocket !== 'undefined' ? '✅ Supported' : '❌ Not supported'}</div>
              <div><strong>Secure Context:</strong> {window.isSecureContext ? '✅ Yes (HTTPS)' : '❌ No (HTTP)'}</div>
              <div><strong>Online Status:</strong> {navigator.onLine ? '✅ Online' : '❌ Offline'}</div>
              <div><strong>Page Protocol:</strong> {window.location.protocol}</div>
              <div><strong>Page Host:</strong> {window.location.host}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
