import React, { useState } from 'react'
import QRCode from 'qrcode'
// Import the WASM module dynamically
import initWasm, { process_file } from '../../wasm-module/wasm_app.js'

// TypeScript interfaces matching Rust structs
export interface FileMetadata {
  name: string;
  size: number;
  file_type: string;
}

export interface ChunkInfo {
  index: number;
  offset: number;
  length: number;
  hash: string;
}

export interface ProcessedFileResult {
  hash: string;
  metadata: FileMetadata;
  chunk_size: number;
  chunks: ChunkInfo[];
}

export function useFileHandler() {
  const [files, setFiles] = useState<File[]>([])
  const [code, setCode] = useState<string>('')
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [fileAnalyses, setFileAnalyses] = useState<ProcessedFileResult[]>([])
  const [wasmReady, setWasmReady] = useState(false)

  // Load WASM on mount
  React.useEffect(() => {
    initWasm().then(() => setWasmReady(true))
  }, [])

  // Accepts FileList or File[]
  const handleFileSelect = async (selected: FileList | File[]) => {
    const fileArray = Array.from(selected)
    setFiles(fileArray)

    if (fileArray.length > 0 && wasmReady) {
      const analyses: ProcessedFileResult[] = []
      for (const file of fileArray) {
        try {
          const arrayBuffer = await file.arrayBuffer()
          // 256KB chunk size as example
          const chunkSize = 256 * 1024
          const result = process_file(
            new Uint8Array(arrayBuffer),
            file.name,
            file.type,
            chunkSize
          ) as ProcessedFileResult
          analyses.push(result)
        } catch (err) {
          console.error('WASM file processing failed:', err)
        }
      }
      setFileAnalyses(analyses)
    } else {
      setFileAnalyses([])
    }

    // Placeholder for code generation
    const newCode = Math.random().toString().substring(2, 8)
    setCode(newCode)

    // Generate QR Code
    const receiveUrl = `${window.location.origin}/receive?code=${newCode}`
    try {
      const url = await QRCode.toDataURL(receiveUrl)
      setQrCodeUrl(url)
    } catch (err) {
      console.error('Failed to generate QR code:', err)
    }

    // TODO: Implement WebRTC setup
    // TODO: Connect to signaling server via WebSocket
  }

  return {
    files,
    code,
    qrCodeUrl,
    fileAnalyses,
    handleFileSelect,
    setFiles,
    wasmReady,
  }
} 