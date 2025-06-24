import { useState } from 'react'
import QRCode from 'qrcode'

export function useFileHandler() {
  const [file, setFile] = useState<File | null>(null)
  const [code, setCode] = useState<string>('')
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile)

    // TODO: Analyze the file (e.g., calculate hash)

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
    file,
    code,
    qrCodeUrl,
    handleFileSelect,
    setFile,
  }
} 