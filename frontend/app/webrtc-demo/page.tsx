'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWebRTCPeer, isHostPeer } from '../hooks/useWebRTCPeer';
import { DEFAULT_ICE_SERVERS } from '../hooks/webrtcUtils';
import { useWebRTCConfig } from '../hooks/useWebRTCConfig';

export default function WebRTCDemoPage() {
  const [hostIdInput, setHostIdInput] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'host' | 'client'>('host');
  const [outgoing, setOutgoing] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [isCreatingHost, setIsCreatingHost] = useState(false);
  const [isJoiningClient, setIsJoiningClient] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<{
    localIP?: string;
    publicIP?: string;
    userAgent: string;
  }>({ userAgent: '' });
  // Using dynamic TURN servers with fallback to STUN-only configuration
  const { iceServers, usingTurnServers, isLoadingTurnServers, turnServersError } = useWebRTCConfig({
    includeTurnServers: true,
    mergeWithFallback: true,
    fallbackIceServers: DEFAULT_ICE_SERVERS
  });

  const hostPeer = useWebRTCPeer({
    role: 'host',
    debug: true,
    iceServers,
    onConnectionStateChange: (s) => setMessages((m) => [...m, `Host PC state: ${s}`]),
    onChannelOpen: () => setMessages((m) => [...m, 'Host data channel open']),
    onChannelClose: () => setMessages((m) => [...m, 'Host data channel closed']),
    onChannelMessage: (d) => setMessages((m) => [...m, `Host received: ${toDisplay(d)}`]),
  });

  const clientPeer = useWebRTCPeer({
    role: 'client',
    hostId: hostIdInput || undefined,
    debug: true,
    iceServers,
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

  // TODO: Add TURN server testing function when TURN servers are needed
  // This would test TURN server connectivity and relay candidate generation

  // Detect local IP address
  useEffect(() => {
    const detectIP = async () => {
      try {
        // Get local IP via WebRTC
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const ipMatch = event.candidate.candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
            if (ipMatch && ipMatch[1]) {
              setConnectionInfo(prev => ({ ...prev, localIP: ipMatch[1] }));
            }
          }
        };

        // Get public IP with multiple fallback services
        const getPublicIP = async () => {
          // Prioritize services that work well with CORS
          const services = [
            {
              url: 'https://ipapi.co/json/',
              parser: (data: any) => data.ip,
              priority: 1 // Highest priority - known to work well
            },
            {
              url: 'https://api64.ipify.org?format=json',
              parser: (data: any) => data.ip,
              priority: 2
            },
            {
              url: 'https://api.ip.sb/jsonip',
              parser: (data: any) => data.ip,
              priority: 3
            },
            {
              url: 'https://httpbin.org/ip',
              parser: (data: any) => data.origin,
              priority: 4
            },
          ];

          // Sort by priority
          services.sort((a, b) => a.priority - b.priority);

          for (const service of services) {
            try {
              console.log(`Trying IP service (${service.priority}): ${service.url}`);

              // Create AbortController for timeout
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 3000); // Reduced timeout

              const response = await fetch(service.url, {
                method: 'GET',
                signal: controller.signal,
                mode: 'cors',
                headers: {
                  'Accept': 'application/json',
                },
              });

              clearTimeout(timeoutId);

              if (!response.ok) {
                console.warn(`HTTP ${response.status} from ${service.url}`);
                continue;
              }

              const data = await response.json();
              const ip = service.parser(data);

              if (ip && typeof ip === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                console.log(`✅ Successfully got IP from ${service.url}: ${ip}`);
                return ip;
              } else {
                console.warn(`Invalid IP format from ${service.url}:`, ip);
              }
            } catch (error) {
              // Don't log CORS errors as they're expected and handled
              if (error instanceof Error && error.name === 'AbortError') {
                console.warn(`Timeout (${service.priority})`);
              } else if (error instanceof Error && !error.message.includes('CORS') && !error.message.includes('Failed to fetch')) {
                console.warn(`Error (${service.priority}):`, error.message);
              }
              continue;
            }
          }

          console.info('ℹ️ IP detection completed - some services may be blocked by CORS but that\'s normal');
          return null;
        };

        const publicIP = await getPublicIP();
        if (publicIP) {
          setConnectionInfo(prev => ({ ...prev, publicIP }));
        } else {
          console.warn('Could not detect public IP from any service, this is normal in restrictive environments');
          setConnectionInfo(prev => ({ ...prev, publicIP: 'Unable to detect' }));
        }

        setTimeout(() => pc.close(), 1000);
      } catch (error) {
        console.warn('Could not detect IP addresses:', error);
        setConnectionInfo(prev => ({
          ...prev,
          localIP: 'Unable to detect',
          publicIP: 'Unable to detect'
        }));
      }
    };

    detectIP();
  }, []);

  useEffect(() => {
    // Track connection state changes
  }, [hostPeer.connectionState, hostPeer.dataChannelState, clientPeer.connectionState, clientPeer.dataChannelState]);

  // Set user agent on client side
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setConnectionInfo(prev => ({ ...prev, userAgent: navigator.userAgent }));
    }
  }, []);

  const createHost = async () => {
    if (isCreatingHost) return;
    
    setIsCreatingHost(true);
    try {
      await hostPeer.createOrEnsureConnection();
    } catch (error) {
      console.error('[Demo] Failed to create host:', error);
      setMessages((m) => [...m, `Error creating host: ${error}`]);
    } finally {
      setIsCreatingHost(false);
    }
  };

  const disconnectHost = () => {
    try {
      hostPeer.disconnect();
      setMessages((m) => [...m, '✅ Host disconnected successfully']);
    } catch (error) {
      console.error('Error disconnecting host:', error);
      setMessages((m) => [...m, `❌ Error disconnecting host: ${error}`]);
    }
  };

  const disconnectClient = () => {
    try {
      clientPeer.disconnect();
      setMessages((m) => [...m, '✅ Client disconnected successfully']);
    } catch (error) {
      console.error('Error disconnecting client:', error);
      setMessages((m) => [...m, `❌ Error disconnecting client: ${error}`]);
    }
  };

  const joinAsClient = async () => {
    if (!hostIdInput || isJoiningClient) return;
    
    setIsJoiningClient(true);
    try {
      await clientPeer.createOrEnsureConnection();
    } catch (error) {
      console.error('[Demo] Failed to join as client:', error);
      setMessages((m) => [...m, `Error joining as client: ${error}`]);
    } finally {
      setIsJoiningClient(false);
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

          {/* Connection Info */}
          <div className="p-4 bg-muted/50 border-b border-border">
            <h3 className="text-sm font-semibold mb-2 text-foreground">Network Info</h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Local IP: <span className={`font-mono ${connectionInfo.localIP === 'Unable to detect' ? 'text-red-500' : 'text-foreground'}`}>
                {connectionInfo.localIP || 'Detecting...'}
              </span></div>
              <div>Public IP: <span className={`font-mono ${connectionInfo.publicIP === 'Unable to detect' ? 'text-red-500' : 'text-foreground'}`}>
                {connectionInfo.publicIP || 'Detecting...'}
              </span></div>
              <div>Browser: <span className="text-foreground">{connectionInfo.userAgent.includes('Chrome') ? 'Chrome' : 'Other'}</span></div>
              <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                <div className="text-blue-800 dark:text-blue-200 font-medium">
                  {usingTurnServers ? '🚀 Enhanced Configuration' : isLoadingTurnServers ? '⏳ Loading TURN Servers...' : '🌐 STUN-Only Configuration'}
                </div>
                <div className="text-blue-700 dark:text-blue-300 text-xs mt-1">
                  {usingTurnServers 
                    ? 'Using dynamic TURN servers for enhanced connectivity in restrictive networks.'
                    : isLoadingTurnServers
                    ? 'Fetching TURN server credentials...'
                    : 'Using reliable STUN servers for NAT traversal. Most connections work fine with STUN-only.'
                  }
                </div>
                <div className="text-xs mt-1">
                  <span className="font-mono">ICE Servers: {iceServers.length} configured</span>
                </div>
                {turnServersError && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                    <div className="text-red-800 dark:text-red-200 font-medium text-xs">⚠️ TURN Server Error</div>
                    <div className="text-red-700 dark:text-red-300 text-xs mt-1">{turnServersError}</div>
                  </div>
                )}
                {usingTurnServers && (
                  <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                    <div className="text-green-800 dark:text-green-200 font-medium text-xs">✅ TURN Servers Active</div>
                    <div className="text-green-700 dark:text-green-300 text-xs mt-1">
                      Enhanced connectivity for corporate networks and restrictive firewalls.
                    </div>
                  </div>
                )}
              </div>
              {(connectionInfo.publicIP && connectionInfo.publicIP !== 'Unable to detect') && (
                <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                  <div className="text-green-800 dark:text-green-200 font-medium">✅ IP Detection Working</div>
                  <div className="text-green-700 dark:text-green-300 text-xs mt-1">
                    Successfully detected your public IP address. CORS errors in console are normal and don&apos;t affect functionality.
                  </div>
                </div>
              )}
              {(connectionInfo.publicIP === 'Unable to detect') && (
                <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded border border-orange-200 dark:border-orange-800">
                  <div className="text-orange-800 dark:text-orange-200 font-medium">🌐 IP Detection Limited</div>
                  <div className="text-orange-700 dark:text-orange-300 text-xs mt-1">
                    External IP services blocked by CORS/browser security. This doesn&apos;t affect WebRTC functionality - connections will still work normally.
                  </div>
                </div>
              )}
              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                <div className="text-yellow-800 dark:text-yellow-200 font-medium">⚠️ Same-Computer Testing Mode</div>
                <div className="text-yellow-700 dark:text-yellow-300 text-xs mt-1">
                  Both tabs share the same network. For real cross-network testing, use different devices/browsers/networks.
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {activeTab === 'host' ? (
              <div className="space-y-3">
                {hostPeer.peerId ? (
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
                {clientPeer.peerId ? (
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
                    <input value={hostIdInput} onChange={(e)=>setHostIdInput(e.target.value)} placeholder="Enter Host ID" className="px-3 py-2 border border-border rounded w-full text-foreground bg-background" />
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


