import { useState } from 'react'
import QRCode from 'qrcode'

export function useFileHandler() {
  const [files, setFiles] = useState<File[]>([])
  const [code, setCode] = useState<string>('')
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')

  // Accepts FileList or File[]
  const handleFileSelect = async (selected: FileList | File[]) => {
    const fileArray = Array.from(selected)
    setFiles(fileArray)

    // TODO: Analyze the files (e.g., calculate hash)

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
    handleFileSelect,
    setFiles,
  }
} 