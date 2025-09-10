'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignalHost, useSignalClient, SignalingMessage } from './useSignalingClient';
import { WebRTCPeerConfig, WebRTCSignalPayload } from './webrtcTypes';

export interface WebRTCPeerApi {
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  send: (data: string | ArrayBuffer | Blob, clientId?: string) => void;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  disconnectClient?: (clientId: string) => void; // Only available for host role
  role: 'host' | 'client';
  peerId?: string; // hostId for host, clientId for client
  connectedClients?: string[]; // Only available for host role
  clientConnections?: Map<string, { connectionState: RTCPeerConnectionState; dataChannelState: RTCDataChannelState | undefined }>; // Only available for host role
}

// Default ICE servers: public STUN. TODO: Add TURN (e.g., coturn) with credentials.
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTCPeer(config: WebRTCPeerConfig): WebRTCPeerApi {
  const iceServers = useMemo(() => config.iceServers ?? DEFAULT_ICE_SERVERS, [config.iceServers]);
  const connectionTimeoutMs = config.connectionTimeoutMs ?? 30000; // 30 seconds default
  const iceGatheringTimeoutMs = config.iceGatheringTimeoutMs ?? 15000; // 15 seconds default
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const connectedClientIdRef = useRef<string | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const iceGatheringTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [dataChannelState, setDataChannelState] = useState<RTCDataChannelState>();
  
  // For host role: manage multiple client connections
  const clientConnectionsRef = useRef<Map<string, { pc: RTCPeerConnection; dc: RTCDataChannel | null }>>(new Map());
  const [clientConnections, setClientConnections] = useState<Map<string, { connectionState: RTCPeerConnectionState; dataChannelState: RTCDataChannelState | undefined }>>(new Map());

  const host = useSignalHost({
    onMessage: (m) => handleSignalMessage(m),
    onClientJoined: (clientId: string) => {
      console.log(`[WebRTC Host] Client ${clientId} joined`);
    },
    onClientDisconnected: (clientId: string) => {
      console.log(`[WebRTC Host] Client ${clientId} disconnected`);
      // Clean up client connection
      const clientConn = clientConnectionsRef.current.get(clientId);
      if (clientConn) {
        clientConn.pc.close();
        clientConn.dc?.close();
        clientConnectionsRef.current.delete(clientId);
        setClientConnections(prev => {
          const newMap = new Map(prev);
          newMap.delete(clientId);
          return newMap;
        });
      }
    },
  });
  const client = useSignalClient({
    onMessage: (m) => handleSignalMessage(m),
  });

  const sendSignal = useCallback(
    async (payload: WebRTCSignalPayload, targetClientId?: string) => {
      const serialized = JSON.stringify(payload);
      if (config.role === 'host') {
        if (!targetClientId) return;
        host.sendMessageToClient(targetClientId, serialized);
      } else {
        client.sendMessageToHost(serialized);
      }
    },
    [client, host, config.role]
  );

  const handleSignalMessage = useCallback(
    async (message: SignalingMessage) => {
      const text = message.payload;
      if (!text) return;
      
      let parsed: WebRTCSignalPayload | undefined;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        console.warn(`[WebRTC ${config.role}] Failed to parse signaling message:`, error);
        return;
      }
      if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return;
      
      if (config.role === 'host') {
        // For host: handle multiple client connections
        if (!message.clientId) return;
        
        let clientConn = clientConnectionsRef.current.get(message.clientId);
        if (!clientConn && parsed.kind === 'webrtc-offer') {
          // Create new peer connection for this client
          const pc = new RTCPeerConnection({ iceServers });
          const dc = null; // Will be set when data channel is received
          clientConn = { pc, dc };
          clientConnectionsRef.current.set(message.clientId, clientConn);
          
          // Set up peer connection event handlers
          pc.onconnectionstatechange = () => {
            setClientConnections(prev => {
              const newMap = new Map(prev);
              newMap.set(message.clientId!, {
                connectionState: pc.connectionState,
                dataChannelState: clientConn?.dc?.readyState
              });
              return newMap;
            });
          };
          
          pc.ondatachannel = (evt) => {
            const dc = evt.channel;
            clientConn!.dc = dc;
            setClientConnections(prev => {
              const newMap = new Map(prev);
              newMap.set(message.clientId!, {
                connectionState: pc.connectionState,
                dataChannelState: dc.readyState
              });
              return newMap;
            });
            
            dc.onopen = () => {
              setClientConnections(prev => {
                const newMap = new Map(prev);
                newMap.set(message.clientId!, {
                  connectionState: pc.connectionState,
                  dataChannelState: dc.readyState
                });
                return newMap;
              });
              config.onChannelOpen?.();
            };
            
            dc.onclose = () => {
              setClientConnections(prev => {
                const newMap = new Map(prev);
                newMap.set(message.clientId!, {
                  connectionState: pc.connectionState,
                  dataChannelState: dc.readyState
                });
                return newMap;
              });
              config.onChannelClose?.();
            };
            
            dc.onmessage = (e) => {
              config.onChannelMessage?.(e.data);
            };
          };
          
          pc.onicecandidate = (evt) => {
            if (evt.candidate) {
              const payload: WebRTCSignalPayload = { kind: 'webrtc-ice', candidate: evt.candidate.toJSON() };
              sendSignal(payload, message.clientId);
            }
          };
        }
        
        if (!clientConn) return;
        const pc = clientConn.pc;
        
        if (parsed.kind === 'webrtc-offer') {
          await pc.setRemoteDescription(parsed.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal({ kind: 'webrtc-answer', sdp: answer }, message.clientId);
        } else if (parsed.kind === 'webrtc-ice') {
          if (parsed.candidate) {
            try { 
              await pc.addIceCandidate(parsed.candidate);
            } catch (error) {
              console.warn(`[WebRTC Host] Failed to add ICE candidate for client ${message.clientId}:`, error);
            }
          }
        }
      } else {
        // For client: handle single connection to host
        const pc = pcRef.current;
        if (!pc) return;

        if (parsed.kind === 'webrtc-offer') {
          connectedClientIdRef.current = message.clientId || null;
          await pc.setRemoteDescription(parsed.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal({ kind: 'webrtc-answer', sdp: answer }, message.clientId);
        } else if (parsed.kind === 'webrtc-answer') {
          await pc.setRemoteDescription(parsed.sdp);
        } else if (parsed.kind === 'webrtc-ice') {
          if (parsed.candidate) {
            try { 
              await pc.addIceCandidate(parsed.candidate);
            } catch (error) {
              console.warn(`[WebRTC Client] Failed to add ICE candidate:`, error);
            }
          }
        }
      }
    },
    [sendSignal, config.role, config.onChannelOpen, config.onChannelClose, config.onChannelMessage, iceServers]
  );

  const ensurePeerConnection = useCallback(async () => {
    if (pcRef.current) return;
    
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setConnectionState(state);
      
      // Clear timeouts when connection succeeds or fails
      if (state === 'connected' || state === 'failed' || state === 'closed') {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        if (iceGatheringTimeoutRef.current) {
          clearTimeout(iceGatheringTimeoutRef.current);
          iceGatheringTimeoutRef.current = null;
        }
      }
      
      // Handle connection failure
      if (state === 'failed') {
        config.onConnectionFailed?.(new Error('WebRTC connection failed'));
      }
      
      config.onConnectionStateChange?.(state);
    };

    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        const payload: WebRTCSignalPayload = { kind: 'webrtc-ice', candidate: evt.candidate.toJSON() };
        if (config.role === 'host') {
          const targetId = connectedClientIdRef.current;
          if (targetId) {
            sendSignal(payload, targetId);
          }
        } else {
          sendSignal(payload);
        }
      }
    };

    if (config.role === 'host') {
      pc.ondatachannel = (evt) => {
        const dc = evt.channel;
        dcRef.current = dc;
        setDataChannelState(dc.readyState);
        dc.onopen = () => { 
          setDataChannelState(dc.readyState); 
          config.onChannelOpen?.(); 
        };
        dc.onclose = () => { 
          setDataChannelState(dc.readyState); 
          config.onChannelClose?.(); 
        };
        dc.onmessage = (e) => {
          config.onChannelMessage?.(e.data);
        };
      };
    } else {
      pc.ondatachannel = (evt) => {
        const dc = evt.channel;
        dcRef.current = dc;
        setDataChannelState(dc.readyState);
        dc.onopen = () => { 
          setDataChannelState(dc.readyState); 
          config.onChannelOpen?.(); 
        };
        dc.onclose = () => { 
          setDataChannelState(dc.readyState); 
          config.onChannelClose?.(); 
        };
        dc.onmessage = (e) => {
          config.onChannelMessage?.(e.data);
        };
      };
    }
  }, [config, iceServers, sendSignal]);

  const createOrEnsureConnection = useCallback(async () => {
    await ensurePeerConnection();

    // Set connection timeout
    connectionTimeoutRef.current = setTimeout(() => {
      if (pcRef.current?.connectionState === 'connecting') {
        console.warn(`[WebRTC ${config.role}] Connection timeout after ${connectionTimeoutMs}ms`);
        config.onConnectionTimeout?.();
        pcRef.current?.close();
      }
    }, connectionTimeoutMs);

    if (config.role === 'host') {
      if (!host.hostId) {
        await host.connect();
        await host.registerHost();
      }
    } else {
      if (config.hostId) {
        let clientId: string;
        if (!client.clientId) {
          await client.connect();
          clientId = await client.joinHost(config.hostId);
        } else {
          clientId = client.clientId;
        }
        const pc = pcRef.current!;
        const dc = pc.createDataChannel(clientId);
        dcRef.current = dc;
        setDataChannelState(dc.readyState);
        dc.onopen = () => { 
          setDataChannelState(dc.readyState); 
          config.onChannelOpen?.(); 
        };
        dc.onclose = () => { 
          setDataChannelState(dc.readyState); 
          config.onChannelClose?.(); 
        };
        dc.onmessage = (e) => {
          config.onChannelMessage?.(e.data);
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal({ kind: 'webrtc-offer', sdp: offer });
      }
    }
  }, [client, host, config, ensurePeerConnection, sendSignal, connectionTimeoutMs]);

  const send = useCallback((data: string | ArrayBuffer | Blob, clientId?: string) => {
    if (config.role === 'host' && clientId) {
      // Send to specific client
      const clientConn = clientConnectionsRef.current.get(clientId);
      if (clientConn?.dc && clientConn.dc.readyState === 'open') {
        clientConn.dc.send(data as any);
      }
    } else if (config.role === 'client') {
      // Send to host
      const dc = dcRef.current;
      if (dc && dc.readyState === 'open') {
        dc.send(data as any);
      }
    } else if (config.role === 'host' && !clientId) {
      // Send to all connected clients
      clientConnectionsRef.current.forEach((clientConn) => {
        if (clientConn.dc && clientConn.dc.readyState === 'open') {
          clientConn.dc.send(data as any);
        }
      });
    }
  }, [config.role]);

  const disconnectClient = useCallback((clientId: string) => {
    const clientConn = clientConnectionsRef.current.get(clientId);
    if (clientConn) {
      clientConn.dc?.close();
      clientConn.pc.close();
      clientConnectionsRef.current.delete(clientId);
      setClientConnections(prev => {
        const newMap = new Map(prev);
        newMap.delete(clientId);
        return newMap;
      });
      console.log(`[WebRTC Host] Disconnected client ${clientId}`);
    }
  }, []);

  const close = useCallback(() => {
    // Clear timeouts
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (iceGatheringTimeoutRef.current) {
      clearTimeout(iceGatheringTimeoutRef.current);
      iceGatheringTimeoutRef.current = null;
    }
    
    // Close single connection (for client role)
    dcRef.current?.close();
    pcRef.current?.close();
    dcRef.current = null;
    pcRef.current = null;
    
    // Close all client connections (for host role)
    clientConnectionsRef.current.forEach((clientConn) => {
      clientConn.dc?.close();
      clientConn.pc.close();
    });
    clientConnectionsRef.current.clear();
    setClientConnections(new Map());
  }, []);

  useEffect(() => () => close(), [close]);

  return {
    connectionState,
    dataChannelState,
    send,
    createOrEnsureConnection,
    close,
    disconnectClient: config.role === 'host' ? disconnectClient : undefined,
    role: config.role,
    peerId: config.role === 'host' ? host.hostId : client.clientId,
    connectedClients: config.role === 'host' ? host.connectedClients : undefined,
    clientConnections: config.role === 'host' ? clientConnections : undefined,
  };
}


