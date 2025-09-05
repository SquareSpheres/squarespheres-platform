'use client';

import { useState } from 'react';
import { useSignalHost, useSignalClient, SignalingMessage } from '../hooks/useSignalingClient';

export default function SignalingExample() {
  const [messages, setMessages] = useState<SignalingMessage[]>([]);
  const [hostIdInput, setHostIdInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [role, setRole] = useState<'host' | 'client' | null>(null);

  const hostClient = useSignalHost({
    onMessage: (message) => {
      setMessages(prev => [...prev, message]);
    },
    onError: (error) => {
      console.error('Host error:', error);
    },
    onOpen: () => {
      console.log('Host connected to signaling server');
    },
    onClose: () => {
      console.log('Host disconnected from signaling server');
    }
  });

  const clientClient = useSignalClient({
    onMessage: (message) => {
      setMessages(prev => [...prev, message]);
    },
    onError: (error) => {
      console.error('Client error:', error);
    },
    onOpen: () => {
      console.log('Client connected to signaling server');
    },
    onClose: () => {
      console.log('Client disconnected from signaling server');
    }
  });

  const handleRegisterHost = async () => {
    try {
      const hostId = await hostClient.registerHost();
      setRole('host');
      console.log('Registered as host:', hostId);
    } catch (error) {
      console.error('Failed to register host:', error);
    }
  };

  const handleJoinHost = async () => {
    if (!hostIdInput) return;
    
    try {
      const clientId = await clientClient.joinHost(hostIdInput);
      setRole('client');
      console.log('Joined host as client:', clientId);
    } catch (error) {
      console.error('Failed to join host:', error);
    }
  };

  const handleSendMessage = () => {
    if (!messageInput) return;
    
    if (role === 'host') {
      // For demo purposes, sending to a dummy client ID
      // In real usage, you'd track connected clients
      hostClient.sendMessageToClient('demo-client', messageInput);
    } else if (role === 'client') {
      clientClient.sendMessageToHost(messageInput);
    }
    
    setMessageInput('');
  };

  const getCurrentStatus = () => {
    if (role === 'host') {
      return `Host | Connected: ${hostClient.isConnected} | Host ID: ${hostClient.hostId || 'None'}`;
    } else if (role === 'client') {
      return `Client | Connected: ${clientClient.isConnected} | Client ID: ${clientClient.clientId || 'None'}`;
    }
    return 'No role selected';
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Signaling Client Example (Split Hooks)</h1>
      
      <div className="mb-6">
        <div className="flex gap-4 mb-4">
          <button
            onClick={handleRegisterHost}
            disabled={hostClient.isConnected}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            Register as Host
          </button>
          
          <div className="flex gap-2">
            <input
              type="text"
              value={hostIdInput}
              onChange={(e) => setHostIdInput(e.target.value)}
              placeholder="Host ID to join"
              className="px-3 py-2 border rounded"
            />
            <button
              onClick={handleJoinHost}
              disabled={clientClient.isConnected || !hostIdInput}
              className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
            >
              Join Host
            </button>
          </div>
        </div>
        
        <div className="text-sm text-gray-600">
          {getCurrentStatus()}
        </div>
      </div>
      
      <div className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border rounded"
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button
            onClick={handleSendMessage}
            disabled={!messageInput || !role}
            className="px-4 py-2 bg-purple-500 text-white rounded disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
      
      <div className="border rounded p-4 h-64 overflow-y-auto">
        <h3 className="font-semibold mb-2">Messages:</h3>
        {messages.length === 0 ? (
          <p className="text-gray-500">No messages yet</p>
        ) : (
          <div className="space-y-2">
            {messages.map((msg, index) => (
              <div key={index} className="text-sm p-2 bg-gray-100 rounded">
                <div className="font-mono">
                  {JSON.stringify(msg, null, 2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
