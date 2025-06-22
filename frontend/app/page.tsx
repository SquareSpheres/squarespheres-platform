'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { File, CheckCircle } from 'lucide-react'
import QRCode from 'qrcode'
import FileDropAnimation from './FileDropAnimation'

export default function SendPage() {
  const [file, setFile] = useState<File | null>(null)
  const [code, setCode] = useState<string>('')
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)

    // TODO: Analyze the file (e.g., calculate hash)
    
    // Placeholder for code generation
    const newCode = Math.random().toString().substring(2, 8)
    setCode(newCode)
    
    // Generate QR Code
    const receiveUrl = `${window.location.origin}/receive?code=${newCode}`
    QRCode.toDataURL(receiveUrl)
      .then(url => {
        setQrCodeUrl(url)
      })
      .catch(err => {
        console.error('Failed to generate QR code:', err)
      })

    // TODO: Implement WebRTC setup
    // TODO: Connect to signaling server via WebSocket
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }
  
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }
  
  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
  }

  return (
    <div className="w-full max-w-lg text-center">
      {!file ? (
        <div 
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`border-4 border-dashed rounded-xl p-8 sm:p-16 transition-colors duration-300 bg-gray-900 ${isDragging ? 'border-blue-500 bg-gray-800' : 'border-gray-600 hover:border-gray-500'}`}
        >
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <FileDropAnimation isDragging={isDragging} />
          <h2 className="text-xl sm:text-2xl font-bold mb-2">Drop your file here</h2>
          <p className="text-gray-400 mb-6">or</p>
          <button onClick={handleBrowseClick} className="btn btn-primary bg-blue-600 hover:bg-blue-700 px-6 py-2 text-base sm:text-lg">Browse Files</button>
        </div>
      ) : (
        <div className="card bg-gray-800 p-6 sm:p-8 rounded-xl text-left flex flex-col items-center w-full">
          <CheckCircle className="h-12 w-12 sm:h-16 sm:w-16 text-green-500 mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold mb-6">Ready to Send!</h2>

          <div className="bg-gray-700 rounded-lg p-4 w-full mb-6">
            <div className="flex items-center">
              <File className="h-6 w-6 sm:h-8 sm:w-8 text-blue-400 mr-4" />
              <div>
                <p className="font-semibold text-sm sm:text-base break-all">{file.name}</p>
                <p className="text-xs sm:text-sm text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
          </div>

          <p className="text-gray-400 mb-4 text-center">Share this code or QR with your recipient:</p>

          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 w-full">
            <div className="flex flex-col items-center">
              <p className="text-base sm:text-lg font-semibold mb-2">Your Code</p>
              <div className="bg-gray-900 px-6 py-3 sm:px-8 sm:py-4 rounded-lg">
                <p className="text-2xl sm:text-4xl font-mono tracking-widest">{code}</p>
              </div>
            </div>
            
            {qrCodeUrl && (
              <div className="flex flex-col items-center">
                <p className="text-base sm:text-lg font-semibold mb-2">Scan QR</p>
                <div className="bg-white p-2 rounded-lg">
                  <img src={qrCodeUrl} alt="QR Code" className="h-24 w-24 sm:h-32 sm:w-32" />
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-8 text-center text-yellow-400 bg-yellow-900 bg-opacity-50 p-3 rounded-lg w-full">
            <p className="text-sm sm:text-base">Waiting for recipient to connect...</p>
            <p className="text-xs sm:text-sm">(This is where WebRTC magic will happen)</p>
          </div>
        </div>
      )}
    </div>
  )
} 