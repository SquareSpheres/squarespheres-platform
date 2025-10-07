'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFileTransfer } from '../hooks/useFileTransfer';
import { DEFAULT_ICE_SERVERS, getConnectionStats, ConnectionStats } from '../hooks/webrtcUtils';
import { Logger, createLogger } from '../types/logger';

export const dynamic = 'force-dynamic'

export default function FileTransferDemoPage() {
  const [hostIdInput, setHostIdInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'host' | 'client'>('host');
  const [isCreatingHost, setIsCreatingHost] = useState(false);
  const [isJoiningClient, setIsJoiningClient] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorHistory, setErrorHistory] = useState<string[]>([]);
  const [transferRates, setTransferRates] = useState<{ host: number; client: number }>({ host: 0, client: 0 });
  const [connectionTypes, setConnectionTypes] = useState<{ host: string; client: string }>({ host: 'Unknown', client: 'Unknown' });
  const [actualConnectionStats, setActualConnectionStats] = useState<{ 
    host: ConnectionStats | null; 
    client: ConnectionStats | null 
  }>({ host: null, client: null });

  // Create a UI-integrated logger
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
      setErrorHistory(prev => [...prev, message]);
    },
    info: (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: INFO: ${message}`]);
    }
  }), []);

  const iceServers = useMemo(() => DEFAULT_ICE_SERVERS, []);

  // Function to get actual connection stats
  const updateConnectionStats = async (role: 'host' | 'client') => {
    try {
      const peer = role === 'host' ? hostFileTransfer : clientFileTransfer;
      const pc = peer.getPeerConnection();
      if (pc && pc.connectionState === 'connected') {
        const stats = await getConnectionStats(pc);
        setActualConnectionStats(prev => ({
          ...prev,
          [role]: stats
        }));
        uiLogger.log(`${role} actual connection: ${stats.connectionType} (${stats.localCandidate} ↔ ${stats.remoteCandidate})`);
        if (stats.rtt) {
          uiLogger.log(`${role} RTT: ${stats.rtt.toFixed(0)}ms`);
        }
      }
    } catch (error) {
      uiLogger.warn(`Failed to get ${role} connection stats:`, error);
    }
  };

  const hostFileTransfer = useFileTransfer({
    role: 'host',
    debug: true,
    iceServers,
    logger: createLogger('Host', uiLogger),
    onConnectionStateChange: (s: RTCPeerConnectionState) => {
      if (s === 'connected' || s === 'failed') {
        uiLogger.log(`Host connection: ${s}`);
      }
    },
    onChannelOpen: () => uiLogger.log('Host data channel ready'),
    onChannelClose: () => uiLogger.log('Host data channel closed'),
    onChannelMessage: (d: string | ArrayBuffer | Blob) => {
      // Only log non-binary messages to reduce noise
      if (typeof d === 'string' && d.length < 200) {
        uiLogger.log(`Host received: ${d}`);
      }
    },
    onIceConnectionStateChange: (state: RTCIceConnectionState) => {
      if (state === 'connected' || state === 'failed') {
        uiLogger.log(`Host ICE: ${state}`);
        if (state === 'connected') {
          // Get actual connection stats when connected
          setTimeout(() => updateConnectionStats('host'), 1000);
        }
      }
    },
    onIceCandidate: (candidate: RTCIceCandidateInit | null, connectionType: string) => {
      if (candidate) {
        setConnectionTypes(prev => ({ ...prev, host: connectionType }));
      }
    },
    onProgress: (progress) => {
      // Only log milestone progress updates (10%, 30%, 50%, 70%, 90%, 100%)
      const milestones = [10, 30, 50, 70, 90, 100];
      if (milestones.includes(progress.percentage)) {
        uiLogger.log(`Host progress: ${progress.percentage}% (${formatFileSize(progress.bytesTransferred)}/${formatFileSize(progress.fileSize)})`);
      }
    },
    onComplete: (file, fileName) => uiLogger.log(`Host transfer completed: ${fileName}`),
    onError: (error) => {
      uiLogger.error(`Host error: ${error}`);
    },
    onConnectionRejected: (reason: string, connectedClientId?: string) => {
      uiLogger.error(`🚫 Host rejected client: ${reason}${connectedClientId ? ` (Currently connected to ${connectedClientId})` : ''}`);
    },
    onConnectionFailed: (error: Error) => {
      uiLogger.error(`❌ Host connection failed: ${error.message}`);
    }
  });

  const clientFileTransfer = useFileTransfer({
    role: 'client',
    hostId: hostIdInput || undefined,
    debug: true,
    iceServers,
    logger: createLogger('Client', uiLogger),
    onConnectionStateChange: (s: RTCPeerConnectionState) => {
      if (s === 'connected' || s === 'failed') {
        uiLogger.log(`Client connection: ${s}`);
      }
    },
    onChannelOpen: () => uiLogger.log('Client data channel ready'),
    onChannelClose: () => uiLogger.log('Client data channel closed'),
    onChannelMessage: (d: string | ArrayBuffer | Blob) => {
      // Only log non-binary messages to reduce noise
      if (typeof d === 'string' && d.length < 200) {
        uiLogger.log(`Client received: ${d}`);
      }
    },
    onIceConnectionStateChange: (state: RTCIceConnectionState) => {
      if (state === 'connected' || state === 'failed') {
        uiLogger.log(`Client ICE: ${state}`);
        if (state === 'connected') {
          // Get actual connection stats when connected
          setTimeout(() => updateConnectionStats('client'), 1000);
        }
      }
    },
    onIceCandidate: (candidate: RTCIceCandidateInit | null, connectionType: string) => {
      if (candidate) {
        setConnectionTypes(prev => ({ ...prev, client: connectionType }));
      }
    },
    onProgress: (progress) => {
      // Only log milestone progress updates (10%, 30%, 50%, 70%, 90%, 100%)
      const milestones = [10, 30, 50, 70, 90, 100];
      if (milestones.includes(progress.percentage)) {
        uiLogger.log(`Client progress: ${progress.percentage}% (${formatFileSize(progress.bytesTransferred)}/${formatFileSize(progress.fileSize)})`);
      }
    },
    onComplete: (file, fileName) => uiLogger.log(`Client transfer completed: ${fileName}`),
    onError: (error) => {
      uiLogger.error(`Client error: ${error}`);
    },
    onConnectionRejected: (reason: string, connectedClientId?: string) => {
      uiLogger.error(`❌ Client connection rejected: ${reason}${connectedClientId ? ` (Host is connected to ${connectedClientId})` : ''}`);
    },
    onConnectionFailed: (error: Error) => {
      uiLogger.error(`❌ Client connection failed: ${error.message}`);
    }
  });

  const activeFileTransfer = activeTab === 'host' ? hostFileTransfer : clientFileTransfer;


  const createHost = async () => {
    if (isCreatingHost) return;
    
    setIsCreatingHost(true);
    try {
      await hostFileTransfer.createOrEnsureConnection();
      uiLogger.log('Host created successfully');
    } catch (error) {
      console.error('[Demo] Failed to create host:', error);
      uiLogger.error(`Error creating host: ${error}`);
    } finally {
      setIsCreatingHost(false);
    }
  };

  const disconnectHost = () => {
    try {
      hostFileTransfer.disconnect();
      uiLogger.log('Host disconnected');
    } catch (error) {
      console.error('Error disconnecting host:', error);
      uiLogger.error(`Error disconnecting host: ${error}`);
    }
  };

  const disconnectClient = () => {
    try {
      clientFileTransfer.disconnect();
      uiLogger.log('Client disconnected');
    } catch (error) {
      console.error('Error disconnecting client:', error);
      uiLogger.error(`Error disconnecting client: ${error}`);
    }
  };

  const joinAsClient = async () => {
    if (!hostIdInput || isJoiningClient) return;
    
    setIsJoiningClient(true);
    try {
      await clientFileTransfer.createOrEnsureConnection();
      uiLogger.log('Client joined successfully');
    } catch (error) {
      console.error('[Demo] Failed to join as client:', error);
      uiLogger.error(`Error joining as client: ${error}`);
    } finally {
      setIsJoiningClient(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      uiLogger.log(`Selected file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    }
  };

  const sendFile = async () => {
    if (!selectedFile || activeTab !== 'host') return;
    
    try {
      uiLogger.log(`Starting file transfer: ${selectedFile.name}`);
      await hostFileTransfer.sendFile(selectedFile);
      uiLogger.log(`File transfer completed: ${selectedFile.name}`);
    } catch (error) {
      console.error('Error sending file:', error);
      uiLogger.error(`Error sending file: ${error}`);
    }
  };

  const downloadReceivedFile = () => {
    if (activeTab === 'client') {
      // For client, check if file was saved to disk or needs download
      if (clientFileTransfer.receivedFile) {
        // Fallback: Download the blob
        const fileName = clientFileTransfer.receivedFileName || 'received_file';
        const url = URL.createObjectURL(clientFileTransfer.receivedFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        uiLogger.log(`Downloaded received file: ${fileName}`);
        return;
      }
    }
    
    // For host, download the blob
    const fileToDownload = hostFileTransfer.receivedFile;
    const fileName = hostFileTransfer.receivedFileName;
    
    if (!fileToDownload) return;
    
    const finalFileName = fileName || 'received_file';
    const url = URL.createObjectURL(fileToDownload);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    uiLogger.log(`Downloaded received file: ${finalFileName}`);
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

  // Calculate transfer rates
  useEffect(() => {
    const calculateRate = (progress: any) => {
      if (!progress || progress.status !== 'transferring') return 0;
      
      // Simple rate calculation based on progress
      const now = Date.now();
      const timeElapsed = (now - (progress.startTime || now)) / 1000;
      return timeElapsed > 0 ? progress.bytesTransferred / timeElapsed : 0;
    };

    const hostRate = calculateRate(hostFileTransfer.transferProgress);
    const clientRate = calculateRate(clientFileTransfer.transferProgress);
    
    setTransferRates({ host: hostRate, client: clientRate });
  }, [
    hostFileTransfer.transferProgress?.bytesTransferred,
    hostFileTransfer.transferProgress?.status,
    hostFileTransfer.transferProgress?.startTime,
    clientFileTransfer.transferProgress?.bytesTransferred,
    clientFileTransfer.transferProgress?.status,
    clientFileTransfer.transferProgress?.startTime
  ]);

  // Log ACK progress updates
  useEffect(() => {
    if (hostFileTransfer.ackProgress) {
      // Log all ACK progress updates (the smart frequency is handled in the hook)
      uiLogger.log(`Host ACK: ${hostFileTransfer.ackProgress.percentage}% (${formatFileSize(hostFileTransfer.ackProgress.bytesAcknowledged)}/${formatFileSize(hostFileTransfer.ackProgress.fileSize)})`);
    }
  }, [
    hostFileTransfer.ackProgress?.percentage,
    hostFileTransfer.ackProgress?.bytesAcknowledged,
    hostFileTransfer.ackProgress?.fileSize,
    hostFileTransfer.ackProgress?.status
  ]);

  return (
    <div className="h-screen bg-background p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-foreground">File Transfer Demo</h1>
        
        {/* Connection Type Indicator */}
        <div className="bg-card rounded-lg shadow mb-4 border p-4">
          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">Connection Method</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Host Connection */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Host</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Candidate:</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    connectionTypes.host.includes('TURN') ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' :
                    connectionTypes.host.includes('Direct') ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' :
                    connectionTypes.host.includes('Local') ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' :
                    connectionTypes.host.includes('STUN') ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
                  }`}>
                    {connectionTypes.host}
                  </span>
                </div>
                {actualConnectionStats.host && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Actual:</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        actualConnectionStats.host.connectionType === 'TURN' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' :
                        actualConnectionStats.host.connectionType === 'DIRECT' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' :
                        actualConnectionStats.host.connectionType === 'LOCAL' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
                      }`}>
                        {actualConnectionStats.host.connectionType}
                      </span>
                    </div>
                    {actualConnectionStats.host.rtt && (
                      <div className="text-xs text-muted-foreground">
                        RTT: {actualConnectionStats.host.rtt.toFixed(0)}ms
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground truncate">
                      {actualConnectionStats.host.localCandidate} ↔ {actualConnectionStats.host.remoteCandidate}
                    </div>
                  </div>
                )}
              </div>

              {/* Client Connection */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Client</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Candidate:</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    connectionTypes.client.includes('TURN') ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' :
                    connectionTypes.client.includes('Direct') ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' :
                    connectionTypes.client.includes('Local') ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' :
                    connectionTypes.client.includes('STUN') ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
                  }`}>
                    {connectionTypes.client}
                  </span>
                </div>
                {actualConnectionStats.client && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Actual:</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        actualConnectionStats.client.connectionType === 'TURN' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' :
                        actualConnectionStats.client.connectionType === 'DIRECT' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' :
                        actualConnectionStats.client.connectionType === 'LOCAL' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
                      }`}>
                        {actualConnectionStats.client.connectionType}
                      </span>
                    </div>
                    {actualConnectionStats.client.rtt && (
                      <div className="text-xs text-muted-foreground">
                        RTT: {actualConnectionStats.client.rtt.toFixed(0)}ms
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground truncate">
                      {actualConnectionStats.client.localCandidate} ↔ {actualConnectionStats.client.remoteCandidate}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow mb-4 border">
          <div className="flex border-b border-border">
            <button 
              onClick={() => setActiveTab('host')} 
              className={`flex-1 px-4 py-3 ${activeTab === 'host' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              Host
            </button>
            <button 
              onClick={() => setActiveTab('client')} 
              className={`flex-1 px-4 py-3 ${activeTab === 'client' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              Client
            </button>
          </div>

          <div className="p-6 space-y-4">
            {activeTab === 'host' ? (
              <div className="space-y-4">
                {hostFileTransfer.peerId ? (
                  <button 
                    onClick={disconnectHost}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Disconnect Host
                  </button>
                ) : (
                  <button 
                    onClick={createHost} 
                    disabled={isCreatingHost}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isCreatingHost && (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {isCreatingHost ? 'Creating...' : 'Create Host'}
                  </button>
                )}
                
                <div className="text-sm text-muted-foreground">
                  Host ID: <span className="font-mono text-foreground">{hostFileTransfer.peerId || 'n/a'}</span>
                </div>

                {hostFileTransfer.connectedClient && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-foreground">
                      Connected Client
                    </div>
                    <div className="p-2 bg-muted rounded text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{hostFileTransfer.connectedClient}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          hostFileTransfer.connectionState === 'connected' ? 'bg-green-100 text-green-800' :
                          hostFileTransfer.connectionState === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {hostFileTransfer.connectionState}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          hostFileTransfer.dataChannelState === 'open' ? 'bg-green-100 text-green-800' :
                          hostFileTransfer.dataChannelState === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {hostFileTransfer.dataChannelState || 'no channel'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Select File to Send
                    </label>
                    <input
                      type="file"
                      onChange={handleFileSelect}
                      className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                    />
                  </div>

                  {selectedFile && (
                    <div className="p-3 bg-muted rounded">
                      <div className="text-sm text-foreground">
                        <strong>File:</strong> {selectedFile.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <strong>Size:</strong> {formatFileSize(selectedFile.size)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <strong>Type:</strong> {selectedFile.type || 'Unknown'}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={sendFile}
                    disabled={!selectedFile || !hostFileTransfer.peerId || hostFileTransfer.isTransferring}
                    className="w-full px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {hostFileTransfer.isTransferring ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending...
                      </>
                    ) : (
                      'Send File'
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {clientFileTransfer.peerId ? (
                  <button 
                    onClick={disconnectClient}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Disconnect Client
                  </button>
                ) : (
                  <>
                    <input 
                      value={hostIdInput} 
                      onChange={(e) => setHostIdInput(e.target.value)} 
                      placeholder="Enter Host ID" 
                      className="px-3 py-2 border border-border rounded w-full text-foreground bg-background" 
                    />
                    <button 
                      onClick={joinAsClient} 
                      disabled={!hostIdInput || isJoiningClient} 
                      className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isJoiningClient && (
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {isJoiningClient ? 'Joining...' : 'Join Host'}
                    </button>
                  </>
                )}
                
                <div className="text-sm text-muted-foreground">
                  Client ID: <span className="font-mono text-foreground">{clientFileTransfer.peerId || 'n/a'}</span>
                </div>

                <div className="text-sm text-muted-foreground">
                  Status: {(clientFileTransfer.receivedFile || clientFileTransfer.receivedFileName) ? 'File received!' : 'Waiting for file...'}
                </div>
                
                {(clientFileTransfer.receivedFile || clientFileTransfer.receivedFileName) && (
                  <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                    <div className="text-green-800 dark:text-green-200 font-medium text-sm">
                      ✅ File Received: {clientFileTransfer.receivedFileName}
                    </div>
                    {clientFileTransfer.receivedFile && (
                      <div className="text-green-700 dark:text-green-300 text-xs mt-1">
                        Size: {formatFileSize(clientFileTransfer.receivedFile.size)}
                      </div>
                    )}
                    <div className="text-green-700 dark:text-green-300 text-xs mt-1">
                      &apos;Location: Available in memory (download to save)&apos;
                    </div>
                  </div>
                )}
                
                <button
                  onClick={() => {
                    clientFileTransfer.clearTransfer();
                    uiLogger.log('Cleared transfer state');
                  }}
                  className="px-3 py-1 bg-muted text-muted-foreground rounded hover:bg-muted/80 text-sm"
                >
                  Clear Transfer
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Debug Info */}
        {errorHistory.length > 0 && (
          <div className="bg-card rounded-lg shadow p-4 mb-4 border">
            <h2 className="text-lg font-semibold mb-4 text-foreground">🛡️ Error History</h2>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {errorHistory.slice(-5).map((error, index) => (
                <div key={index} className="p-2 bg-muted rounded text-sm">
                  <div className="text-foreground">{error}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transfer Progress */}
        <div className="bg-card rounded-lg shadow p-6 mb-4 border min-h-[200px]">
          <h2 className="text-lg font-semibold mb-4 text-foreground">🚀 Stream Transfer Progress</h2>
          <div className="space-y-6">
              {(hostFileTransfer.transferProgress || hostFileTransfer.isTransferring) ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-foreground">📤 Host Transfer</div>
                    <div className="min-w-[100px] h-4 flex items-center">
                      {hostFileTransfer.transferProgress?.status === 'transferring' && (
                        <div className="flex items-center gap-1 text-xs text-primary">
                          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Streaming...
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">File</div>
                      <div className="font-medium text-foreground truncate">
                        {hostFileTransfer.transferProgress?.fileName || selectedFile?.name || 'Unknown'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Size</div>
                      <div className="font-mono text-foreground w-[120px] inline-block text-left tabular-nums">
                        {hostFileTransfer.transferProgress ? formatFileSize(hostFileTransfer.transferProgress.fileSize) : 
                         selectedFile ? formatFileSize(selectedFile.size) : '0.00 MB'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Transferred</div>
                      <div className="font-mono text-foreground w-[200px] inline-block text-left tabular-nums min-h-[1.25rem]">
                        {hostFileTransfer.transferProgress ? 
                          `${formatFileSize(hostFileTransfer.transferProgress.bytesTransferred)} / ${formatFileSize(hostFileTransfer.transferProgress.fileSize)}` :
                          '0.00 MB / 0.00 MB'}
                      </div>
                      <div className="h-4 flex items-center">
                        {hostFileTransfer.transferProgress?.status === 'transferring' && transferRates.host > 0 ? (
                          <div className="text-xs text-muted-foreground font-mono w-16 text-right tabular-nums">
                            {formatTransferRate(transferRates.host)}
                          </div>
                        ) : (
                          <div className="w-16"></div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-foreground">Progress</span>
                      <span className="text-sm font-mono text-muted-foreground w-[80px] text-right inline-block">
                        {hostFileTransfer.transferProgress ? (
                          hostFileTransfer.transferProgress.status === 'transferring' && hostFileTransfer.transferProgress.percentage >= 95 ? (
                            'Finalizing'
                          ) : (
                            `${hostFileTransfer.transferProgress.percentage}%`
                          )
                        ) : (
                          'Starting...'
                        )}
                      </span>
                    </div>
                    
                    <div className="relative w-full bg-muted rounded-full h-2 overflow-hidden transition-none">
                      {hostFileTransfer.transferProgress ? (
                        <div 
                          className={`h-2 rounded-full transition-[width] duration-300 ease-out ${
                            hostFileTransfer.transferProgress.status === 'completed' ? 'bg-green-500' :
                            hostFileTransfer.transferProgress.status === 'error' ? 'bg-destructive' :
                            'bg-primary'
                          }`}
                          style={{ 
                            width: `${Math.min(100, Math.max(0, hostFileTransfer.transferProgress.percentage))}%`
                          }}
                        />
                      ) : (
                        <div className="h-2 rounded-full bg-primary/20 animate-pulse" style={{ width: '100%' }} />
                      )}
                    </div>
                  </div>

                  <div className={`text-sm min-h-[2rem] ${
                    hostFileTransfer.transferProgress?.status === 'completed' ? 'text-green-600' :
                    hostFileTransfer.transferProgress?.status === 'error' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    <div className="flex items-center gap-2">
                      <strong>Status:</strong>
                      <span className="min-w-[120px]">
                        {hostFileTransfer.transferProgress ? (
                          hostFileTransfer.transferProgress.status === 'transferring' && hostFileTransfer.transferProgress.percentage >= 95 ? 
                            'Finalizing...' :
                            hostFileTransfer.transferProgress.status
                        ) : (
                          hostFileTransfer.isTransferring ? 'transferring' : 'idle'
                        )}
                      </span>
                    </div>
                    {hostFileTransfer.transferProgress?.error && (
                      <div className="text-red-600 mt-1">Error: {hostFileTransfer.transferProgress.error}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <div className="text-sm">No active host transfer</div>
                </div>
              )}

              {/* ACK Progress Bar for Host */}
              {hostFileTransfer.ackProgress && (
                <div className="space-y-4 mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-blue-700 dark:text-blue-300">📡 Host ACK Progress (Receiver Confirmation)</div>
                    <div className="min-w-[100px] h-4 flex items-center">
                      {hostFileTransfer.ackProgress.status === 'acknowledging' && (
                        <div className="flex items-center gap-1 text-xs text-blue-600">
                          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          <span>Receiving ACKs</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ACK Progress Bar */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">ACK Progress</span>
                      <span className="text-sm font-mono text-blue-600 dark:text-blue-400 w-[80px] text-right inline-block">
                        {hostFileTransfer.ackProgress.status === 'waiting' ? 'Waiting...' : `${hostFileTransfer.ackProgress.percentage}%`}
                      </span>
                    </div>
                    
                    <div className="relative w-full bg-blue-100 dark:bg-blue-900/30 rounded-full h-3 overflow-hidden transition-none">
                      <div 
                        className={`h-3 rounded-full transition-[width] duration-300 ease-out ${
                          hostFileTransfer.ackProgress.status === 'completed' ? 'bg-green-500' :
                          hostFileTransfer.ackProgress.status === 'error' ? 'bg-red-500' :
                          hostFileTransfer.ackProgress.status === 'waiting' ? 'bg-yellow-500' :
                          'bg-blue-500'
                        }`}
                        style={{ 
                          width: `${Math.min(100, Math.max(0, hostFileTransfer.ackProgress.percentage))}%`
                        }}
                      />
                    </div>
                  </div>

                  <div className="text-sm text-blue-600 dark:text-blue-400">
                    <div className="flex gap-2">
                      <strong>Status:</strong>
                      <span className="min-w-[120px]">
                        {hostFileTransfer.ackProgress.status === 'waiting' ? 'Waiting for receiver...' :
                         hostFileTransfer.ackProgress.status === 'acknowledging' ? 'Receiving confirmations' :
                         hostFileTransfer.ackProgress.status}
                      </span>
                    </div>
                    <div className="text-xs text-blue-500 dark:text-blue-500 mt-1">
                      Acknowledged: {formatFileSize(hostFileTransfer.ackProgress.bytesAcknowledged)} / {formatFileSize(hostFileTransfer.ackProgress.fileSize)}
                    </div>
                  </div>
                </div>
              )}
              
              {(clientFileTransfer.transferProgress || clientFileTransfer.isTransferring) ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-foreground">📥 Client Transfer</div>
                    <div className="min-w-[100px] h-4 flex items-center">
                      {(clientFileTransfer.transferProgress?.status === 'transferring' || clientFileTransfer.isTransferring) && (
                        <div className="flex items-center gap-1 text-xs text-primary">
                          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Receiving...
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">File</div>
                      <div className="font-medium text-foreground truncate">
                        {clientFileTransfer.transferProgress?.fileName || clientFileTransfer.receivedFileName || 'Unknown'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Size</div>
                      <div className="font-mono text-foreground w-[120px] inline-block text-left tabular-nums">
                        {clientFileTransfer.transferProgress ? formatFileSize(clientFileTransfer.transferProgress.fileSize) : '0.00 MB'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Received</div>
                      <div className="font-mono text-foreground w-[200px] inline-block text-left tabular-nums min-h-[1.25rem]">
                        {clientFileTransfer.transferProgress ? 
                          `${formatFileSize(clientFileTransfer.transferProgress.bytesTransferred)} / ${formatFileSize(clientFileTransfer.transferProgress.fileSize)}` :
                          '0.00 MB / 0.00 MB'}
                      </div>
                      <div className="h-4 flex items-center">
                        {clientFileTransfer.transferProgress?.status === 'transferring' && transferRates.client > 0 ? (
                          <div className="text-xs text-muted-foreground font-mono w-16 text-right tabular-nums">
                            {formatTransferRate(transferRates.client)}
                          </div>
                        ) : (
                          <div className="w-16"></div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-foreground">Progress</span>
                      <span className="text-sm font-mono text-muted-foreground w-[80px] text-right inline-block">
                        {clientFileTransfer.transferProgress ? (
                          clientFileTransfer.transferProgress.status === 'transferring' && clientFileTransfer.transferProgress.percentage >= 95 ? (
                            'Finalizing'
                          ) : (
                            `${clientFileTransfer.transferProgress.percentage}%`
                          )
                        ) : (
                          'Starting...'
                        )}
                      </span>
                    </div>
                    
                    <div className="relative w-full bg-muted rounded-full h-2 overflow-hidden transition-none">
                      {clientFileTransfer.transferProgress ? (
                        <div 
                          className={`h-2 rounded-full transition-[width] duration-300 ease-out ${
                            clientFileTransfer.transferProgress.status === 'completed' ? 'bg-green-500' :
                            clientFileTransfer.transferProgress.status === 'error' ? 'bg-destructive' :
                            'bg-primary'
                          }`}
                          style={{ 
                            width: `${Math.min(100, Math.max(0, clientFileTransfer.transferProgress.percentage))}%`
                          }}
                        />
                      ) : (
                        <div className="h-2 rounded-full bg-primary/20 animate-pulse" style={{ width: '100%' }} />
                      )}
                    </div>
                  </div>

                  <div className={`text-sm min-h-[2rem] ${
                    clientFileTransfer.transferProgress?.status === 'completed' ? 'text-green-600' :
                    clientFileTransfer.transferProgress?.status === 'error' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    <div className="flex items-center gap-2">
                      <strong>Status:</strong>
                      <span className="min-w-[120px]">
                        {clientFileTransfer.transferProgress ? (
                          clientFileTransfer.transferProgress.status === 'transferring' && clientFileTransfer.transferProgress.percentage >= 95 ? 
                            'Finalizing...' :
                            clientFileTransfer.transferProgress.status
                        ) : (
                          clientFileTransfer.isTransferring ? 'receiving' : 'idle'
                        )}
                      </span>
                    </div>
                    {clientFileTransfer.transferProgress?.error && (
                      <div className="text-red-600 mt-1">Error: {clientFileTransfer.transferProgress.error}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <div className="text-sm">No active client transfer</div>
                </div>
              )}
            </div>
          </div>

        {/* Received File */}
        {((activeTab === 'client' && (clientFileTransfer.receivedFile || clientFileTransfer.receivedFileName)) || (activeTab === 'host' && hostFileTransfer.receivedFile)) && (
          <div className="bg-card rounded-lg shadow p-6 mb-4 border">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Received File</h2>
            <div className="space-y-3">
              <div className="text-sm text-foreground">
                <strong>File:</strong> {activeTab === 'client' ? clientFileTransfer.receivedFileName : hostFileTransfer.receivedFileName}
              </div>
              {(activeTab === 'client' ? clientFileTransfer.receivedFile : hostFileTransfer.receivedFile) && (
                <div className="text-sm text-foreground">
                  <strong>Size:</strong> {formatFileSize((activeTab === 'client' ? clientFileTransfer.receivedFile : hostFileTransfer.receivedFile)!.size)}
                </div>
              )}
              {(activeTab === 'client' ? clientFileTransfer.receivedFile : hostFileTransfer.receivedFile) && (
                <div className="text-sm text-foreground">
                  <strong>Type:</strong> {(activeTab === 'client' ? clientFileTransfer.receivedFile : hostFileTransfer.receivedFile)!.type || 'Unknown'}
                </div>
              )}
              <button
                onClick={downloadReceivedFile}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download File
              </button>
            </div>
          </div>
        )}

        {/* Connection Status */}
        <div className="bg-card rounded-lg shadow p-6 mb-4 border min-h-[180px]">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Connection Status</h2>
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-foreground">{activeTab === 'host' ? 'Host' : 'Client'} Connection</div>
              <div className="text-sm text-muted-foreground">
                PC: {activeFileTransfer.connectionState} | DC: {activeFileTransfer.dataChannelState || 'n/a'}
              </div>
              <div className="text-sm text-muted-foreground">
                ID: {activeFileTransfer.peerId || 'n/a'}
              </div>
              <div className="text-sm text-muted-foreground">
                Candidate Type: {activeTab === 'host' ? connectionTypes.host : connectionTypes.client}
              </div>
              {((activeTab === 'host' && actualConnectionStats.host) || (activeTab === 'client' && actualConnectionStats.client)) && (
                <div className="text-sm text-muted-foreground">
                  Actual Type: {activeTab === 'host' ? actualConnectionStats.host?.connectionType : actualConnectionStats.client?.connectionType}
                  {activeTab === 'host' && actualConnectionStats.host?.rtt && (
                    <span className="ml-2">(RTT: {actualConnectionStats.host.rtt.toFixed(0)}ms)</span>
                  )}
                  {activeTab === 'client' && actualConnectionStats.client?.rtt && (
                    <span className="ml-2">(RTT: {actualConnectionStats.client.rtt.toFixed(0)}ms)</span>
                  )}
                </div>
              )}
              {activeTab === 'host' ? (
                <div className="text-sm text-muted-foreground">
                  Connected Client: {hostFileTransfer.connectedClient ? 'Yes' : 'No'}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  File Status: {clientFileTransfer.receivedFile ? 'Received' : 'None'}
                </div>
              )}
            </div>
          </div>
        </div>


        {/* Logs */}
        <div className="bg-card rounded-lg shadow p-6 border min-h-[400px]">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Logs</h2>
          <div className="h-80 overflow-y-auto border border-border rounded p-3 space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="text-sm text-foreground">{log}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
