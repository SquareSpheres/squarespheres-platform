'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Download, FileIcon } from 'lucide-react'
import { useFileTransfer } from '../hooks/useFileTransfer'
import { getConnectionStats, ConnectionStats } from '../hooks/webrtcUtils'
import { useWebRTCConfig } from '../hooks/useWebRTCConfig'
import { Logger, createLogger } from '../types/logger'

export const dynamic = 'force-dynamic'

function ReceiveComponent() {
  const searchParams = useSearchParams()
  const [code, setCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [connectionStats, setConnectionStats] = useState<ConnectionStats | null>(null)
  const [autoDownload, setAutoDownload] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  const uiLogger: Logger = useMemo(() => ({
    log: (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    },
    warn: (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: WARN: ${message}`]);
    },
    error: (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ERROR: ${message}`]);
    },
    info: (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: INFO: ${message}`]);
    }
  }), []);

  const { iceServers, usingTurnServers, isLoadingTurnServers } = useWebRTCConfig();

  const updateConnectionStats = async () => {
    try {
      const pc = clientFileTransfer.getPeerConnection();
      if (pc && pc.connectionState === 'connected') {
        const stats = await getConnectionStats(pc, true);
        setConnectionStats(stats);
      }
    } catch (error) {
      uiLogger.warn('Failed to get connection stats:', error);
    }
  };

  const clientFileTransfer = useFileTransfer({
    role: 'client',
    hostId: code || undefined,
    debug: true,
    iceServers,
    logger: createLogger('Client', uiLogger),
    onConnectionStateChange: (s: RTCPeerConnectionState) => {
      if (s === 'connected' || s === 'failed') {
        uiLogger.log(`Connection: ${s}`);
      }
    },
    onChannelOpen: () => uiLogger.log('Data channel ready'),
    onChannelClose: () => uiLogger.log('Data channel closed'),
    onIceConnectionStateChange: (state: RTCIceConnectionState) => {
      if (state === 'connected' || state === 'failed') {
        uiLogger.log(`ICE: ${state}`);
        if (state === 'connected') {
          setTimeout(() => updateConnectionStats(), 1000);
        }
      }
    },
    onProgress: (progress) => {
      const milestones = [10, 30, 50, 70, 90, 100];
      if (milestones.includes(progress.percentage)) {
        uiLogger.log(`Progress: ${progress.percentage}%`);
      }
    },
    onComplete: (file, fileName) => {
      uiLogger.log(`Transfer completed: ${fileName}`);
      if (autoDownload && file && fileName) {
        downloadFile(file, fileName);
      }
    },
    onError: (error) => {
      uiLogger.error(`Error: ${error}`);
      setConnectionError(String(error));
    },
    onConnectionRejected: (reason: string) => {
      uiLogger.error(`Connection rejected: ${reason}`);
      setConnectionError(reason);
    },
    onConnectionFailed: (error: Error) => {
      uiLogger.error(`Connection failed: ${error.message}`);
      setConnectionError(error.message);
    }
  });

  useEffect(() => {
    const codeFromUrl = searchParams.get('code')
    if (codeFromUrl) {
      setCode(codeFromUrl.toUpperCase())
    }
  }, [searchParams])

  const handleConnect = async () => {
    if (!code || code.length !== 6) {
      alert('Please enter a valid 6-digit code.')
      return
    }
    
    setConnectionError(null);
    setIsJoining(true);
    try {
      await clientFileTransfer.createOrEnsureConnection();
      uiLogger.log('Connected successfully');
    } catch (error) {
      console.error('Failed to join:', error);
      uiLogger.error(`Error connecting: ${error}`);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setConnectionError(errorMessage);
    } finally {
      setIsJoining(false);
    }
  }

  const downloadFile = (file: Blob, fileName: string) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    uiLogger.log(`Downloaded: ${fileName}`);
  };

  const handleDownload = () => {
    if (clientFileTransfer.receivedFile && clientFileTransfer.receivedFileName) {
      downloadFile(clientFileTransfer.receivedFile, clientFileTransfer.receivedFileName);
    }
  };

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
    if (!clientFileTransfer.transferProgress || clientFileTransfer.transferProgress.status !== 'transferring') return 0;
    
    const now = Date.now();
    const timeElapsed = (now - (clientFileTransfer.transferProgress.startTime || now)) / 1000;
    return timeElapsed > 0 ? clientFileTransfer.transferProgress.bytesTransferred / timeElapsed : 0;
  };

  const transferRate = calculateRate();

  return (
    <div className="w-full max-w-2xl mx-auto">
      {!clientFileTransfer.peerId ? (
        <div className="space-y-4">
        <div className="card p-6 sm:p-8 rounded-xl text-center">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 text-card-foreground">Receive a File</h2>
        <p className="text-muted-foreground mb-6 text-sm sm:text-base">Enter the 6-digit code from the sender to start the transfer.</p>
        
          <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="A1B2C3"
            className="input w-full text-center text-2xl sm:text-3xl font-mono tracking-widest h-14 sm:h-16"
          />
          <button 
            onClick={handleConnect} 
              disabled={!code || code.length !== 6 || isJoining} 
              className="btn btn-primary h-14 sm:h-16 w-16 sm:w-20 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isJoining ? (
                <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <ArrowRight className="h-6 w-6 sm:h-8 sm:w-8" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm">
            <input
              type="checkbox"
              id="autoDownload"
              checked={autoDownload}
              onChange={(e) => setAutoDownload(e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor="autoDownload" className="text-muted-foreground cursor-pointer">
              Automatically download file when received
            </label>
          </div>
        </div>
        
        {connectionError && (
          <div className="card p-4 sm:p-6 rounded-xl bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">Connection Failed</h3>
                <p className="text-sm text-red-700 dark:text-red-400">{connectionError}</p>
                {connectionError.includes('capacity') && (
                  <p className="text-xs text-red-600 dark:text-red-500 mt-2">
                    The host is already connected to another client. Please wait for them to disconnect or try a different code.
                  </p>
                )}
              </div>
              <button
                onClick={() => setConnectionError(null)}
                className="flex-shrink-0 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card p-6 rounded-xl">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-card-foreground mb-1">Connected to Sender</h2>
              <p className="text-sm text-muted-foreground">Waiting to receive file...</p>
            </div>

            <div className="flex items-center gap-2 text-sm mb-4">
              <input
                type="checkbox"
                id="autoDownload"
                checked={autoDownload}
                onChange={(e) => setAutoDownload(e.target.checked)}
                className="w-4 h-4 rounded border-border"
              />
              <label htmlFor="autoDownload" className="text-muted-foreground cursor-pointer">
                Automatically download file when received
              </label>
            </div>

            <div className="text-sm text-muted-foreground">
              Connection State: <span className={`font-medium ${
                clientFileTransfer.connectionState === 'connected' ? 'text-green-600' :
                clientFileTransfer.connectionState === 'connecting' ? 'text-yellow-600' :
                'text-muted-foreground'
              }`}>{clientFileTransfer.connectionState}</span>
            </div>
          </div>

          {clientFileTransfer.transferProgress && (
            <div className="card p-6 rounded-xl">
              <h3 className="text-lg font-semibold mb-4">Receiving File</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">File</div>
                    <div className="font-medium text-foreground truncate">
                      {clientFileTransfer.transferProgress.fileName || 'Unknown'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Size</div>
                    <div className="font-mono text-foreground">
                      {formatFileSize(clientFileTransfer.transferProgress.fileSize)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Received</div>
                    <div className="font-mono text-foreground">
                      {formatFileSize(clientFileTransfer.transferProgress.bytesTransferred)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Speed</div>
                    <div className="font-mono text-foreground">
                      {clientFileTransfer.transferProgress.status === 'transferring' && transferRate > 0 ? formatTransferRate(transferRate) : '-'}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Progress</span>
                    <span className="text-sm font-mono text-muted-foreground">
                      {clientFileTransfer.transferProgress.percentage}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                    <div 
                      className={`h-3 rounded-full transition-[width] duration-300 ${
                        clientFileTransfer.transferProgress.status === 'completed' ? 'bg-green-500' :
                        clientFileTransfer.transferProgress.status === 'error' ? 'bg-destructive' :
                        'bg-primary'
                      }`}
                      style={{ width: `${Math.min(100, clientFileTransfer.transferProgress.percentage)}%` }}
                    />
                  </div>
                </div>

                <div className={`text-sm ${
                  clientFileTransfer.transferProgress.status === 'completed' ? 'text-green-600' :
                  clientFileTransfer.transferProgress.status === 'error' ? 'text-red-600' :
                  'text-blue-600'
                }`}>
                  Status: {clientFileTransfer.transferProgress.status}
                </div>
              </div>
            </div>
          )}

          {clientFileTransfer.receivedFile && clientFileTransfer.receivedFileName && (
            <div className="card p-6 rounded-xl bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
              <h3 className="text-lg font-semibold mb-4 text-green-700 dark:text-green-300">File Received!</h3>
              
              <div className="bg-white dark:bg-green-900/20 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  <FileIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm break-all text-foreground">{clientFileTransfer.receivedFileName}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(clientFileTransfer.receivedFile.size)}</p>
                  </div>
                </div>
              </div>

              {!autoDownload && (
                <button
                  onClick={handleDownload}
                  className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="h-5 w-5" />
                  Download File
                </button>
              )}

              {autoDownload && (
                <div className="text-sm text-green-600 dark:text-green-400 text-center">
                  ✓ File downloaded automatically
                </div>
              )}
            </div>
          )}

          {connectionStats && (
            <div className="card p-4 rounded-xl">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Connection Type:</span>
                  <span className={`font-medium ${
                    connectionStats.connectionType === 'DIRECT' ? 'text-green-600' :
                    connectionStats.connectionType === 'TURN' ? 'text-orange-600' :
                    'text-blue-600'
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
                  <span className={`font-medium ${usingTurnServers ? 'text-green-600' : 'text-yellow-600'}`}>
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


export default function ReceivePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ReceiveComponent />
    </Suspense>
  )
} 