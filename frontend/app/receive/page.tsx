'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

function ReceiveComponent() {
  const searchParams = useSearchParams()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState('idle') // idle, connecting, connected, error

  useEffect(() => {
    const codeFromUrl = searchParams.get('code')
    if (codeFromUrl) {
      setCode(codeFromUrl)
    }
  }, [searchParams])

  const handleConnect = () => {
    if (!code || code.length !== 6) {
      alert('Please enter a valid 6-digit code.')
      return
    }
    
    setStatus('connecting')
    console.log(`Attempting to connect with code: ${code}`)

    // TODO: Connect to signaling server via WebSocket
    // TODO: Send code to server to find sender
    // TODO: Implement WebRTC connection logic

    // Placeholder for connection logic
    setTimeout(() => {
        // This is where we would handle success/failure from the signaling server
        // For now, let's simulate a successful connection
        setStatus('connected')
    }, 2000)
  }

  const renderStatus = () => {
    switch (status) {
      case 'connecting':
        return (
          <div className="mt-8 text-center text-yellow-400 bg-yellow-900 bg-opacity-50 p-4 rounded-lg">
            <p className="font-semibold">Connecting...</p>
            <p className="text-sm">Attempting to establish a connection with the sender.</p>
          </div>
        )
      case 'connected':
        return (
          <div className="mt-8 text-center text-green-400 bg-green-900 bg-opacity-50 p-4 rounded-lg">
            <p className="font-semibold">Connection Established!</p>
            <p className="text-sm">Preparing to receive the file. This is where the file transfer would begin.</p>
          </div>
        )
      case 'error':
         return (
          <div className="mt-8 text-center text-red-400 bg-red-900 bg-opacity-50 p-4 rounded-lg">
            <p className="font-semibold">Connection Failed</p>
            <p className="text-sm">Could not connect to the sender. Please check the code and try again.</p>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="w-full max-w-sm sm:max-w-md text-center">
      <div className="card bg-gray-800 p-6 sm:p-8 rounded-xl">
        <h2 className="text-xl sm:text-2xl font-bold mb-4">Receive a File</h2>
        <p className="text-gray-400 mb-6 text-sm sm:text-base">Enter the 6-digit code from the sender to start the transfer.</p>
        
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="A1B2C3"
            className="input bg-gray-700 border-gray-600 text-white w-full text-center text-2xl sm:text-3xl font-mono tracking-widest h-14 sm:h-16"
          />
          <button 
            onClick={handleConnect} 
            disabled={!code || code.length !== 6 || status === 'connecting' || status === 'connected'} 
            className="btn btn-primary bg-blue-600 hover:bg-blue-700 h-14 sm:h-16 w-16 sm:w-20 flex items-center justify-center"
          >
            <ArrowRight className="h-6 w-6 sm:h-8 sm:w-8" />
          </button>
        </div>
        {renderStatus()}
      </div>
    </div>
  )
}


export default function ReceivePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ReceiveComponent />
    </Suspense>
  )
} 