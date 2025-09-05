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
      error: 'bg-red-100 border-red-300 text-red-900',
      system: 'bg-blue-100 border-blue-300 text-blue-900',
      outgoing: 'bg-green-100 border-green-300 text-green-900',
      'client-joined': 'bg-emerald-100 border-emerald-300 text-emerald-900',
      'client-disconnected': 'bg-orange-100 border-orange-300 text-orange-900',
      'host-disconnected': 'bg-red-100 border-red-300 text-red-900',
      'join-host': 'bg-purple-100 border-purple-300 text-purple-900',
      'msg-to-host': 'bg-indigo-100 border-indigo-300 text-indigo-900',
      'msg-to-client': 'bg-cyan-100 border-cyan-300 text-cyan-900',
    };
    return styles[type as keyof typeof styles] || 'bg-gray-100 border-gray-300 text-gray-900';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center text-gray-900">Signaling Client Demo</h1>
        
        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('host')}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                activeTab === 'host'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              🖥️ Host
            </button>
            <button
              onClick={() => setActiveTab('client')}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                activeTab === 'client'
                  ? 'bg-green-50 text-green-700 border-b-2 border-green-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              👤 Client
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          {activeTab === 'host' ? (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Host Controls</h2>
              
              <div className="space-y-4">
                <button
                  onClick={handleRegisterHost}
                  disabled={hostClient.isConnected}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600 transition-colors"
                >
                  Register as Host
                </button>
                
                {hostClient.hostId && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-900">Host ID:</p>
                    <p className="font-mono text-sm break-all text-gray-900">{hostClient.hostId}</p>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-900">Status: {getCurrentStatus()}</p>
              </div>

              {/* Disconnect */}
              {hostClient.isConnected && (
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  Disconnect Host
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Client Controls</h2>
              
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={hostIdInput}
                    onChange={(e) => setHostIdInput(e.target.value)}
                    placeholder="Enter host ID to join"
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                  />
                  <button
                    onClick={handleJoinHost}
                    disabled={clientClient.isConnected || !hostIdInput}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg disabled:opacity-50 hover:bg-green-600 transition-colors"
                  >
                    Join Host
                  </button>
                </div>
                
                {clientClient.clientId && (
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-900">Client ID:</p>
                    <p className="font-mono text-sm break-all text-gray-900">{clientClient.clientId}</p>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-900">Status: {getCurrentStatus()}</p>
              </div>

              {/* Disconnect */}
              {clientClient.isConnected && (
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
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
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Connected Clients ({connectedClients.length})</h2>
            {connectedClients.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {connectedClients.map((clientId) => (
                  <div key={clientId} className="p-2 bg-blue-50 rounded border">
                    <p className="font-mono text-sm break-all text-gray-900">{clientId}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No clients connected yet</p>
            )}
          </div>
        )}

        {/* Messaging */}
        {((activeTab === 'host' && hostClient.isConnected) || (activeTab === 'client' && clientClient.isConnected)) && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Messaging</h2>
            
            <div className="space-y-4">
              {activeTab === 'host' && (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Target Client ID:
                  </label>
                  <input
                    type="text"
                    value={targetClientId}
                    onChange={(e) => setTargetClientId(e.target.value)}
                    placeholder="Enter client ID to send message to"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                  />
                </div>
              )}
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={activeTab === 'host' ? 'Type message to send to client...' : 'Type message to send to host...'}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput || (activeTab === 'host' && !targetClientId)}
                  className="px-6 py-2 bg-purple-500 text-white rounded-lg disabled:opacity-50 hover:bg-purple-600 transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Message Log */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Message Log</h2>
          
          <div className="h-96 overflow-y-auto border rounded-lg p-4 space-y-2">
            {messages.length === 0 ? (
              <p className="text-gray-500 text-center">No messages yet</p>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`p-3 rounded-lg border ${getMessageStyle(msg)}`}>
                                                        <div className="flex justify-between items-start mb-1">
                     <span className="text-xs font-bold text-gray-700">
                       {(msg.type || 'unknown').toUpperCase()}
                     </span>
                     {(msg as any).timestamp && (
                       <span className="text-xs text-gray-600">
                         {new Date((msg as any).timestamp).toLocaleTimeString()}
                       </span>
                     )}
                   </div>
                   <div className="font-mono text-sm break-all text-gray-800">
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
