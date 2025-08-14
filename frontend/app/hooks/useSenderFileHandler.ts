import React, { useState } from 'react'
import initWasm, { compress_chunk, hash_chunk } from '../../src/wasm/wasm_app.js'
import { useWebRTCSender } from './useWebRTCChannel/sender'

export interface FileTransferState {
  file: File;
  fileSize: number;
  bytesSent: number;
  compressedBytesSent: number;
}

export function useSenderFileHandler() {
  const [transferState, setTransferState] = useState<FileTransferState | null>(null)
  const [wasmReady, setWasmReady] = useState(false)
  const {
    sendChunk,
    createOffer,
    createAnswer,
    setRemoteDescription,
    addIceCandidate,
    connectionState,
  } = useWebRTCSender()

  // Load WASM on mount
  React.useEffect(() => {
    console.log('🔄 Starting WASM initialization for sender...')
    
    initWasm()
      .then(() => {
        console.log('✅ WASM initialized successfully for sender')
        
        // Test WASM functionality with a dummy function
        try {
          const testData = new Uint8Array([1, 2, 3, 4, 5])
          const hash = hash_chunk(testData)
          console.log('🧪 WASM test - hash_chunk result:', hash)
          console.log('✅ WASM functions are working correctly')
        } catch (error) {
          console.error('❌ WASM function test failed:', error)
        }
        
        setWasmReady(true)
      })
      .catch((error) => {
        console.error('❌ Failed to initialize WASM for sender:', error)
        setWasmReady(false)
      })
  }, [])

  // Handles file selection and starts chunked transfer
  const handleFileSelect = async (selected: FileList | File[]) => {
    const fileArray = Array.from(selected)
    if (!wasmReady || fileArray.length === 0) return
    const file = fileArray[0] // For now, handle one file at a time
    const fileSize = file.size
    let bytesSent = 0
    let compressedBytesSent = 0
    const stream = file.stream()
    const reader = stream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      // Compress chunk in WASM
      let compressed: Uint8Array
      try {
        compressed = compress_chunk(value)
      } catch (err) {
        console.error('WASM compression failed:', err)
        compressed = value
      }
      // Send chunk via WebRTC
      sendChunk(compressed)
      bytesSent += value.length
      compressedBytesSent += compressed.length
      setTransferState({
        file,
        fileSize,
        bytesSent,
        compressedBytesSent,
      })
    }
    // Optionally, signal transfer complete
  }

  return {
    transferState,
    handleFileSelect,
    wasmReady,
    createOffer,
    createAnswer,
    setRemoteDescription,
    addIceCandidate,
    connectionState,
  }
} 