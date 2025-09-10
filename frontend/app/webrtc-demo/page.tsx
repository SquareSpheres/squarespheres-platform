'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWebRTCPeer, isHostPeer } from '../hooks/useWebRTCPeer';

export default function WebRTCDemoPage() {
  const [hostIdInput, setHostIdInput] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'host' | 'client'>('host');
  const [outgoing, setOutgoing] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  const hostPeer = useWebRTCPeer({
    role: 'host',
    onConnectionStateChange: (s) => setMessages((m) => [...m, `Host PC state: ${s}`]),
    onChannelOpen: () => setMessages((m) => [...m, 'Host data channel open']),
    onChannelClose: () => setMessages((m) => [...m, 'Host data channel closed']),
    onChannelMessage: (d) => setMessages((m) => [...m, `Host received: ${toDisplay(d)}`]),
  });

  const clientPeer = useWebRTCPeer({
    role: 'client',
    hostId: hostIdInput || undefined,
    onConnectionStateChange: (s) => setMessages((m) => [...m, `Client PC state: ${s}`]),
    onChannelOpen: () => setMessages((m) => [...m, 'Client data channel open']),
    onChannelClose: () => setMessages((m) => [...m, 'Client data channel closed']),
    onChannelMessage: (d) => setMessages((m) => [...m, `Client received: ${toDisplay(d)}`]),
  });

  function toDisplay(d: string | ArrayBuffer | Blob) {
    if (typeof d === 'string') return d;
    if (d instanceof ArrayBuffer) return `ArrayBuffer(${d.byteLength})`;
    return `Blob(${(d as Blob).size})`;
  }

  useEffect(() => {
    // Track connection state changes
  }, [hostPeer.connectionState, hostPeer.dataChannelState, clientPeer.connectionState, clientPeer.dataChannelState]);

  const createHost = async () => {
    try {
      await hostPeer.createOrEnsureConnection();
    } catch (error) {
      console.error('[Demo] Failed to create host:', error);
      setMessages((m) => [...m, `Error creating host: ${error}`]);
    }
  };

  const joinAsClient = async () => {
    if (!hostIdInput) return;
    
    try {
      await clientPeer.createOrEnsureConnection();
    } catch (error) {
      console.error('[Demo] Failed to join as client:', error);
      setMessages((m) => [...m, `Error joining as client: ${error}`]);
    }
  };

  const sendMessage = () => {
    const peer = activeTab === 'host' ? hostPeer : clientPeer;
    if (!outgoing) return;
    
    if (activeTab === 'host' && selectedClientId) {
      peer.send(outgoing, selectedClientId);
      setMessages((m) => [...m, `Host sent to ${selectedClientId}: ${outgoing}`]);
    } else if (activeTab === 'host' && !selectedClientId) {
      peer.send(outgoing);
      setMessages((m) => [...m, `Host sent to all clients: ${outgoing}`]);
    } else {
      peer.send(outgoing);
      setMessages((m) => [...m, `Client sent: ${outgoing}`]);
    }
    setOutgoing('');
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-foreground">WebRTC P2P Demo</h1>

        <div className="bg-card rounded-lg shadow mb-4 border">
          <div className="flex border-b border-border">
            <button onClick={() => setActiveTab('host')} className={`flex-1 px-4 py-3 ${activeTab==='host'?'bg-primary/10 text-primary border-b-2 border-primary':'text-muted-foreground hover:bg-muted'}`}>Host</button>
            <button onClick={() => setActiveTab('client')} className={`flex-1 px-4 py-3 ${activeTab==='client'?'bg-primary/10 text-primary border-b-2 border-primary':'text-muted-foreground hover:bg-muted'}`}>Client</button>
          </div>
          <div className="p-6 space-y-4">
            {activeTab === 'host' ? (
              <div className="space-y-3">
                <button onClick={createHost} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">Create Host</button>
                <div className="text-sm text-muted-foreground">Host ID: <span className="font-mono text-foreground">{hostPeer.peerId || 'n/a'}</span></div>
                
                {isHostPeer(hostPeer) && hostPeer.connectedClients && hostPeer.connectedClients.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-foreground">Connected Clients ({hostPeer.connectedClients.length})</div>
                      <button 
                        onClick={() => {
                          if (isHostPeer(hostPeer) && hostPeer.disconnectClient) {
                            hostPeer.connectedClients?.forEach(clientId => {
                              hostPeer.disconnectClient!(clientId);
                            });
                            setMessages((m) => [...m, `Disconnected all clients`]);
                            setSelectedClientId('');
                          }
                        }}
                        className="px-2 py-1 rounded text-xs bg-red-100 text-red-800 hover:bg-red-200"
                        title="Disconnect all clients"
                      >
                        Disconnect All
                      </button>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {isHostPeer(hostPeer) && hostPeer.connectedClients.map((clientId) => {
                        const clientConn = hostPeer.clientConnections?.get(clientId);
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
                              <span className={`px-2 py-1 rounded text-xs ${
                                clientConn?.dataChannelState === 'open' ? 'bg-green-100 text-green-800' :
                                clientConn?.dataChannelState === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {clientConn?.dataChannelState || 'no channel'}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={() => setSelectedClientId(selectedClientId === clientId ? '' : clientId)}
                                className={`px-2 py-1 rounded text-xs ${
                                  selectedClientId === clientId ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground text-muted'
                                }`}
                              >
                                {selectedClientId === clientId ? 'Selected' : 'Select'}
                              </button>
                              <button 
                                onClick={() => {
                                  if (isHostPeer(hostPeer) && hostPeer.disconnectClient) {
                                    hostPeer.disconnectClient(clientId);
                                    setMessages((m) => [...m, `Disconnected client ${clientId}`]);
                                    if (selectedClientId === clientId) {
                                      setSelectedClientId('');
                                    }
                                  }
                                }}
                                className="px-2 py-1 rounded text-xs bg-red-100 text-red-800 hover:bg-red-200"
                                title="Disconnect client"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <input value={hostIdInput} onChange={(e)=>setHostIdInput(e.target.value)} placeholder="Enter Host ID" className="px-3 py-2 border border-border rounded w-full text-foreground bg-background" />
                <button onClick={joinAsClient} disabled={!hostIdInput} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">Join Host</button>
                <div className="text-sm text-muted-foreground">Client ID: <span className="font-mono text-foreground">{clientPeer.peerId || 'n/a'}</span></div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-lg shadow p-6 space-y-4 mb-4 border">
          <div className="text-sm text-muted-foreground">Host PC: {hostPeer.connectionState} | Client PC: {clientPeer.connectionState}</div>
          
          {activeTab === 'host' && isHostPeer(hostPeer) && hostPeer.connectedClients && hostPeer.connectedClients.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Send to:</div>
              <div className="flex gap-2 flex-wrap">
                <button 
                  onClick={() => setSelectedClientId('')}
                  className={`px-3 py-1 rounded text-sm ${
                    !selectedClientId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  All Clients
                </button>
                {isHostPeer(hostPeer) && hostPeer.connectedClients.map((clientId) => (
                  <button 
                    key={clientId}
                    onClick={() => setSelectedClientId(clientId)}
                    className={`px-3 py-1 rounded text-sm ${
                      selectedClientId === clientId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {clientId}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex gap-2">
            <input 
              value={outgoing} 
              onChange={(e)=>setOutgoing(e.target.value)} 
              placeholder={
                activeTab === 'host' 
                  ? (selectedClientId ? `Send message to ${selectedClientId}` : 'Send message to all clients')
                  : 'Send message to host'
              } 
              className="flex-1 px-3 py-2 border border-border rounded text-foreground bg-background" 
            />
            <button onClick={sendMessage} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">Send</button>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow p-6 border">
          <h2 className="text-lg font-semibold mb-2 text-foreground">Log</h2>
          <div className="h-80 overflow-y-auto border border-border rounded p-3 space-y-1">
            {messages.map((m, i) => (
              <div key={i} className="text-sm text-foreground">{m}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


