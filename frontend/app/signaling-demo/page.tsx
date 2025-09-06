'use client';

import { useState } from 'react';
import { useSignalHost, useSignalClient, SignalingMessage } from '../hooks/useSignalingClient';

export default function SignalingDemo() {
  const [messages, setMessages] = useState<SignalingMessage[]>([]);
  const [hostIdInput, setHostIdInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [targetClientId, setTargetClientId] = useState('');
  const [activeTab, setActiveTab] = useState<'host' | 'client'>('host');
  const [connectedClients, setConnectedClients] = useState<string[]>([]);

  const hostClient = useSignalHost({
    onMessage: (message) => {
      setMessages(prev => [...prev, { ...message, timestamp: new Date().toISOString() }]);
      
      // Track client connections and disconnections
      if (message.type === 'client-joined' && message.clientId) {
        setConnectedClients(prev => [...prev, message.clientId!]);
      } else if (message.type === 'client-disconnected' && message.clientId) {
        setConnectedClients(prev => prev.filter(id => id !== message.clientId));
      }
    },
    onError: (error) => {
      console.error('Host error:', error);
      setMessages(prev => [...prev, { 
        type: 'error', 
        payload: error.message,
        timestamp: new Date().toISOString()
      }]);
    },
    onOpen: () => {
      console.log('Host connected to signaling server');
      setMessages(prev => [...prev, { 
        type: 'system', 
        payload: 'Host connected to signaling server',
        timestamp: new Date().toISOString()
      }]);
    },
    onClose: () => {
      console.log('Host disconnected from signaling server');
      setMessages(prev => [...prev, { 
        type: 'system', 
        payload: 'Host disconnected from signaling server',
        timestamp: new Date().toISOString()
      }]);
    }
  });

  const clientClient = useSignalClient({
    onMessage: (message) => {
      setMessages(prev => [...prev, { ...message, timestamp: new Date().toISOString() }]);
      
      // Handle host disconnection
      if (message.type === 'host-disconnected') {
        setMessages(prev => [...prev, { 
          type: 'system', 
          payload: 'Host disconnected - you will be disconnected',
          timestamp: new Date().toISOString()
        }]);
        // Optionally disconnect the client when host disconnects
        setTimeout(() => {
          clientClient.disconnect();
        }, 1000);
      }
    },
    onError: (error) => {
      console.error('Client error:', error);
      setMessages(prev => [...prev, { 
        type: 'error', 
        payload: error.message,
        timestamp: new Date().toISOString()
      }]);
    },
    onOpen: () => {
      console.log('Client connected to signaling server');
      setMessages(prev => [...prev, { 
        type: 'system', 
        payload: 'Client connected to signaling server',
        timestamp: new Date().toISOString()
      }]);
    },
    onClose: () => {
      console.log('Client disconnected from signaling server');
      setMessages(prev => [...prev, { 
        type: 'system', 
        payload: 'Client disconnected from signaling server',
        timestamp: new Date().toISOString()
      }]);
    }
  });

  const handleRegisterHost = async () => {
    try {
      const hostId = await hostClient.registerHost();
      setMessages(prev => [...prev, { 
        type: 'system', 
        payload: `Registered as host with ID: ${hostId}`,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('Failed to register host:', error);
    }
  };

  const handleJoinHost = async () => {
    if (!hostIdInput) return;
    
    try {
      const clientId = await clientClient.joinHost(hostIdInput);
      setMessages(prev => [...prev, { 
        type: 'system', 
        payload: `Joined host as client with ID: ${clientId}`,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('Failed to join host:', error);
    }
  };

  const handleSendMessage = () => {
    if (!messageInput) return;
    
    if (activeTab === 'host') {
      if (targetClientId) {
        hostClient.sendMessageToClient(targetClientId, messageInput);
        setMessages(prev => [...prev, { 
          type: 'outgoing', 
          payload: `To client ${targetClientId}: ${messageInput}`,
          timestamp: new Date().toISOString()
        }]);
      } else {
        setMessages(prev => [...prev, { 
          type: 'error', 
          payload: 'Please enter a client ID to send message to',
          timestamp: new Date().toISOString()
        }]);
      }
    } else if (activeTab === 'client') {
      clientClient.sendMessageToHost(messageInput);
      setMessages(prev => [...prev, { 
        type: 'outgoing', 
        payload: `To host: ${messageInput}`,
        timestamp: new Date().toISOString()
      }]);
    }
    
    setMessageInput('');
  };

  const handleDisconnect = () => {
    if (activeTab === 'host') {
      hostClient.disconnect();
    } else if (activeTab === 'client') {
      clientClient.disconnect();
    }
    setConnectedClients([]);
  };

  const getCurrentStatus = () => {
    if (activeTab === 'host') {
      return `Host | Connected: ${hostClient.isConnected} | Host ID: ${hostClient.hostId || 'None'}`;
    } else if (activeTab === 'client') {
      return `Client | Connected: ${clientClient.isConnected} | Client ID: ${clientClient.clientId || 'None'}`;
    }
    return 'No role selected';
  };

  const getMessageStyle = (message: SignalingMessage & { timestamp?: string }) => {
    const type = message.type || 'unknown';
    const styles = {
      error: 'status-error',
      system: 'status-message-system',
      outgoing: 'status-message-outgoing',
      'client-joined': 'status-connected',
      'client-disconnected': 'status-warning',
      'host-disconnected': 'status-disconnected',
      'join-host': 'status-joining',
      'msg-to-host': 'status-message-host',
      'msg-to-client': 'status-message-client',
    };
    return styles[type as keyof typeof styles] || 'bg-muted border-border text-card-foreground';
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center text-foreground">Signaling Client Demo</h1>
        
        {/* Tab Navigation */}
        <div className="bg-card rounded-lg shadow-md mb-6">
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('host')}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                activeTab === 'host'
                  ? 'bg-primary/10 text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              🖥️ Host
            </button>
            <button
              onClick={() => setActiveTab('client')}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                activeTab === 'client'
                  ? 'bg-accent/10 text-accent border-b-2 border-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              👤 Client
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-card rounded-lg shadow-md p-6 mb-6">
          {activeTab === 'host' ? (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-card-foreground">Host Controls</h2>
              
              <div className="space-y-4">
                <button
                  onClick={handleRegisterHost}
                  disabled={hostClient.isConnected}
                  className="btn btn-primary w-full"
                >
                  Register as Host
                </button>
                
                {hostClient.hostId && (
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <p className="text-sm font-medium text-card-foreground">Host ID:</p>
                    <p className="font-mono text-sm break-all text-card-foreground">{hostClient.hostId}</p>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium text-card-foreground">Status: {getCurrentStatus()}</p>
              </div>

              {/* Disconnect */}
              {hostClient.isConnected && (
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
                >
                  Disconnect Host
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-card-foreground">Client Controls</h2>
              
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={hostIdInput}
                    onChange={(e) => setHostIdInput(e.target.value)}
                    placeholder="Enter host ID to join"
                    className="input flex-1"
                  />
                  <button
                    onClick={handleJoinHost}
                    disabled={clientClient.isConnected || !hostIdInput}
                    className="btn btn-secondary disabled:opacity-50"
                  >
                    Join Host
                  </button>
                </div>
                
                {clientClient.clientId && (
                  <div className="p-3 bg-accent/10 rounded-lg">
                    <p className="text-sm font-medium text-card-foreground">Client ID:</p>
                    <p className="font-mono text-sm break-all text-card-foreground">{clientClient.clientId}</p>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium text-card-foreground">Status: {getCurrentStatus()}</p>
              </div>

              {/* Disconnect */}
              {clientClient.isConnected && (
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
                >
                  Disconnect Client
                </button>
              )}
            </div>
          )}
        </div>

        {/* Connected Clients (Host Only) */}
        {activeTab === 'host' && hostClient.isConnected && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-card-foreground">Connected Clients ({connectedClients.length})</h2>
            {connectedClients.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {connectedClients.map((clientId) => (
                  <div key={clientId} className="p-2 bg-primary/10 rounded border border-border">
                    <p className="font-mono text-sm break-all text-card-foreground">{clientId}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">No clients connected yet</p>
            )}
          </div>
        )}

        {/* Messaging */}
        {((activeTab === 'host' && hostClient.isConnected) || (activeTab === 'client' && clientClient.isConnected)) && (
          <div className="bg-card rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-card-foreground">Messaging</h2>
            
            <div className="space-y-4">
              {activeTab === 'host' && (
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    Target Client ID:
                  </label>
                  <input
                    type="text"
                    value={targetClientId}
                    onChange={(e) => setTargetClientId(e.target.value)}
                    placeholder="Enter client ID to send message to"
                    className="input w-full"
                  />
                </div>
              )}
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={activeTab === 'host' ? 'Type message to send to client...' : 'Type message to send to host...'}
                  className="input flex-1"
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput || (activeTab === 'host' && !targetClientId)}
                  className="btn btn-primary disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Message Log */}
        <div className="bg-card rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4 text-card-foreground">Message Log</h2>
          
          <div className="h-96 overflow-y-auto border border-border rounded-lg p-4 space-y-2">
            {messages.length === 0 ? (
              <p className="text-muted-foreground text-center">No messages yet</p>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`p-3 rounded-lg border ${getMessageStyle(msg)}`}>
                                                        <div className="flex justify-between items-start mb-1">
                     <span className="text-xs font-bold">
                       {(msg.type || 'unknown').toUpperCase()}
                     </span>
                     {(msg as any).timestamp && (
                       <span className="text-xs opacity-70">
                         {new Date((msg as any).timestamp).toLocaleTimeString()}
                       </span>
                     )}
                   </div>
                   <div className="font-mono text-sm break-all">
                     {msg.payload || JSON.stringify(msg, null, 2)}
                   </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
