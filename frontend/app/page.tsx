'use client'

import { useRef, useState, DragEvent, ChangeEvent, useEffect, useMemo, useCallback } from 'react'
import QRCode from 'qrcode'
import Image from 'next/image'
import { File, CheckCircle, Copy, Check, Users, UploadCloud, Share2, QrCode, Link, ChevronDown } from 'lucide-react'
import FileDropAnimation from './FileDropAnimation'
import { useFileTransferFactory } from './hooks/useFileTransferFactory'
import { getConnectionStats, ConnectionStats } from './utils/webrtcUtils'
import { useWebRTCConfig } from './hooks/useWebRTCConfig'
import { Logger, createLogger } from './types/logger'

export const dynamic = 'force-dynamic'

export default function SendPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const selectedFileRef = useRef<File | null>(null)
  const [isCreatingHost, setIsCreatingHost] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [connectionStats, setConnectionStats] = useState<ConnectionStats | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [fileInfoSent, setFileInfoSent] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [showQRCode, setShowQRCode] = useState(false)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('')

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    selectedFileRef.current = selectedFile
    setFileInfoSent(false) // Reset file info sent flag when new file is selected
  }, [selectedFile])


  const uiLogger: Logger = useMemo(() => ({
    log: (...args) => {
      if (!isMounted) return;
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    },
    warn: (...args) => {
      if (!isMounted) return;
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: WARN: ${message}`]);
    },
    error: (...args) => {
      if (!isMounted) return;
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ERROR: ${message}`]);
    },
    info: (...args) => {
      if (!isMounted) return;
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: INFO: ${message}`]);
    }
  }), [isMounted]);

  const { iceServers, usingTurnServers, isLoadingTurnServers } = useWebRTCConfig();

  const updateConnectionStats = async () => {
    try {
      const pc = hostFileTransfer.getPeerConnection();
      if (pc && pc.connectionState === 'connected') {
        const stats = await getConnectionStats(pc, true);
        setConnectionStats(stats);
      }
    } catch (error) {
      uiLogger.warn('Failed to get connection stats:', error);
    }
  };

  const hostFileTransfer = useFileTransferFactory({
    role: 'host',
    mode: 'event-driven',  // Switch to 'event-driven' for 2-3x better throughput on large files
    debug: true,
    iceServers,
    logger: createLogger('Host', uiLogger),
    onConnectionStateChange: (s: RTCPeerConnectionState) => {
      if (s === 'connected' || s === 'failed') {
        uiLogger.log(`Connection: ${s}`);
      }
      if (s === 'disconnected' || s === 'closed' || s === 'failed') {
        uiLogger.log(`Receiver disconnected (${s})`);
      }
    },
    onChannelOpen: () => uiLogger.log('Data channel ready'),
    onChannelClose: () => {
      uiLogger.log('Data channel closed - Receiver disconnected');
    },
    onIceConnectionStateChange: (state: RTCIceConnectionState) => {
      if (state === 'connected' || state === 'failed') {
        uiLogger.log(`ICE: ${state}`);
        if (state === 'connected') {
          setTimeout(() => updateConnectionStats(), 1000);
        }
      }
      if (state === 'disconnected' || state === 'closed' || state === 'failed') {
        uiLogger.log(`ICE disconnected: ${state}`);
      }
    },
    onClientJoined: (clientId: string) => {
      uiLogger.log(`🔗 Signaling: Client ${clientId} joined`);
    },
    onClientDisconnected: (clientId: string) => {
      uiLogger.log(`🔌 Signaling: Client ${clientId} disconnected from server`);
    },
    onProgress: (progress) => {
      const milestones = [10, 30, 50, 70, 90, 100];
      if (milestones.includes(progress.percentage)) {
        uiLogger.log(`Progress: ${progress.percentage}%`);
      }
    },
    onComplete: (file, fileName) => uiLogger.log(`Transfer completed: ${fileName}`),
    onError: (error) => uiLogger.error(`Error: ${error}`),
    onConnectionRejected: (reason: string) => {
      uiLogger.error(`Connection rejected: ${reason}`);
    },
    onConnectionFailed: (error: Error) => {
      uiLogger.error(`Connection failed: ${error.message}`);
    }
  });

  // Memoize the specific properties we need to avoid unnecessary re-renders
  const connectedClient = useMemo(() => hostFileTransfer.connectedClient, [hostFileTransfer.connectedClient]);
  const sendFileInfo = useMemo(() => hostFileTransfer.sendFileInfo, [hostFileTransfer.sendFileInfo]);

  useEffect(() => {
    if (hostFileTransfer.connectedClient) {
      uiLogger.log(`✅ Client ID tracked: ${hostFileTransfer.connectedClient}`);
    } else {
      uiLogger.log('❌ No client ID (cleared)');
    }
  }, [hostFileTransfer.connectedClient, uiLogger]);

  useEffect(() => {
    uiLogger.log(`Connection state changed to: ${hostFileTransfer.connectionState}`);
  }, [hostFileTransfer.connectionState, uiLogger]);

  const handleFileSelect = async (files: FileList) => {
    if (files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      uiLogger.log(`Selected: ${file.name} (${formatFileSize(file.size)})`);
      
      if (!hostFileTransfer.peerId) {
        setIsCreatingHost(true);
        try {
          await hostFileTransfer.createOrEnsureConnection();
          uiLogger.log('Host created successfully');
        } catch (error) {
          uiLogger.error(`Error creating host: ${error}`);
        } finally {
          setIsCreatingHost(false);
        }
      }

      if (connectedClient && sendFileInfo && !fileInfoSent) {
        setTimeout(() => {
          try {
            sendFileInfo(file.name, file.size);
            setFileInfoSent(true);
            uiLogger.log(`File info sent to already connected client: ${file.name} (${formatFileSize(file.size)})`);
          } catch (error) {
            uiLogger.warn(`Failed to send file info to connected client: ${error}`);
          }
        }, 100);
      }
    }
  };

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

  useEffect(() => {
    if (connectedClient && selectedFileRef.current && sendFileInfo && !fileInfoSent) {
      setTimeout(() => {
        try {
          sendFileInfo(selectedFileRef.current!.name, selectedFileRef.current!.size);
          setFileInfoSent(true); 
          uiLogger.log(`File info sent to connected client: ${selectedFileRef.current!.name} (${formatFileSize(selectedFileRef.current!.size)})`);
        } catch (error) {
          uiLogger.warn(`Failed to send file info to connected client: ${error}`);
        }
      }, 100);
    }
  }, [connectedClient, sendFileInfo, fileInfoSent, uiLogger])
  
  const sendFile = async () => {
    if (!selectedFile) return;
    
    try {
      uiLogger.log(`Starting transfer: ${selectedFile.name}`);
      await hostFileTransfer.sendFile(selectedFile);
      uiLogger.log(`Transfer completed: ${selectedFile.name}`);
    } catch (error) {
      console.error('Error sending file:', error);
      uiLogger.error(`Error sending file: ${error}`);
    }
  };

  const copyCode = async () => {
    if (hostFileTransfer.peerId) {
      await navigator.clipboard.writeText(hostFileTransfer.peerId);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const getShareLink = useCallback(() => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/receive/?code=${hostFileTransfer.peerId}`;
  }, [hostFileTransfer.peerId]);

  const copyShareLink = useCallback(async () => {
    const shareLink = getShareLink();
    await navigator.clipboard.writeText(shareLink);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
    setShowShareMenu(false);
  }, [getShareLink]);

  const shareViaWebAPI = useCallback(async () => {
    const shareLink = getShareLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'File Transfer',
          text: 'Receive a file from me',
          url: shareLink,
        });
        setShowShareMenu(false);
      } catch (error) {
        // User cancelled sharing or error occurred, fallback to copy
        copyShareLink();
      }
    } else {
      copyShareLink();
    }
  }, [getShareLink, copyShareLink]);

  const generateQRCode = useCallback(async () => {
    if (hostFileTransfer.peerId) {
      try {
        const shareLink = getShareLink();
        const dataUrl = await QRCode.toDataURL(shareLink, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        setQrCodeDataUrl(dataUrl);
      } catch (error) {
        console.error('Failed to generate QR code:', error);
      }
    }
  }, [hostFileTransfer.peerId, getShareLink]);

  const toggleQRCode = async () => {
    if (!showQRCode && hostFileTransfer.peerId) {
      await generateQRCode();
    }
    setShowQRCode(!showQRCode);
    setShowShareMenu(false);
  };

  // Generate QR code when peerId changes
  useEffect(() => {
    if (hostFileTransfer.peerId && showQRCode) {
      generateQRCode();
    }
  }, [hostFileTransfer.peerId, showQRCode, generateQRCode]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTransferRate = (bytesPerSecond: number) => {
    if (bytesPerSecond === 0) return '0.0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)).toFixed(1) + ' ' + sizes[i];
  };

  const calculateRate = () => {
    if (!hostFileTransfer.transferProgress || hostFileTransfer.transferProgress.status !== 'transferring') return 0;
    
    const now = Date.now();
    const timeElapsed = (now - (hostFileTransfer.transferProgress.startTime || now)) / 1000;
    return timeElapsed > 0 ? hostFileTransfer.transferProgress.bytesTransferred / timeElapsed : 0;
  };

  const transferRate = calculateRate();

  return (
    <div className="w-full max-w-2xl mx-auto">
      {!selectedFile ? (
        <>
          {/* Desktop: Drop Zone */}
          <div 
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`hidden sm:block border-4 border-dashed rounded-xl p-8 sm:p-16 transition-colors duration-300 bg-card text-center ${isDragging ? 'border-primary bg-muted' : 'border-border hover:border-primary/50'}`}
            suppressHydrationWarning
          >
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <FileDropAnimation isDragging={isDragging} />
            <h2 className="text-xl sm:text-2xl font-bold mb-2 text-foreground">Drop your file here</h2>
            <p className="text-muted-foreground mb-6">or</p>
            <button onClick={handleBrowseClick} className="btn btn-primary px-6 py-2 text-base sm:text-lg">Browse Files</button>
          </div>

          {/* Mobile: Card-based Design */}
          <div className="sm:hidden space-y-6">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-2">Send Files</h1>
              <p className="text-muted-foreground">Share files instantly with anyone</p>
            </div>

            <div className="card p-6 rounded-2xl border border-border bg-gradient-to-br from-card to-muted/50">
              <div className="text-center space-y-6">
                <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <UploadCloud className="h-10 w-10 text-primary" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">Choose a file</h3>
                  <p className="text-sm text-muted-foreground">Select any file from your device to get started</p>
                </div>

                <button 
                  onClick={handleBrowseClick} 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-3"
                >
                  <File className="h-5 w-5" />
                  Choose File
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="card p-4 rounded-xl text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-accent/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-accent" />
                </div>
                <h4 className="font-medium text-sm">Instant Sharing</h4>
                <p className="text-xs text-muted-foreground mt-1">No accounts needed</p>
              </div>
              
              <div className="card p-4 rounded-xl text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-primary" />
                </div>
                <h4 className="font-medium text-sm">Secure Transfer</h4>
                <p className="text-xs text-muted-foreground mt-1">Direct peer connection</p>
              </div>
            </div>
          </div>

          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
        </>
      ) : (
        <div className="space-y-4">
          <div className="card p-6 rounded-xl">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle className="h-8 w-8 text-primary" />
                <div>
                  <h2 className="text-xl font-bold text-card-foreground">File Selected</h2>
                  <p className="text-sm text-muted-foreground">
                    {hostFileTransfer.connectedClient 
                      ? `Receiver ID: ${hostFileTransfer.connectedClient}` 
                      : 'Waiting for receiver...'}
                  </p>
                </div>
              </div>

              {/* Desktop: Grid layout */}
              <div className="hidden sm:grid grid-cols-3 gap-3 text-sm">
                {/* Signaling Server Status */}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Signaling:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    hostFileTransfer.signalingConnected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-destructive/10 text-destructive'
                  }`}>
                    {hostFileTransfer.signalingConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                {/* Client Connection Status */}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Client:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    hostFileTransfer.connectedClient
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {hostFileTransfer.connectedClient ? 'Connected' : 'Waiting'}
                  </span>
                </div>

                {/* WebRTC Status */}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">WebRTC:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    hostFileTransfer.connectionState === 'connected'
                      ? 'bg-primary/10 text-primary'
                      : hostFileTransfer.connectionState === 'connecting'
                      ? 'bg-accent/10 text-accent'
                      : hostFileTransfer.connectionState === 'failed'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {hostFileTransfer.connectionState}
                  </span>
                </div>
              </div>

              {/* Mobile: Aligned table-style layout */}
              <div className="sm:hidden space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Signaling:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    hostFileTransfer.signalingConnected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-destructive/10 text-destructive'
                  }`}>
                    {hostFileTransfer.signalingConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Client:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    hostFileTransfer.connectedClient
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {hostFileTransfer.connectedClient ? 'Connected' : 'Waiting'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">WebRTC:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    hostFileTransfer.connectionState === 'connected'
                      ? 'bg-primary/10 text-primary'
                      : hostFileTransfer.connectionState === 'connecting'
                      ? 'bg-accent/10 text-accent'
                      : hostFileTransfer.connectionState === 'failed'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {hostFileTransfer.connectionState}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3">
                <File className="h-8 w-8 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm break-all text-card-foreground">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                </div>
              </div>
            </div>

            {isCreatingHost ? (
              <div className="text-center py-4">
                <div className="inline-flex items-center gap-2 text-muted-foreground">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating connection...
                </div>
              </div>
            ) : hostFileTransfer.peerId ? (
              <div className="space-y-4">
                <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-2">Share this code with receiver:</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-background rounded-lg px-4 py-3 font-mono text-2xl tracking-widest text-center border border-border">
                      {hostFileTransfer.peerId}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={copyCode}
                        className="p-3 bg-background hover:bg-muted rounded-lg border border-border transition-colors"
                        title="Copy code"
                      >
                        {codeCopied ? (
                          <Check className="h-5 w-5 text-primary" />
                        ) : (
                          <Copy className="h-5 w-5" />
                        )}
                      </button>
                      
                      {/* Share Button with Dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setShowShareMenu(!showShareMenu)}
                          className="p-3 bg-background hover:bg-muted rounded-lg border border-border transition-colors"
                          title="Share"
                        >
                          <Share2 className="h-5 w-5" />
                        </button>
                        
                        {showShareMenu && (
                          <>
                            {/* Backdrop */}
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setShowShareMenu(false)}
                            />
                            
                            {/* Dropdown Menu */}
                            <div className="absolute right-0 top-full mt-2 w-48 bg-background border border-border rounded-lg shadow-lg z-20">
                              <div className="p-2">
                                <button
                                  onClick={shareViaWebAPI}
                                  className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted rounded-md transition-colors"
                                >
                                  <Share2 className="h-4 w-4" />
                                  Share Link
                                </button>
                                <button
                                  onClick={copyShareLink}
                                  className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted rounded-md transition-colors"
                                >
                                  <Link className="h-4 w-4" />
                                  Copy Link
                                </button>
                                <button
                                  onClick={toggleQRCode}
                                  className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted rounded-md transition-colors"
                                >
                                  <QrCode className="h-4 w-4" />
                                  Show QR Code
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* QR Code Modal */}
                {showQRCode && hostFileTransfer.peerId && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-background rounded-lg p-6 max-w-sm w-full">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">QR Code</h3>
                        <button
                          onClick={() => setShowQRCode(false)}
                          className="p-1 hover:bg-muted rounded-md transition-colors"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex justify-center mb-4">
                        <div className="bg-white p-4 rounded-lg">
                          {qrCodeDataUrl ? (
                            <Image 
                              src={qrCodeDataUrl} 
                              alt="QR Code for file transfer" 
                              width={192}
                              height={192}
                              className="w-48 h-48"
                              unoptimized
                            />
                          ) : (
                            <div className="w-48 h-48 flex items-center justify-center bg-gray-100 rounded">
                              <div className="text-center">
                                <QrCode className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                                <div className="text-xs text-gray-500">Generating QR code...</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground text-center">
                        Scan this QR code to receive the file
                      </p>
                    </div>
                  </div>
                )}

                <button
                  onClick={sendFile}
                  disabled={!hostFileTransfer.connectedClient || hostFileTransfer.isTransferring || hostFileTransfer.transferProgress?.status === 'completed' || (hostFileTransfer.transferProgress?.percentage ?? 0) >= 100}
                  className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {(hostFileTransfer.transferProgress?.status === 'completed' || (hostFileTransfer.transferProgress?.percentage ?? 0) >= 100) ? (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Transfer Complete
                    </>
                  ) : hostFileTransfer.isTransferring ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </>
                  ) : !hostFileTransfer.connectedClient ? (
                    'Waiting for receiver...'
                  ) : (
                    'Send File'
                  )}
                </button>
              </div>
            ) : null}
          </div>

          {hostFileTransfer.transferProgress && (
            <div className="card p-6 rounded-xl">
              <h3 className="text-lg font-semibold mb-4">Transfer Progress</h3>
              
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Transferred</div>
                    <div className="font-mono text-foreground">
                      {formatFileSize(hostFileTransfer.transferProgress.bytesTransferred)} / {formatFileSize(hostFileTransfer.transferProgress.fileSize)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Speed</div>
                    <div className="font-mono text-foreground">
                      {hostFileTransfer.transferProgress.status === 'transferring' && transferRate > 0 ? formatTransferRate(transferRate) : '-'}
                    </div>
                  </div>
                </div>

                {/* Send Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Send Progress</span>
                    <span className="text-sm font-mono text-muted-foreground">
                      {hostFileTransfer.transferProgress.percentage}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                    <div 
                      className={`h-3 rounded-full transition-[width] duration-300 ${
                        hostFileTransfer.transferProgress.status === 'completed' ? 'bg-primary' :
                        hostFileTransfer.transferProgress.status === 'error' ? 'bg-destructive' :
                        'bg-accent'
                      }`}
                      style={{ width: `${Math.min(100, hostFileTransfer.transferProgress.percentage)}%` }}
                    />
                  </div>
                </div>

                {/* ACK Progress (if available) */}
                {hostFileTransfer.ackProgress && (
                  <div className="pt-4 border-t border-border">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-accent">Receiver Confirmation</span>
                        <span className="text-sm font-mono text-accent">
                          {hostFileTransfer.ackProgress.percentage}%
                        </span>
                      </div>
                      <div className="w-full bg-accent/10 rounded-full h-3 overflow-hidden">
                        <div 
                          className={`h-3 rounded-full transition-[width] duration-300 ${
                            hostFileTransfer.ackProgress.status === 'completed' ? 'bg-primary' :
                            hostFileTransfer.ackProgress.status === 'waiting' ? 'bg-accent' :
                            'bg-secondary'
                          }`}
                          style={{ width: `${Math.min(100, hostFileTransfer.ackProgress.percentage)}%` }}
                        />
                      </div>
                      <div className="text-xs text-accent">
                        Confirmed: {formatFileSize(hostFileTransfer.ackProgress.bytesAcknowledged)} / {formatFileSize(hostFileTransfer.ackProgress.fileSize)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Status */}
                <div className={`text-sm ${
                  hostFileTransfer.transferProgress.status === 'completed' || hostFileTransfer.transferProgress.percentage >= 100 ? 'text-primary' :
                  hostFileTransfer.transferProgress.status === 'error' ? 'text-destructive' :
                  'text-accent'
                }`}>
                  Status: {hostFileTransfer.transferProgress.percentage >= 100 ? 'completed' : hostFileTransfer.transferProgress.status}
                </div>
              </div>
            </div>
          )}

          {connectionStats && (
            <div className="card p-4 rounded-xl">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Connection Type:</span>
                  <span className={`font-medium ${
                    connectionStats.connectionType === 'DIRECT' ? 'text-primary' :
                    connectionStats.connectionType === 'TURN' ? 'text-accent' :
                    'text-secondary'
                  }`}>{connectionStats.connectionType}</span>
                </div>
                {connectionStats.rtt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RTT:</span>
                    <span className="font-mono">{connectionStats.rtt.toFixed(0)}ms</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TURN Servers:</span>
                  <span className={`font-medium ${usingTurnServers ? 'text-primary' : 'text-accent'}`}>
                    {isLoadingTurnServers ? 'Loading...' : usingTurnServers ? 'Enabled' : 'STUN only'}
                  </span>
                </div>
              </div>
          </div>
          )}

          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showLogs ? 'Hide' : 'Show'} Logs
          </button>

          {showLogs && (
            <div className="card p-4 rounded-xl">
              <h3 className="text-sm font-semibold mb-2">Connection Logs</h3>
              <div className="h-40 overflow-y-auto border border-border rounded p-2 space-y-1 bg-muted/50">
                {logs.map((log, i) => (
                  <div key={i} className="text-xs text-foreground font-mono">{log}</div>
                ))}
              </div>
          </div>
          )}
        </div>
      )}
    </div>
  )
} 