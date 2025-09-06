'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWebRTCPeer } from '../hooks/useWebRTCPeer';

export default function WebRTCDemoPage() {
  const [hostIdInput, setHostIdInput] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'host' | 'client'>('host');
  const [outgoing, setOutgoing] = useState('');

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
    // Nothing on mount
  }, []);

  const createHost = async () => {
    await hostPeer.createOrEnsureConnection();
  };

  const joinAsClient = async () => {
    if (!hostIdInput) return;
    await clientPeer.createOrEnsureConnection();
  };

  const sendMessage = () => {
    const peer = activeTab === 'host' ? hostPeer : clientPeer;
    if (!outgoing) return;
    peer.send(outgoing);
    setMessages((m) => [...m, `${activeTab} sent: ${outgoing}`]);
    setOutgoing('');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">WebRTC P2P Demo</h1>

        <div className="bg-white rounded-lg shadow mb-4">
          <div className="flex border-b">
            <button onClick={() => setActiveTab('host')} className={`flex-1 px-4 py-3 ${activeTab==='host'?'bg-blue-50 text-blue-700 border-b-2 border-blue-500':'text-gray-600 hover:bg-gray-50'}`}>Host</button>
            <button onClick={() => setActiveTab('client')} className={`flex-1 px-4 py-3 ${activeTab==='client'?'bg-green-50 text-green-700 border-b-2 border-green-500':'text-gray-600 hover:bg-gray-50'}`}>Client</button>
          </div>
          <div className="p-6 space-y-4">
            {activeTab === 'host' ? (
              <div className="space-y-3">
                <button onClick={createHost} className="px-4 py-2 bg-blue-600 text-white rounded">Create Host</button>
                <div className="text-sm text-gray-700">Host ID: <span className="font-mono">{hostPeer.peerId || 'n/a'}</span></div>
              </div>
            ) : (
              <div className="space-y-3">
                <input value={hostIdInput} onChange={(e)=>setHostIdInput(e.target.value)} placeholder="Enter Host ID" className="px-3 py-2 border rounded w-full text-gray-900" />
                <button onClick={joinAsClient} disabled={!hostIdInput} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">Join Host</button>
                <div className="text-sm text-gray-700">Client ID: <span className="font-mono">{clientPeer.peerId || 'n/a'}</span></div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4 mb-4">
          <div className="text-sm text-gray-700">Host PC: {hostPeer.connectionState} | Client PC: {clientPeer.connectionState}</div>
          <div className="flex gap-2">
            <input value={outgoing} onChange={(e)=>setOutgoing(e.target.value)} placeholder={`Send message as ${activeTab}`} className="flex-1 px-3 py-2 border rounded text-gray-900" />
            <button onClick={sendMessage} className="px-4 py-2 bg-purple-600 text-white rounded">Send</button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Log</h2>
          <div className="h-80 overflow-y-auto border rounded p-3 space-y-1">
            {messages.map((m, i) => (
              <div key={i} className="text-sm text-gray-800">{m}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


