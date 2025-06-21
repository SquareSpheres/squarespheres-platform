import { useState, useEffect } from 'react'
import initWasm, { decompress_chunk } from '../../wasm-module/wasm_app.js'
import { useWebRTCReceiver } from './useWebRTCChannel/receiver'

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
  const {
    onChunkReceived,
    createOffer,
    createAnswer,
    setRemoteDescription,
    addIceCandidate,
    connectionState,
  } = useWebRTCReceiver()

  // Load WASM on mount
  useEffect(() => {
    initWasm().then(() => setWasmReady(true))
  }, [])

  // Register chunk receive handler
  useEffect(() => {
    if (!wasmReady) return
    onChunkReceived((chunk: Uint8Array) => {
      // Decompress chunk in WASM
      let decompressed: Uint8Array
      try {
        decompressed = decompress_chunk(chunk)
      } catch (err) {
        console.error('WASM decompression failed:', err)
        decompressed = chunk
      }
      // TODO: Write decompressed chunk to buffer, stream, or IndexedDB
      setTransferState(prev => ({
        ...prev,
        receivedBytes: prev.receivedBytes + decompressed.length,
        receivedChunks: prev.receivedChunks + 1,
      }))
    })
  }, [wasmReady, onChunkReceived])

  return {
    transferState,
    wasmReady,
    createOffer,
    createAnswer,
    setRemoteDescription,
    addIceCandidate,
    connectionState,
  }
} 