'use client'

import { useState, useRef, useEffect } from 'react'
import streamSaver from 'streamsaver'
import { useStreamSaver } from '../hooks/useStreamSaver'

export default function StreamSaverTest() {
  const [log, setLog] = useState<string[]>([])
  const [isDownloading, setIsDownloading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Hook testing
  const { createStream, isInitialized: hookInitialized, isStreamActive, getBytesWritten } = useStreamSaver()
  const [hookProgress, setHookProgress] = useState({ bytes: 0, percentage: 0 })

  const addLog = (message: string) => {
    console.log(message)
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  useEffect(() => {
    // Configure StreamSaver to use our service worker and mitm
    if (typeof window !== 'undefined') {
      streamSaver.mitm = '/mitm.html'
      setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: StreamSaver configured with custom mitm.html`])
    }
  }, [])

  // Test 1: Simple text download
  const testSimpleTextDownload = async () => {
    addLog('Starting simple text download test...')
    setIsDownloading(true)

    try {
      const fileStream = streamSaver.createWriteStream('test-simple.txt', {
        size: 26
      })
      
      const writer = fileStream.getWriter()
      const encoder = new TextEncoder()
      
      // Add small delay for Firefox compatibility
      await new Promise(resolve => setTimeout(resolve, 100))
      
      await writer.write(encoder.encode('Hello StreamSaver World!'))
      await writer.close()
      
      addLog('✅ Simple text download initiated successfully')
    } catch (error) {
      addLog(`❌ Simple text download failed: ${error}`)
    } finally {
      setIsDownloading(false)
    }
  }

  // Test 2: Large file simulation (chunked download)
  const testLargeFileDownload = () => {
    addLog('Starting large file download test...')
    setIsDownloading(true)

    try {
      const fileName = 'test-large.txt'
      const chunkSize = 1024 * 1024 // 1MB chunks
      const totalChunks = 5
      const totalSize = chunkSize * totalChunks

      const fileStream = streamSaver.createWriteStream(fileName, {
        size: totalSize
      })

      const writer = fileStream.getWriter()
      const encoder = new TextEncoder()

      let currentChunk = 0

      const writeChunk = async () => {
        if (currentChunk >= totalChunks) {
          await writer.close()
          addLog('✅ Large file download completed successfully')
          setIsDownloading(false)
          return
        }

        const chunkData = `Chunk ${currentChunk + 1}/${totalChunks}\n`.repeat(chunkSize / 50)
        await writer.write(encoder.encode(chunkData.substring(0, chunkSize)))
        
        currentChunk++
        addLog(`📦 Written chunk ${currentChunk}/${totalChunks}`)
        
        // Simulate async processing
        setTimeout(writeChunk, 100)
      }

      writeChunk()
    } catch (error) {
      addLog(`❌ Large file download failed: ${error}`)
      setIsDownloading(false)
    }
  }

  // Test 3: JSON data download
  const testJSONDownload = () => {
    addLog('Starting JSON download test...')
    setIsDownloading(true)

    try {
      const testData = {
        timestamp: new Date().toISOString(),
        platform: 'squarespheres-platform',
        tests: ['simple', 'large', 'json', 'binary'],
        metadata: {
          version: '1.0.0',
          streamsaver: '2.0.6'
        },
        largeArray: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          value: Math.random()
        }))
      }

      const jsonString = JSON.stringify(testData, null, 2)
      const jsonBlob = new TextEncoder().encode(jsonString)

      const fileStream = streamSaver.createWriteStream('test-data.json', {
        size: jsonBlob.byteLength
      })

      const writer = fileStream.getWriter()
      writer.write(jsonBlob)
      writer.close()

      addLog('✅ JSON download initiated successfully')
    } catch (error) {
      addLog(`❌ JSON download failed: ${error}`)
    } finally {
      setIsDownloading(false)
    }
  }

  // Test 4: Binary data download
  const testBinaryDownload = () => {
    addLog('Starting binary download test...')
    setIsDownloading(true)

    try {
      const size = 1024 * 100 // 100KB
      const binaryData = new Uint8Array(size)
      
      // Fill with pattern data
      for (let i = 0; i < size; i++) {
        binaryData[i] = i % 256
      }

      const fileStream = streamSaver.createWriteStream('test-binary.bin', {
        size: size
      })

      const writer = fileStream.getWriter()
      writer.write(binaryData)
      writer.close()

      addLog('✅ Binary download initiated successfully')
    } catch (error) {
      addLog(`❌ Binary download failed: ${error}`)
    } finally {
      setIsDownloading(false)
    }
  }

  // Test 5: File upload and re-download
  const testFileReDownload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      addLog('❌ Please select a file first')
      return
    }

    addLog(`Starting file re-download test for: ${file.name}`)
    setIsDownloading(true)

    try {
      const fileStream = streamSaver.createWriteStream(`redownload-${file.name}`, {
        size: file.size
      })

      const reader = file.stream().getReader()
      const writer = fileStream.getWriter()

      let totalBytesRead = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        await writer.write(value)
        totalBytesRead += value.byteLength
        addLog(`📦 Re-downloaded ${totalBytesRead} / ${file.size} bytes`)
      }

      await writer.close()
      addLog('✅ File re-download completed successfully')
    } catch (error) {
      addLog(`❌ File re-download failed: ${error}`)
    } finally {
      setIsDownloading(false)
    }
  }

  // Test 6: Stream with custom headers
  const testCustomHeaders = () => {
    addLog('Starting custom headers test...')
    setIsDownloading(true)

    try {
      // StreamSaver doesn't support headers in the options - they need to be handled via the service worker
      const fileStream = streamSaver.createWriteStream('test-headers.txt', {
        size: 50
      })

      const writer = fileStream.getWriter()
      const encoder = new TextEncoder()
      
      writer.write(encoder.encode('This file tests StreamSaver functionality!'))
      writer.close()

      addLog('✅ Custom filename download initiated successfully')
    } catch (error) {
      addLog(`❌ Custom filename download failed: ${error}`)
    } finally {
      setIsDownloading(false)
    }
  }

  // Hook-based tests
  const testHookSimpleText = async () => {
    addLog('🪝 Testing useStreamSaver hook - Simple text...')
    setIsDownloading(true)
    setHookProgress({ bytes: 0, percentage: 0 })

    try {
      const writer = await createStream('hook-test-simple.txt')
      
      const text = 'This file was created using the useStreamSaver hook!'
      const encoder = new TextEncoder()
      const data = encoder.encode(text)
      
      await writer.write(data)
      await writer.close()
      
      setHookProgress({ bytes: data.length, percentage: 100 })
      addLog('✅ Hook simple text test completed')
    } catch (error) {
      addLog(`❌ Hook simple text test failed: ${error}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const testHookChunkedData = async () => {
    addLog('🪝 Testing useStreamSaver hook - Chunked data with delays...')
    setIsDownloading(true)
    setHookProgress({ bytes: 0, percentage: 0 })

    try {
      const totalChunks = 10
      const chunkSize = 1024 * 50 // 50KB chunks
      const totalSize = totalChunks * chunkSize
      
      const writer = await createStream('hook-test-chunked.txt', totalSize)
      
      for (let i = 0; i < totalChunks; i++) {
        // Create fake data
        const chunkData = `Chunk ${i + 1}/${totalChunks} - `.repeat(Math.floor(chunkSize / 25))
        const paddedData = chunkData.substring(0, chunkSize)
        const chunk = new TextEncoder().encode(paddedData)
        
        await writer.write(chunk)
        
        const currentBytes = getBytesWritten()
        const percentage = (currentBytes / totalSize) * 100
        setHookProgress({ bytes: currentBytes, percentage })
        
        addLog(`📦 Hook wrote chunk ${i + 1}/${totalChunks} (${currentBytes.toLocaleString()} bytes)`)
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 150))
      }
      
      await writer.close()
      addLog('✅ Hook chunked data test completed')
    } catch (error) {
      addLog(`❌ Hook chunked data test failed: ${error}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const testHookFakeImageData = async () => {
    addLog('🪝 Testing useStreamSaver hook - Fake image data...')
    setIsDownloading(true)
    setHookProgress({ bytes: 0, percentage: 0 })

    try {
      const imageSize = 1024 * 1024 * 2 // 2MB fake image
      const writer = await createStream('hook-fake-image.bin', imageSize)
      
      const chunkSize = 8192 // 8KB chunks
      const totalChunks = Math.ceil(imageSize / chunkSize)
      
      for (let i = 0; i < totalChunks; i++) {
        const currentChunkSize = Math.min(chunkSize, imageSize - (i * chunkSize))
        
        // Generate fake binary data (simulating image bytes)
        const chunk = new Uint8Array(currentChunkSize)
        for (let j = 0; j < currentChunkSize; j++) {
          chunk[j] = Math.floor(Math.random() * 256)
        }
        
        await writer.write(chunk)
        
        const currentBytes = getBytesWritten()
        const percentage = (currentBytes / imageSize) * 100
        setHookProgress({ bytes: currentBytes, percentage })
        
        if (i % 50 === 0) { // Log every 50 chunks
          addLog(`📸 Hook processing image data: ${percentage.toFixed(1)}%`)
        }
        
        // Simulate processing delay
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }
      
      await writer.close()
      addLog('✅ Hook fake image data test completed')
    } catch (error) {
      addLog(`❌ Hook fake image data test failed: ${error}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const testHookSlowStream = async () => {
    addLog('🪝 Testing useStreamSaver hook - Slow streaming simulation...')
    setIsDownloading(true)
    setHookProgress({ bytes: 0, percentage: 0 })

    try {
      const writer = await createStream('hook-slow-stream.csv')
      
      // Simulate streaming CSV data slowly
      const headers = 'ID,Name,Email,Department,Salary\n'
      await writer.write(new TextEncoder().encode(headers))
      
      for (let i = 1; i <= 1000; i++) {
        const row = `${i},User${i},user${i}@company.com,Dept${i % 10},${50000 + (i * 100)}\n`
        await writer.write(new TextEncoder().encode(row))
        
        const currentBytes = getBytesWritten()
        setHookProgress({ bytes: currentBytes, percentage: (i / 1000) * 100 })
        
        if (i % 100 === 0) {
          addLog(`📊 Hook generated ${i}/1000 CSV records`)
          // Simulate slow network
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
      
      await writer.close()
      addLog('✅ Hook slow stream test completed')
    } catch (error) {
      addLog(`❌ Hook slow stream test failed: ${error}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const clearLog = () => {
    setLog([])
  }

  const checkStreamSaverSupport = async () => {
    addLog('Checking StreamSaver support...')
    
    if (typeof window === 'undefined') {
      addLog('❌ Running server-side, window not available')
      return
    }

    addLog(`✅ StreamSaver version: ${streamSaver.version || 'unknown'}`)
    addLog(`✅ ReadableStream supported: ${!!window.ReadableStream}`)
    addLog(`✅ WritableStream supported: ${!!window.WritableStream}`)
    addLog(`✅ Service Worker supported: ${!!navigator.serviceWorker}`)
    addLog(`✅ MessageChannel supported: ${!!window.MessageChannel}`)
    
    if (streamSaver.mitm) {
      addLog(`✅ MITM URL configured: ${streamSaver.mitm}`)
    } else {
      addLog('ℹ️ Using default MITM configuration')
    }

    // Check service worker status
    if (navigator.serviceWorker) {
      try {
        const registration = await navigator.serviceWorker.getRegistration('/')
        if (registration) {
          addLog(`✅ SW Registration found: ${registration.scope}`)
          addLog(`✅ SW Active: ${registration.active?.state || 'none'}`)
          addLog(`✅ SW Installing: ${registration.installing?.state || 'none'}`)
          addLog(`✅ SW Waiting: ${registration.waiting?.state || 'none'}`)
          
          // Check if service worker is controlling this page
          if (navigator.serviceWorker.controller) {
            addLog(`✅ SW Controller: ${navigator.serviceWorker.controller.state}`)
            addLog(`✅ SW Controlling this page: YES`)
          } else {
            addLog(`❌ SW Controlling this page: NO - This is likely the issue!`)
            addLog(`ℹ️ Try refreshing the page or clicking "Force SW Takeover"`)
          }
        } else {
          addLog('❌ No service worker registration found')
        }
      } catch (error) {
        addLog(`❌ Error checking service worker: ${error}`)
      }
    }
  }

  const forceServiceWorkerTakeover = async () => {
    addLog('Forcing service worker to take control...')
    
    if (!navigator.serviceWorker) {
      addLog('❌ Service worker not supported')
      return
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      if (registration && registration.active) {
        // Force the active service worker to claim all clients
        registration.active.postMessage({ type: 'CLAIM_CLIENTS' })
        addLog('✅ Sent CLAIM_CLIENTS message to service worker')
        
        // Wait for controller change
        const controllerChangePromise = new Promise(resolve => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
        })
        
        // Timeout after 3 seconds
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 3000))
        
        await Promise.race([controllerChangePromise, timeoutPromise])
        
        if (navigator.serviceWorker.controller) {
          addLog('✅ Service worker now controlling this page!')
        } else {
          addLog('⚠️ Service worker still not controlling page, trying page reload...')
          window.location.reload()
        }
      } else {
        addLog('❌ No active service worker found')
      }
    } catch (error) {
      addLog(`❌ Error forcing takeover: ${error}`)
    }
  }

  const fixServiceWorkerControl = async () => {
    addLog('Attempting to fix service worker control...')
    
    if (!navigator.serviceWorker) {
      addLog('❌ Service worker not supported')
      return
    }

    try {
      // Simple approach: unregister all and reload
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const registration of registrations) {
        addLog('🔄 Unregistering service worker...')
        await registration.unregister()
      }
      
      addLog('✅ All service workers unregistered, reloading page...')
      window.location.reload()
      
    } catch (error) {
      addLog(`❌ Error fixing service worker: ${error}`)
    }
  }

  const testServiceWorkerFetch = async () => {
    addLog('Testing service worker fetch interception...')
    
    try {
      // Test if service worker can intercept a simple request
      const testUrl = '/ping'
      addLog(`Attempting fetch to: ${testUrl}`)
      
      const response = await fetch(testUrl)
      const text = await response.text()
      
      if (text === 'pong') {
        addLog('✅ Service worker fetch interception working!')
      } else {
        addLog(`❌ Expected 'pong', got: '${text}'`)
      }
    } catch (error) {
      addLog(`❌ Service worker fetch test failed: ${error}`)
    }
  }

  const testServiceWorkerMessage = async () => {
    addLog('Testing service worker message passing...')
    
    try {
      // Check browser
      const isFirefox = navigator.userAgent.toLowerCase().includes('firefox')
      addLog(`Browser detected: ${isFirefox ? 'Firefox' : 'Chrome/Other'}`)
      
      const registration = await navigator.serviceWorker.getRegistration('/')
      if (registration && registration.active) {
        addLog(`SW State: ${registration.active.state}`)
        addLog(`SW Script URL: ${registration.active.scriptURL}`)
        addLog(`SW Controller: ${navigator.serviceWorker.controller ? 'YES' : 'NO'}`)
        
        addLog('Sending test message to service worker...')
        registration.active.postMessage({ 
          type: 'TEST_MESSAGE',
          message: 'Hello from test page',
          timestamp: Date.now()
        })
        addLog('✅ Test message sent, check SW console for receipt')
        
        // In Firefox, also try sending via controller if available
        if (isFirefox && navigator.serviceWorker.controller) {
          addLog('Firefox: Also sending via controller...')
          navigator.serviceWorker.controller.postMessage({
            type: 'TEST_MESSAGE',
            message: 'Hello from controller',
            timestamp: Date.now()
          })
        }
        
        // Add a delay and check if service worker is logging anything
        setTimeout(() => {
          addLog('If you see this but no SW logs in console, Firefox SW messaging is broken')
          addLog('Check if you see "Service worker script loaded - Firefox debugging enabled" in console')
          
          // Try BroadcastChannel fallback for Firefox
          if (isFirefox) {
            addLog('Trying BroadcastChannel fallback for Firefox...')
            try {
              const channel = new BroadcastChannel('streamsaver-firefox-fallback')
              channel.postMessage({
                type: 'TEST_MESSAGE',
                message: 'Hello via BroadcastChannel',
                timestamp: Date.now()
              })
              addLog('✅ BroadcastChannel message sent')
              channel.close()
            } catch (error) {
              addLog(`❌ BroadcastChannel failed: ${error}`)
            }
          }
        }, 1000)
      } else {
        addLog('❌ No active service worker found')
        if (registration) {
          addLog(`Registration exists but active: ${registration.active ? 'YES' : 'NO'}`)
          addLog(`Installing: ${registration.installing ? registration.installing.state : 'NO'}`)
          addLog(`Waiting: ${registration.waiting ? registration.waiting.state : 'NO'}`)
        }
      }
    } catch (error) {
      addLog(`❌ Service worker message test failed: ${error}`)
    }
  }


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          StreamSaver Test Suite
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Test Controls */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Basic Tests
              </h2>
              <div className="space-y-3">
                <button
                  onClick={checkStreamSaverSupport}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  disabled={isDownloading}
                >
                  Check Support
                </button>
                <button
                  onClick={forceServiceWorkerTakeover}
                  className="w-full px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                  disabled={isDownloading}
                >
                  Force SW Takeover
                </button>
                <button
                  onClick={fixServiceWorkerControl}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  disabled={isDownloading}
                >
                  Fix SW (Re-register)
                </button>
                <button
                  onClick={testServiceWorkerFetch}
                  className="w-full px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50"
                  disabled={isDownloading}
                >
                  Test SW Fetch
                </button>
                <button
                  onClick={testServiceWorkerMessage}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                  disabled={isDownloading}
                >
                  Test SW Message
                </button>
                <button
                  onClick={testSimpleTextDownload}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  disabled={isDownloading}
                >
                  Test Simple Text Download
                </button>
                <button
                  onClick={testJSONDownload}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                  disabled={isDownloading}
                >
                  Test JSON Download
                </button>
                <button
                  onClick={testBinaryDownload}
                  className="w-full px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                  disabled={isDownloading}
                >
                  Test Binary Download
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                useStreamSaver Hook Tests
              </h2>
              <div className="space-y-3">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Hook Status: {hookInitialized ? '✅ Ready' : '⏳ Initializing'} | 
                  Stream: {isStreamActive() ? '🔄 Active' : '💤 Idle'}
                </div>
                
                {hookProgress.bytes > 0 && (
                  <div className="mb-3">
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Hook Progress: {hookProgress.bytes.toLocaleString()} bytes ({hookProgress.percentage.toFixed(1)}%)
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${hookProgress.percentage}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={testHookSimpleText}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                  disabled={isDownloading || !hookInitialized}
                >
                  🪝 Hook: Simple Text
                </button>
                <button
                  onClick={testHookChunkedData}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  disabled={isDownloading || !hookInitialized}
                >
                  🪝 Hook: Chunked Data (500KB)
                </button>
                <button
                  onClick={testHookFakeImageData}
                  className="w-full px-4 py-2 bg-pink-600 text-white rounded hover:bg-pink-700 disabled:opacity-50"
                  disabled={isDownloading || !hookInitialized}
                >
                  🪝 Hook: Fake Image (2MB)
                </button>
                <button
                  onClick={testHookSlowStream}
                  className="w-full px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                  disabled={isDownloading || !hookInitialized}
                >
                  🪝 Hook: Slow CSV Stream
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Advanced Tests
              </h2>
              <div className="space-y-3">
                <button
                  onClick={testLargeFileDownload}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  disabled={isDownloading}
                >
                  Test Large File (5MB)
                </button>
                <button
                  onClick={testCustomHeaders}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  disabled={isDownloading}
                >
                  Test Custom Filename
                </button>
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                  />
                  <button
                    onClick={testFileReDownload}
                    className="w-full px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                    disabled={isDownloading}
                  >
                    Re-download Selected File
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Log Output */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Test Log
              </h2>
              <button
                onClick={clearLog}
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
              >
                Clear
              </button>
            </div>
            
            <div className="bg-gray-100 dark:bg-gray-900 rounded p-4 h-96 overflow-y-auto">
              <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {log.length === 0 ? 'No logs yet. Run a test to see output.' : log.join('\n')}
              </pre>
            </div>

            {isDownloading && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  <span className="text-blue-600 dark:text-blue-400">Processing download...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
            StreamSaver Test Suite
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Test Instructions:</h4>
              <ul className="text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Start with &quot;Check Support&quot; to verify functionality</li>
                <li>• Downloads appear in your default downloads folder</li>
                <li>• Large file test shows chunked streaming progress</li>
                <li>• File re-download test works with any uploaded file</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Technical Details:</h4>
              <ul className="text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Uses service worker for stream interception</li>
                <li>• MITM popup handles cross-origin messaging</li>
                <li>• Supports Chrome, Firefox, and Safari</li>
                <li>• Works offline once service worker is registered</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded">
            <h4 className="font-medium text-orange-900 dark:text-orange-100 mb-1">⚠️ Firefox Development Mode Known Issue:</h4>
            <p className="text-orange-800 dark:text-orange-200 text-sm">
              Firefox service workers don&apos;t work reliably with Next.js development mode. 
              StreamSaver works properly in Firefox in production builds. 
              For development testing in Firefox, use Chrome or build for production.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
