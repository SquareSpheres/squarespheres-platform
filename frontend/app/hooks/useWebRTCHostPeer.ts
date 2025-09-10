'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSignalHost, SignalingMessage } from './useSignalingClient';
import { WebRTCPeerConfig, WebRTCSignalPayload } from './webrtcTypes';
import {
  createPeerConnection,
  attachEventHandlers,
  ConnectionWatchdog,
  ConnectionWatchdogConfig,
  isChrome,
  DEFAULT_ICE_SERVERS,
  EventHandlers,
} from './webrtcUtils';

export interface WebRTCHostPeerApi {
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  send: (data: string | ArrayBuffer | Blob, clientId?: string) => void;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  disconnectClient: (clientId: string) => void;
  role: 'host';
  peerId?: string;
  connectedClients?: string[];
  clientConnections?: Map<string, { connectionState: RTCPeerConnectionState; dataChannelState: RTCDataChannelState | undefined }>;
}

interface ClientConnection {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  watchdog: ConnectionWatchdog;
}

export function useWebRTCHostPeer(config: WebRTCPeerConfig): WebRTCHostPeerApi {
  const debug = config.debug ?? false;
  const isChromeBrowser = isChrome();
  
  const iceServers = config.iceServers ?? DEFAULT_ICE_SERVERS;
  const connectionTimeoutMs = config.connectionTimeoutMs ?? (isChromeBrowser ? 45000 : 30000);
  const iceGatheringTimeoutMs = config.iceGatheringTimeoutMs ?? (isChromeBrowser ? 20000 : 15000);
  
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [dataChannelState, setDataChannelState] = useState<RTCDataChannelState>();
  const [clientConnections, setClientConnections] = useState<Map<string, { connectionState: RTCPeerConnectionState; dataChannelState: RTCDataChannelState | undefined }>>(new Map());
  
  const clientConnectionsRef = useRef<Map<string, ClientConnection>>(new Map());
  const hostPendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const host = useSignalHost({
    onMessage: (message: SignalingMessage) => handleSignalMessage(message),
    onClientJoined: (clientId: string) => {
      if (debug) console.log(`[WebRTC Host] Client ${clientId} joined`);
    },
    onClientDisconnected: (clientId: string) => {
      if (debug) console.log(`[WebRTC Host] Client ${clientId} disconnected`);
      disconnectClient(clientId);
    },
  });

  const sendSignal = useCallback(
    async (payload: WebRTCSignalPayload, targetClientId: string) => {
      const serialized = JSON.stringify(payload);
      host.sendMessageToClient(targetClientId, serialized);
    },
    [host]
  );

  const createClientConnection = useCallback((clientId: string): ClientConnection => {
    const pc = createPeerConnection({
      iceServers,
      isChrome: isChromeBrowser,
      debug,
    });

    const watchdogConfig: ConnectionWatchdogConfig = {
      connectionTimeoutMs,
      iceGatheringTimeoutMs,
      maxRetries: isChromeBrowser ? 1 : 2,
      retryDelayMs: isChromeBrowser ? 8000 : 3000,
      onConnectionTimeout: () => {
        if (debug) console.warn(`[WebRTC Host] Connection timeout for client ${clientId}`);
        config.onConnectionTimeout?.();
      },
      onConnectionFailed: (error) => {
        if (debug) console.error(`[WebRTC Host] Connection failed for client ${clientId}:`, error);
        config.onConnectionFailed?.(error);
      },
      debug,
    };

    const watchdog = new ConnectionWatchdog(watchdogConfig);

    const eventHandlers: EventHandlers = {
      onConnectionStateChange: (state) => {
        if (debug) console.log(`[WebRTC Host] Client ${clientId} connection state: ${state}`);
        watchdog.handleConnectionStateChange(state);
        
        setClientConnections(prev => {
          const newMap = new Map(prev);
          const clientConn = clientConnectionsRef.current.get(clientId);
          newMap.set(clientId, {
            connectionState: state,
            dataChannelState: clientConn?.dc?.readyState
          });
          return newMap;
        });

        if (state === 'connected') {
          if (debug) console.log(`[WebRTC Host] Connection established with client ${clientId}!`);
        } else if (state === 'failed') {
          if (debug) console.error(`[WebRTC Host] Connection failed with client ${clientId}`);
        }

        config.onConnectionStateChange?.(state);
      },
      onDataChannelStateChange: (state) => {
        setDataChannelState(state);
        setClientConnections(prev => {
          const newMap = new Map(prev);
          const clientConn = clientConnectionsRef.current.get(clientId);
          newMap.set(clientId, {
            connectionState: clientConn?.pc.connectionState || 'new',
            dataChannelState: state
          });
          return newMap;
        });
      },
      onChannelOpen: () => {
        if (debug) console.log(`[WebRTC Host] Data channel opened with client ${clientId}`);
        config.onChannelOpen?.();
      },
      onChannelClose: () => {
        if (debug) console.log(`[WebRTC Host] Data channel closed with client ${clientId}`);
        config.onChannelClose?.();
      },
      onChannelMessage: (data) => {
        config.onChannelMessage?.(data);
      },
      onIceCandidate: (candidate) => {
        if (candidate) {
          if (debug) console.log(`[WebRTC Host] Sending ICE candidate to client ${clientId}:`, candidate.candidate);
          sendSignal({ kind: 'webrtc-ice', candidate }, clientId);
        } else {
          if (debug) console.log(`[WebRTC Host] ICE gathering completed for client ${clientId} - sending end-of-candidates`);
          sendSignal({ kind: 'webrtc-ice', candidate: null as any }, clientId);
        }
      },
      onIceGatheringStateChange: (state) => {
        if (debug) console.log(`[WebRTC Host] ICE gathering state for client ${clientId}: ${state}`);
      },
      onIceConnectionStateChange: (state) => {
        if (debug) console.log(`[WebRTC Host] ICE connection state for client ${clientId}: ${state}`);
        
        if (state === 'failed') {
          if (debug) console.warn(`[WebRTC Host] ICE connection failed for client ${clientId}, attempting restart`);
          const clientConn = clientConnectionsRef.current.get(clientId);
          if (clientConn?.pc.remoteDescription) {
            try {
              clientConn.pc.restartIce();
              if (debug) console.log(`[WebRTC Host] ICE restart initiated for client ${clientId}`);
            } catch (error) {
              if (debug) console.error(`[WebRTC Host] ICE restart failed for client ${clientId}:`, error);
            }
          }
        } else if (state === 'disconnected') {
          if (debug) console.warn(`[WebRTC Host] ICE connection disconnected for client ${clientId}, waiting for reconnection...`);
          const clientConn = clientConnectionsRef.current.get(clientId);
          setTimeout(() => {
            if (clientConn?.pc.iceConnectionState === 'disconnected' && clientConn.pc.remoteDescription) {
              if (debug) console.log(`[WebRTC Host] ICE still disconnected for client ${clientId}, attempting restart`);
              try {
                clientConn.pc.restartIce();
              } catch (error) {
                if (debug) console.error(`[WebRTC Host] ICE restart failed for client ${clientId}:`, error);
              }
            }
          }, isChromeBrowser ? 3000 : 2000);
        } else if (state === 'connected') {
          if (debug) console.log(`[WebRTC Host] ICE connection established for client ${clientId}!`);
        }
      },
    };

    attachEventHandlers(pc, eventHandlers, debug);

    // Set up data channel handling for this specific client connection
    pc.ondatachannel = (evt) => {
      const dc = evt.channel;
      // Update the client connection with the data channel
      const currentConn = clientConnectionsRef.current.get(clientId);
      if (currentConn) {
        currentConn.dc = dc;
      }
      
      if (debug) console.log(`[WebRTC Host] Data channel received from client ${clientId}: ${dc.readyState}`);
      
      setClientConnections(prev => {
        const newMap = new Map(prev);
        newMap.set(clientId, {
          connectionState: pc.connectionState,
          dataChannelState: dc.readyState
        });
        return newMap;
      });
      
      dc.onopen = () => {
        if (debug) console.log(`[WebRTC Host] Data channel opened with client ${clientId}`);
        setClientConnections(prev => {
          const newMap = new Map(prev);
          newMap.set(clientId, {
            connectionState: pc.connectionState,
            dataChannelState: dc.readyState
          });
          return newMap;
        });
        config.onChannelOpen?.();
      };
      
      dc.onclose = () => {
        if (debug) console.log(`[WebRTC Host] Data channel closed with client ${clientId}`);
        setClientConnections(prev => {
          const newMap = new Map(prev);
          newMap.set(clientId, {
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

    return { pc, dc: null, watchdog };
  }, [iceServers, isChromeBrowser, debug, connectionTimeoutMs, iceGatheringTimeoutMs, config, sendSignal]);

  const handleOfferMessage = useCallback(async (message: SignalingMessage, sdp: RTCSessionDescriptionInit) => {
    if (!message.clientId) return;

    let clientConn = clientConnectionsRef.current.get(message.clientId);
    if (!clientConn) {
      clientConn = createClientConnection(message.clientId);
      clientConnectionsRef.current.set(message.clientId, clientConn);
    }

    const pc = clientConn.pc;
    
    if (debug) console.log(`[WebRTC Host] Received offer from client ${message.clientId}`);
    await pc.setRemoteDescription(sdp);
    
    const answer = await pc.createAnswer({});
    await pc.setLocalDescription(answer);
    
    if (debug) console.log(`[WebRTC Host] Sending answer to client ${message.clientId}`);
    await sendSignal({ kind: 'webrtc-answer', sdp: answer }, message.clientId);
    
    // Add any pending ICE candidates for this client
    const pendingCandidates = hostPendingIceCandidatesRef.current.get(message.clientId) || [];
    for (const candidate of pendingCandidates) {
      try {
        if (debug) console.log(`[WebRTC Host] Adding pending ICE candidate for client ${message.clientId}:`, candidate.candidate);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        if (debug) console.warn(`[WebRTC Host] Failed to add pending ICE candidate for client ${message.clientId}:`, error);
      }
    }
    hostPendingIceCandidatesRef.current.delete(message.clientId);
  }, [createClientConnection, sendSignal, debug]);

  const handleIceCandidateMessage = useCallback(async (message: SignalingMessage, candidate: RTCIceCandidateInit | null) => {
    if (!message.clientId) return;

    const clientConn = clientConnectionsRef.current.get(message.clientId);
    if (!clientConn) return;

    const pc = clientConn.pc;

    if (candidate !== null && candidate !== undefined) {
      try {
        if (debug) console.log(`[WebRTC Host] Adding ICE candidate from client ${message.clientId}:`, candidate.candidate);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        if (debug) console.warn(`[WebRTC Host] Failed to add ICE candidate for client ${message.clientId}:`, error);
        
        if (pc.remoteDescription === null) {
          if (debug) console.log(`[WebRTC Host] Storing ICE candidate as pending for client ${message.clientId}`);
          if (!hostPendingIceCandidatesRef.current.has(message.clientId)) {
            hostPendingIceCandidatesRef.current.set(message.clientId, []);
          }
          hostPendingIceCandidatesRef.current.get(message.clientId)!.push(candidate);
        } else if (isChromeBrowser && (error as Error).name === 'OperationError') {
          if (debug) console.log(`[WebRTC Host] Chrome ICE candidate error (likely duplicate), ignoring`);
        } else {
          if (debug) console.warn(`[WebRTC Host] ICE candidate addition failed but remote description is set - this might be normal`);
        }
      }
    } else {
      if (debug) console.log(`[WebRTC Host] Received end-of-candidates from client ${message.clientId}`);
    }
  }, [isChromeBrowser, debug]);

  const handleSignalMessage = useCallback(
    async (message: SignalingMessage) => {
      if (!message.payload) return;
      
      let parsed: WebRTCSignalPayload | undefined;
      try {
        parsed = JSON.parse(message.payload);
      } catch (error) {
        if (debug) console.warn('[WebRTC Host] Failed to parse signaling message:', error);
        return;
      }

      if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return;

      if (parsed.kind === 'webrtc-offer') {
        await handleOfferMessage(message, parsed.sdp);
      } else if (parsed.kind === 'webrtc-ice') {
        await handleIceCandidateMessage(message, parsed.candidate);
      }
    },
    [debug, handleOfferMessage, handleIceCandidateMessage]
  );

  const createOrEnsureConnection = useCallback(async () => {
    try {
      if (!host.hostId) {
        await host.connect();
        await host.registerHost();
      }
    } catch (error) {
      if (debug) console.error('[WebRTC Host] Connection failed:', error);
      config.onConnectionFailed?.(error instanceof Error ? error : new Error('Connection failed'));
      throw error;
    }
  }, [host, config, debug]);

  const send = useCallback((data: string | ArrayBuffer | Blob, clientId?: string) => {
    if (clientId) {
      const clientConn = clientConnectionsRef.current.get(clientId);
      if (clientConn?.dc && clientConn.dc.readyState === 'open') {
        clientConn.dc.send(data as any);
      }
    } else {
      clientConnectionsRef.current.forEach((clientConn) => {
        if (clientConn.dc && clientConn.dc.readyState === 'open') {
          clientConn.dc.send(data as any);
        }
      });
    }
  }, []);

  const disconnectClient = useCallback((clientId: string) => {
    const clientConn = clientConnectionsRef.current.get(clientId);
    if (clientConn) {
      clientConn.watchdog.clearTimeouts();
      clientConn.dc?.close();
      clientConn.pc.close();
      clientConnectionsRef.current.delete(clientId);
      setClientConnections(prev => {
        const newMap = new Map(prev);
        newMap.delete(clientId);
        return newMap;
      });
      if (debug) console.log(`[WebRTC Host] Disconnected client ${clientId}`);
    }
  }, [debug]);

  const close = useCallback(() => {
    clientConnectionsRef.current.forEach((clientConn) => {
      clientConn.watchdog.clearTimeouts();
      clientConn.dc?.close();
      clientConn.pc.close();
    });
    clientConnectionsRef.current.clear();
    setClientConnections(new Map());
    hostPendingIceCandidatesRef.current.clear();
  }, []);

  useEffect(() => () => close(), [close]);

  return {
    connectionState,
    dataChannelState,
    send,
    createOrEnsureConnection,
    close,
    disconnectClient,
    role: 'host' as const,
    peerId: host.hostId,
    connectedClients: host.connectedClients,
    clientConnections,
  };
}