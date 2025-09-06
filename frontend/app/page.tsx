'use client'

import { useRef, useState, DragEvent, ChangeEvent } from 'react'
import { File, CheckCircle } from 'lucide-react'
import FileDropAnimation from './FileDropAnimation'
import { useSenderFileHandler } from './hooks/useSenderFileHandler'

export default function SendPage() {
  const { transferState, handleFileSelect, connectionState } = useSenderFileHandler()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0);
  const isDraggingRef = useRef(false);
  const [, forceUpdate] = useState({}); // for re-rendering on drag state

  // Local state for drag UI only
  const setIsDragging = (val: boolean) => {
    isDraggingRef.current = val;
    forceUpdate({});
  }
  const isDragging = isDraggingRef.current;

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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files)
    }
  }
  
  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files)
    }
  }

  // Helper for progress
  const progress = transferState && transferState.fileSize > 0
    ? (transferState.bytesSent / transferState.fileSize) * 100
    : 0

  return (
    <div className="w-full max-w-lg text-center">
      {!transferState ? (
        <div 
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`border-4 border-dashed rounded-xl p-8 sm:p-16 transition-colors duration-300 bg-card ${isDragging ? 'border-primary bg-muted' : 'border-border hover:border-primary/50'}`}
        >
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
          <FileDropAnimation isDragging={isDragging} />
          <h2 className="text-xl sm:text-2xl font-bold mb-2 text-foreground">Drop your files here</h2>
          <p className="text-muted-foreground mb-6">or</p>
          <button onClick={handleBrowseClick} className="btn btn-primary px-6 py-2 text-base sm:text-lg">Browse Files</button>
        </div>
      ) : (
        <div className="card p-6 sm:p-8 rounded-xl text-left flex flex-col items-center w-full">
          <CheckCircle className="h-12 w-12 sm:h-16 sm:w-16 text-green-600 dark:text-green-400 mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold mb-6 text-card-foreground">Ready to Send!</h2>

          <div className="bg-muted rounded-lg p-4 w-full mb-6">
            <ul>
              <li className="flex items-center mb-2 last:mb-0">
                <File className="h-6 w-6 sm:h-8 sm:w-8 text-primary mr-4" />
                <div>
                  <p className="font-semibold text-sm sm:text-base break-all text-card-foreground">{transferState.file.name}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">{(transferState.file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="w-full mb-4">
            <div className="h-4 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{progress.toFixed(1)}% sent</p>
            <p className="text-xs text-muted-foreground mt-1">Compressed: {(transferState.compressedBytesSent / 1024 / 1024).toFixed(2)} MB</p>
          </div>

          <div className="mt-8 text-center status-loading p-3 rounded-lg w-full">
            <p className="text-sm sm:text-base">Connection state: {connectionState}</p>
            <p className="text-xs sm:text-sm">(This is where WebRTC magic will happen)</p>
          </div>
        </div>
      )}
    </div>
  )
} 