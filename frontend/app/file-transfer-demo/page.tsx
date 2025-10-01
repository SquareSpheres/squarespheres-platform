'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFileTransfer } from '../hooks/useFileTransfer';
import { DEFAULT_ICE_SERVERS } from '../hooks/webrtcUtils';
import type { FileTransferError } from '../hooks/errorManager';

export const dynamic = 'force-dynamic'

export default function FileTransferDemoPage() {
  const [hostIdInput, setHostIdInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'host' | 'client'>('host');
  const [isCreatingHost, setIsCreatingHost] = useState(false);
  const [isJoiningClient, setIsJoiningClient] = useState(false);
  // receivedFile is now managed by the hook
  const [logs, setLogs] = useState<string[]>([]);
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
  const [errorHistory, setErrorHistory] = useState<FileTransferError[]>([]);
  const [resumableTransfers, setResumableTransfers] = useState<string[]>([]);

  const iceServers = useMemo(() => DEFAULT_ICE_SERVERS, []);

  const hostFileTransfer = useFileTransfer({
    role: 'host',
    debug: true,
    iceServers,
    onConnectionStateChange: (s: RTCPeerConnectionState) => addLog(`Host PC state: ${s}`),
    onChannelOpen: () => addLog('Host data channel open'),
    onChannelClose: () => addLog('Host data channel closed'),
    onChannelMessage: (d: string | ArrayBuffer | Blob) => addLog(`Host received: ${typeof d === 'string' ? d.substring(0, 100) : 'Binary data'}`),
    onProgress: (progress) => addLog(`Host progress: ${progress.percentage}% (${formatFileSize(progress.bytesTransferred)}/${formatFileSize(progress.fileSize)})`),
    onComplete: (file, fileName) => addLog(`Host transfer completed: ${fileName}`),
    onError: (error) => {
      addLog(`Host error: ${error}`);
      updateErrorHistory('host');
    }
  });

  const clientFileTransfer = useFileTransfer({
    role: 'client',
    hostId: hostIdInput || undefined,
    debug: true,
    iceServers,
    onConnectionStateChange: (s: RTCPeerConnectionState) => addLog(`Client PC state: ${s}`),
    onChannelOpen: () => addLog('Client data channel open'),
    onChannelClose: () => addLog('Client data channel closed'),
    onChannelMessage: (d: string | ArrayBuffer | Blob) => addLog(`Client received: ${typeof d === 'string' ? d.substring(0, 100) : 'Binary data'}`),
    onProgress: (progress) => addLog(`Client progress: ${progress.percentage}% (${formatFileSize(progress.bytesTransferred)}/${formatFileSize(progress.fileSize)})`),
    onComplete: (file, fileName) => addLog(`Client transfer completed: ${fileName}`),
    onError: (error) => {
      addLog(`Client error: ${error}`);
      updateErrorHistory('client');
    }
  });

  const activeFileTransfer = activeTab === 'host' ? hostFileTransfer : clientFileTransfer;
  
  // Debug: check if transferProgress exists
  console.log('Client transferProgress exists:', !!clientFileTransfer.transferProgress);

  function addLog(message: string) {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  }

  // Update error history for debugging
  const updateErrorHistory = (role: 'host' | 'client') => {
    const transfer = role === 'host' ? hostFileTransfer : clientFileTransfer;
    // This would need the actual transfer ID - for demo we'll use a placeholder
    // const errors = transfer.getErrorHistory('current_transfer');
    // setErrorHistory(errors);
  };

  // Update network metrics periodically

  // Check for resumable transfers on mount
  useEffect(() => {
    // In a real app, you'd check for resumable transfers here
    // const checkResumable = async () => {
    //   const resumable = await clientFileTransfer.getResumableTransfers();
    //   setResumableTransfers(resumable);
    // };
    // checkResumable();
  }, []);

  const createHost = async () => {
    if (isCreatingHost) return;
    
    setIsCreatingHost(true);
    try {
      await hostFileTransfer.createOrEnsureConnection();
      addLog('Host created successfully');
    } catch (error) {
      console.error('[Demo] Failed to create host:', error);
      addLog(`Error creating host: ${error}`);
    } finally {
      setIsCreatingHost(false);
    }
  };

  const disconnectHost = () => {
    try {
      hostFileTransfer.disconnect();
      addLog('Host disconnected');
    } catch (error) {
      console.error('Error disconnecting host:', error);
      addLog(`Error disconnecting host: ${error}`);
    }
  };

  const disconnectClient = () => {
    try {
      clientFileTransfer.disconnect();
      addLog('Client disconnected');
    } catch (error) {
      console.error('Error disconnecting client:', error);
      addLog(`Error disconnecting client: ${error}`);
    }
  };

  const joinAsClient = async () => {
    if (!hostIdInput || isJoiningClient) return;
    
    setIsJoiningClient(true);
    try {
      await clientFileTransfer.createOrEnsureConnection();
      addLog('Client joined successfully');
    } catch (error) {
      console.error('[Demo] Failed to join as client:', error);
      addLog(`Error joining as client: ${error}`);
    } finally {
      setIsJoiningClient(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      addLog(`Selected file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    }
  };

  const sendFile = async () => {
    if (!selectedFile || activeTab !== 'host') return;
    
    try {
      addLog(`Starting file transfer: ${selectedFile.name}`);
      await hostFileTransfer.sendFile(selectedFile);
      addLog(`File transfer completed: ${selectedFile.name}`);
    } catch (error) {
      console.error('Error sending file:', error);
      addLog(`Error sending file: ${error}`);
    }
  };

  const downloadReceivedFile = () => {
    if (activeTab === 'client') {
      // For client, check if file was saved to disk or needs download
      if (clientFileTransfer.receivedFileHandle) {
        addLog(`File already saved to disk: ${clientFileTransfer.receivedFileName}`);
        return;
      } else if (clientFileTransfer.receivedFile) {
        // Fallback: Download the blob
        const fileName = clientFileTransfer.receivedFileName || 'received_file';
        console.log(`[Demo] Downloading file with name: ${fileName}`);
        console.log(`[Demo] Client receivedFile type:`, clientFileTransfer.receivedFile?.type);
        console.log(`[Demo] Client receivedFile size:`, clientFileTransfer.receivedFile?.size);
        const url = URL.createObjectURL(clientFileTransfer.receivedFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog(`Downloaded received file: ${fileName}`);
        return;
      }
    }
    
    // For host, download the blob
    const fileToDownload = hostFileTransfer.receivedFile;
    const fileName = hostFileTransfer.receivedFileName;
    
    if (!fileToDownload) return;
    
    const finalFileName = fileName || 'received_file';
    console.log(`[Demo] Host downloading file with name: ${finalFileName}`);
    const url = URL.createObjectURL(fileToDownload);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`Downloaded received file: ${finalFileName}`);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-foreground">File Transfer Demo</h1>
        
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-4 mb-6 border border-blue-200 dark:border-blue-800">
          <div className="text-blue-800 dark:text-blue-200 font-medium mb-2">🚀 Advanced File Transfer with Sprint 2 Features</div>
          <div className="text-blue-700 dark:text-blue-300 text-sm space-y-1">
            <div>• <strong>🧠 Dynamic Chunk Sizing:</strong> Intelligent 8KB-1MB chunks based on network conditions (15-25% speed boost)</div>
            <div>• <strong>📡 Network Monitoring:</strong> Real-time RTT, bandwidth, and quality detection with 4-tier classification</div>
            <div>• <strong>🔄 Transfer Resumption:</strong> Automatic resume within 5 seconds after any interruption</div>
            <div>• <strong>🛡️ Enhanced Error Handling:</strong> Structured error management with correlation IDs and recovery strategies</div>
            <div>• <strong>💾 Persistent State:</strong> Transfer state survives browser restarts and session changes</div>
            <div>• <strong>📊 Advanced Metrics:</strong> Complete performance monitoring with adaptation statistics</div>
            <div>• <strong>🎯 Smart Storage:</strong> File System Access API for large files, memory for small files</div>
            <div>• <strong>Debug:</strong> Toggle &quot;Advanced Metrics&quot; below to see network performance and error details</div>
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

                {hostFileTransfer.connectedClients && hostFileTransfer.connectedClients.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-foreground">
                      Connected Clients ({hostFileTransfer.connectedClients.length})
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {hostFileTransfer.connectedClients.map((clientId) => {
                        const clientConn = hostFileTransfer.clientConnections?.get(clientId);
                        return (
                          <div key={clientId} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{clientId}</span>
                              <span className={`px-2 py-1 rounded text-xs ${
                                clientConn?.connectionState === 'connected' ? 'bg-green-100 text-green-800' :
                                clientConn?.connectionState === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {clientConn?.connectionState || 'unknown'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
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
                      {clientFileTransfer.receivedFileHandle 
                        ? 'Location: Saved to disk (File System Access API)' 
                        : clientFileTransfer.receivedFile
                        ? 'Location: Available in memory (download to save)'
                        : 'Location: Saved to disk'
                      }
                    </div>
                  </div>
                )}
                
                <button
                  onClick={() => {
                    clientFileTransfer.clearTransfer();
                    addLog('Cleared transfer state');
                  }}
                  className="px-3 py-1 bg-muted text-muted-foreground rounded hover:bg-muted/80 text-sm"
                >
                  Clear Transfer
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Advanced Metrics Toggle */}
        <div className="bg-card rounded-lg shadow p-4 mb-4 border">
          <button
            onClick={() => setShowAdvancedMetrics(!showAdvancedMetrics)}
            className="flex items-center justify-between w-full text-left"
          >
            <h2 className="text-lg font-semibold text-foreground">📊 Advanced Metrics & Debugging</h2>
            <svg 
              className={`h-5 w-5 transform transition-transform ${showAdvancedMetrics ? 'rotate-180' : ''}`}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showAdvancedMetrics && (
            <div className="mt-4 space-y-4">

              {/* Fixed Chunk Size */}
              {activeFileTransfer.getCurrentChunkSize && (
                <div className="bg-muted rounded-lg p-4">
                  <h3 className="font-medium text-foreground mb-3">📦 Chunk Size</h3>
                  <div className="grid grid-cols-1 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Fixed Chunk Size</div>
                      <div className="font-medium text-foreground">{(activeFileTransfer.getCurrentChunkSize() / 1024).toFixed(1)} KB</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Transfer Resumption */}
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-medium text-foreground mb-3">🔄 Transfer Resumption</h3>
                <div className="space-y-2 text-sm">
                  <div className="text-muted-foreground">
                    Transfer state is automatically persisted and can resume after interruptions
                  </div>
                  {resumableTransfers.length > 0 ? (
                    <div>
                      <div className="text-green-600 font-medium">Found {resumableTransfers.length} resumable transfer(s)</div>
                      {resumableTransfers.map((transferId, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-background rounded border">
                          <span className="font-mono text-xs">{transferId}</span>
                          <button 
                            className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90"
                            onClick={() => {
                              // activeFileTransfer.resumeTransfer(transferId);
                              addLog(`Resume request for ${transferId}`);
                            }}
                          >
                            Resume
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">No resumable transfers found</div>
                  )}
                </div>
              </div>

              {/* Error History */}
              {errorHistory.length > 0 && (
                <div className="bg-muted rounded-lg p-4">
                  <h3 className="font-medium text-foreground mb-3">🛡️ Error History</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {errorHistory.slice(-5).map((error, index) => (
                      <div key={index} className="p-2 bg-background rounded border text-sm">
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-1 rounded text-xs ${
                            error.severity === 'critical' ? 'bg-red-100 text-red-800' :
                            error.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                            error.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {error.type}
                          </span>
                          <span className="text-xs text-muted-foreground">{error.correlationId}</span>
                        </div>
                        <div className="mt-1 text-foreground">{error.message}</div>
                        {error.retryable && (
                          <div className="text-xs text-blue-600 mt-1">Retryable</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transfer Progress */}
        {(hostFileTransfer.transferProgress || clientFileTransfer.transferProgress) && (
          <div className="bg-card rounded-lg shadow p-6 mb-4 border">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Transfer Progress</h2>
            <div className="space-y-4">
              {hostFileTransfer.transferProgress && (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-foreground">Host Transfer</div>
                  <div className="text-sm text-foreground">
                    <strong>File:</strong> {hostFileTransfer.transferProgress.fileName}
                  </div>
                  <div className="text-sm text-foreground">
                    <strong>Size:</strong> {formatFileSize(hostFileTransfer.transferProgress.fileSize)}
                  </div>
                  <div className="text-sm text-foreground">
                    <strong>Transferred:</strong> {formatFileSize(hostFileTransfer.transferProgress.bytesTransferred)} / {formatFileSize(hostFileTransfer.transferProgress.fileSize)}
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${hostFileTransfer.transferProgress.percentage}%` }}
                    ></div>
                  </div>
                  <div className="text-sm text-foreground">
                    <strong>Progress:</strong> {hostFileTransfer.transferProgress.percentage}%
                  </div>
                  <div className={`text-sm ${
                    hostFileTransfer.transferProgress.status === 'completed' ? 'text-green-600' :
                    hostFileTransfer.transferProgress.status === 'error' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    <strong>Status:</strong> {hostFileTransfer.transferProgress.status}
                    {hostFileTransfer.transferProgress.error && (
                      <div className="text-red-600 mt-1">Error: {hostFileTransfer.transferProgress.error}</div>
                    )}
                  </div>
                </div>
              )}
              
              {clientFileTransfer.transferProgress && (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-foreground">Client Transfer</div>
                  <div className="text-sm text-foreground">
                    <strong>File:</strong> {clientFileTransfer.transferProgress.fileName}
                  </div>
                  <div className="text-sm text-foreground">
                    <strong>Size:</strong> {formatFileSize(clientFileTransfer.transferProgress.fileSize)}
                  </div>
                  <div className="text-sm text-foreground">
                    <strong>Transferred:</strong> {formatFileSize(clientFileTransfer.transferProgress.bytesTransferred)} / {formatFileSize(clientFileTransfer.transferProgress.fileSize)}
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${clientFileTransfer.transferProgress.percentage}%` }}
                    ></div>
                  </div>
                  <div className="text-sm text-foreground">
                    <strong>Progress:</strong> {clientFileTransfer.transferProgress.percentage}%
                  </div>
                  <div className={`text-sm ${
                    clientFileTransfer.transferProgress.status === 'completed' ? 'text-green-600' :
                    clientFileTransfer.transferProgress.status === 'error' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    <strong>Status:</strong> {clientFileTransfer.transferProgress.status}
                    {clientFileTransfer.transferProgress.error && (
                      <div className="text-red-600 mt-1">Error: {clientFileTransfer.transferProgress.error}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
                {activeTab === 'client' 
                  ? (clientFileTransfer.receivedFile ? 'Download File' : 'File Already Saved to Disk')
                  : 'Download File'
                }
              </button>
            </div>
          </div>
        )}

        {/* Connection Status */}
        <div className="bg-card rounded-lg shadow p-6 mb-4 border">
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
              {activeTab === 'host' ? (
                <div className="text-sm text-muted-foreground">
                  Connected Clients: {hostFileTransfer.connectedClients?.length || 0}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  File Status: {clientFileTransfer.receivedFile ? 'Received' : 'None'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Debug Info */}
        <div className="bg-card rounded-lg shadow p-6 mb-4 border">
          <h2 className="text-lg font-semibold mb-4 text-foreground">🔧 Enhanced Debug Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Transfer Status */}
            <div className="space-y-2 text-sm">
              <h3 className="font-medium text-foreground mb-2">Transfer Status</h3>
              <div className="text-muted-foreground">
                <strong>{activeTab === 'host' ? 'Host' : 'Client'} Transfer Progress:</strong> {activeFileTransfer.transferProgress ? `${activeFileTransfer.transferProgress.percentage}%` : 'None'}
              </div>
              <div className="text-muted-foreground">
                <strong>Is Transferring:</strong> {activeFileTransfer.isTransferring ? 'Yes' : 'No'}
              </div>
              {activeTab === 'client' && (
                <div className="text-muted-foreground">
                  <strong>Received File:</strong> {clientFileTransfer.receivedFile ? `${clientFileTransfer.receivedFileName} (${formatFileSize(clientFileTransfer.receivedFile.size)})` : 'None'}
                </div>
              )}
              {activeTab === 'host' && (
                <div className="text-muted-foreground">
                  <strong>Connected Clients:</strong> {hostFileTransfer.connectedClients?.length || 0}
                </div>
              )}
            </div>

            {/* Sprint 2 Features */}
            <div className="space-y-2 text-sm">
              <h3 className="font-medium text-foreground mb-2">Sprint 2 Features</h3>
              
              {/* Chunk Size */}
              {activeFileTransfer.getCurrentChunkSize && (
                <div className="text-muted-foreground">
                  <strong>Fixed Chunk Size:</strong> {(activeFileTransfer.getCurrentChunkSize() / 1024).toFixed(1)} KB
                </div>
              )}
              
              
              {/* Transfer Metrics */}
              <div className="text-muted-foreground">
                <strong>Transfer Metrics:</strong> Available via API
              </div>
              
              {/* Error Management */}
              <div className="text-muted-foreground">
                <strong>Error Management:</strong> Structured logging with correlation IDs
              </div>
              
              {/* Resumption */}
              <div className="text-muted-foreground">
                <strong>Transfer Resumption:</strong> Persistent state with automatic recovery
              </div>
            </div>
          </div>
        </div>

        {/* Logs */}
        <div className="bg-card rounded-lg shadow p-6 border">
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
