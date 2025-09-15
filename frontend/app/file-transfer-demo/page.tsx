'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFileTransfer } from '../hooks/useFileTransfer';
import { DEFAULT_ICE_SERVERS } from '../hooks/webrtcUtils';

export default function FileTransferDemoPage() {
  const [hostIdInput, setHostIdInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'host' | 'client'>('host');
  const [isCreatingHost, setIsCreatingHost] = useState(false);
  const [isJoiningClient, setIsJoiningClient] = useState(false);
  // receivedFile is now managed by the hook
  const [logs, setLogs] = useState<string[]>([]);

  const iceServers = useMemo(() => DEFAULT_ICE_SERVERS, []);

  const hostFileTransfer = useFileTransfer({
    role: 'host',
    debug: true,
    iceServers,
    onConnectionStateChange: (s: RTCPeerConnectionState) => addLog(`Host PC state: ${s}`),
    onChannelOpen: () => addLog('Host data channel open'),
    onChannelClose: () => addLog('Host data channel closed'),
    onChannelMessage: (d: string | ArrayBuffer | Blob) => addLog(`Host received: ${typeof d === 'string' ? d.substring(0, 100) : 'Binary data'}`),
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
  });

  const activeFileTransfer = activeTab === 'host' ? hostFileTransfer : clientFileTransfer;

  function addLog(message: string) {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  }

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
        const url = URL.createObjectURL(clientFileTransfer.receivedFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = clientFileTransfer.receivedFileName || 'received_file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog(`Downloaded received file: ${clientFileTransfer.receivedFileName || 'received_file'}`);
        return;
      }
    }
    
    // For host, download the blob
    const fileToDownload = hostFileTransfer.receivedFile;
    const fileName = hostFileTransfer.receivedFileName;
    
    if (!fileToDownload) return;
    
    const url = URL.createObjectURL(fileToDownload);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'received_file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`Downloaded received file: ${fileName || 'received_file'}`);
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
        
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6 border border-blue-200 dark:border-blue-800">
          <div className="text-blue-800 dark:text-blue-200 font-medium mb-2">🚀 Streaming File Transfer with StreamSaver.js</div>
          <div className="text-blue-700 dark:text-blue-300 text-sm space-y-1">
            <div>• <strong>Host:</strong> Select any size file and click "Send File" - uses backpressure handling</div>
            <div>• <strong>Client:</strong> Files streamed directly to disk using File System Access API or StreamSaver.js</div>
            <div>• <strong>Chrome/Edge:</strong> File System Access API - user chooses save location</div>
            <div>• <strong>Firefox/Safari:</strong> StreamSaver.js - progressive download to default location</div>
            <div>• <strong>Large Files:</strong> Supports files of any size (10GB+ files work fine)</div>
            <div>• <strong>No Memory Limits:</strong> Files stream directly to disk, never stored in memory</div>
            <div>• <strong>Debug:</strong> Check browser console for detailed streaming logs</div>
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
                  Status: {clientFileTransfer.receivedFile ? 'File received!' : 'Waiting for file...'}
                </div>
                
                {clientFileTransfer.receivedFile && (
                  <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                    <div className="text-green-800 dark:text-green-200 font-medium text-sm">
                      ✅ File Received: {clientFileTransfer.receivedFileName}
                    </div>
                    <div className="text-green-700 dark:text-green-300 text-xs mt-1">
                      Size: {formatFileSize(clientFileTransfer.receivedFile.size)}
                    </div>
                    <div className="text-green-700 dark:text-green-300 text-xs mt-1">
                      {clientFileTransfer.receivedFileHandle 
                        ? 'Location: Saved to disk (File System Access API)' 
                        : 'Location: Saved to disk (StreamSaver.js)'
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

        {/* Transfer Progress */}
        {activeFileTransfer.transferProgress && (
          <div className="bg-card rounded-lg shadow p-6 mb-4 border">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Transfer Progress</h2>
            <div className="space-y-3">
              <div className="text-sm text-foreground">
                <strong>File:</strong> {activeFileTransfer.transferProgress.fileName}
              </div>
              <div className="text-sm text-foreground">
                <strong>Size:</strong> {formatFileSize(activeFileTransfer.transferProgress.fileSize)}
              </div>
              <div className="text-sm text-foreground">
                <strong>Transferred:</strong> {formatFileSize(activeFileTransfer.transferProgress.bytesTransferred)} / {formatFileSize(activeFileTransfer.transferProgress.fileSize)}
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${activeFileTransfer.transferProgress.percentage}%` }}
                ></div>
              </div>
              <div className="text-sm text-foreground">
                <strong>Progress:</strong> {activeFileTransfer.transferProgress.percentage}%
              </div>
              <div className={`text-sm ${
                activeFileTransfer.transferProgress.status === 'completed' ? 'text-green-600' :
                activeFileTransfer.transferProgress.status === 'error' ? 'text-red-600' :
                'text-blue-600'
              }`}>
                <strong>Status:</strong> {activeFileTransfer.transferProgress.status}
                {activeFileTransfer.transferProgress.error && (
                  <div className="text-red-600 mt-1">Error: {activeFileTransfer.transferProgress.error}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Received File */}
        {((activeTab === 'client' && clientFileTransfer.receivedFile) || (activeTab === 'host' && hostFileTransfer.receivedFile)) && (
          <div className="bg-card rounded-lg shadow p-6 mb-4 border">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Received File</h2>
            <div className="space-y-3">
              <div className="text-sm text-foreground">
                <strong>File:</strong> {activeTab === 'client' ? clientFileTransfer.receivedFileName : hostFileTransfer.receivedFileName}
              </div>
              <div className="text-sm text-foreground">
                <strong>Size:</strong> {formatFileSize((activeTab === 'client' ? clientFileTransfer.receivedFile : hostFileTransfer.receivedFile)!.size)}
              </div>
              <div className="text-sm text-foreground">
                <strong>Type:</strong> {(activeTab === 'client' ? clientFileTransfer.receivedFile : hostFileTransfer.receivedFile)!.type || 'Unknown'}
              </div>
              <button
                onClick={downloadReceivedFile}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {activeTab === 'client' 
                  ? 'File Already Saved to Disk' 
                  : 'Download File'
                }
              </button>
            </div>
          </div>
        )}

        {/* Connection Status */}
        <div className="bg-card rounded-lg shadow p-6 mb-4 border">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Connection Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">Host</div>
              <div className="text-sm text-muted-foreground">
                PC: {hostFileTransfer.connectionState} | DC: {hostFileTransfer.dataChannelState || 'n/a'}
              </div>
              <div className="text-sm text-muted-foreground">
                ID: {hostFileTransfer.peerId || 'n/a'}
              </div>
              <div className="text-sm text-muted-foreground">
                Clients: {hostFileTransfer.connectedClients?.length || 0}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Client</div>
              <div className="text-sm text-muted-foreground">
                PC: {clientFileTransfer.connectionState} | DC: {clientFileTransfer.dataChannelState || 'n/a'}
              </div>
              <div className="text-sm text-muted-foreground">
                ID: {clientFileTransfer.peerId || 'n/a'}
              </div>
              <div className="text-sm text-muted-foreground">
                File: {clientFileTransfer.receivedFile ? 'Received' : 'None'}
              </div>
            </div>
          </div>
        </div>

        {/* Debug Info */}
        <div className="bg-card rounded-lg shadow p-6 mb-4 border">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Debug Information</h2>
          <div className="space-y-2 text-sm">
            <div className="text-muted-foreground">
              <strong>Host Transfer Progress:</strong> {hostFileTransfer.transferProgress ? `${hostFileTransfer.transferProgress.percentage}%` : 'None'}
            </div>
            <div className="text-muted-foreground">
              <strong>Client Transfer Progress:</strong> {clientFileTransfer.transferProgress ? `${clientFileTransfer.transferProgress.percentage}%` : 'None'}
            </div>
            <div className="text-muted-foreground">
              <strong>Host Is Transferring:</strong> {hostFileTransfer.isTransferring ? 'Yes' : 'No'}
            </div>
            <div className="text-muted-foreground">
              <strong>Client Is Transferring:</strong> {clientFileTransfer.isTransferring ? 'Yes' : 'No'}
            </div>
            <div className="text-muted-foreground">
              <strong>Client Received File:</strong> {clientFileTransfer.receivedFile ? `${clientFileTransfer.receivedFileName} (${formatFileSize(clientFileTransfer.receivedFile.size)})` : 'None'}
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
