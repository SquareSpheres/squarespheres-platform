import { useState, useEffect } from 'react'
import initWasm, { decompress_chunk, hash_chunk } from '../../src/wasm/wasm_app.js'

export interface ReceiveFileTransferState {
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  receivedBytes: number;
  receivedChunks: number;
  // Optionally, add a buffer or stream for file reconstruction
}

export function useReceiverFileHandler() {
  const [transferState, setTransferState] = useState<ReceiveFileTransferState>({
    fileName: null,
    fileType: null,
    fileSize: null,
    receivedBytes: 0,
    receivedChunks: 0,
  })
  const [wasmReady, setWasmReady] = useState(false)


  // Load WASM on mount
  useEffect(() => {
    console.log('🔄 Starting WASM initialization for receiver...')
    
    initWasm()
      .then(() => {
        console.log('✅ WASM initialized successfully for receiver')
        
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
        console.error('❌ Failed to initialize WASM for receiver:', error)
        setWasmReady(false)
      })
  }, [])

  // Register chunk receive handler
  useEffect(() => {
    if (!wasmReady) return
  }, [wasmReady])

  return {
    transferState,
    wasmReady,
  }
} 