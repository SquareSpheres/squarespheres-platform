'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSignalHost, SignalingMessage } from './useSignalingClient';
import { WebRTCPeerConfig, WebRTCSignalPayload } from './webrtcTypes';
import {
  createPeerConnection,
  attachEventHandlers,
  createDataChannel,
  createWebRTCEventHandlers,
  setupDataChannel,
  DataChannelConfig,
  ICECandidateManager,
  ConnectionWatchdog,
  createConnectionWatchdog,
  WatchdogConfig,
  createSignalingMessageHandler,
  SignalingHandlers,
  DEFAULT_ICE_SERVERS,
  getDataChannelMaxMessageSize,
} from './webrtcUtils';
import { detectBrowser } from '../utils/browserUtils';

export interface WebRTCHostPeerApi {
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  send: (data: string | ArrayBuffer | Blob, clientId?: string) => void;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  disconnect: () => void;
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
  iceCandidateManager: ICECandidateManager;
}

export function useWebRTCHostPeer(config: WebRTCPeerConfig): WebRTCHostPeerApi {
  const debug = config.debug ?? false;

  // Defer browser detection to avoid SSR issues
  const [browserInfo, setBrowserInfo] = useState<ReturnType<typeof detectBrowser>>(() => 
    typeof window !== 'undefined' ? detectBrowser() : {
      isSafari: false,
      isChrome: false,
      isFirefox: false,
      isEdge: false,
      isOpera: false,
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      name: 'unknown',
      version: 'unknown',
      userAgent: 'unknown'
    }
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBrowserInfo(detectBrowser());
    }
  }, []);

  const iceServers = config.iceServers ?? DEFAULT_ICE_SERVERS;
  const connectionTimeoutMs = config.connectionTimeoutMs ?? (browserInfo.isChrome ? 45000 : 30000);
  const iceGatheringTimeoutMs = config.iceGatheringTimeoutMs ?? (browserInfo.isChrome ? 20000 : 15000);
  
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [dataChannelState, setDataChannelState] = useState<RTCDataChannelState>();
  const [clientConnections, setClientConnections] = useState<Map<string, { connectionState: RTCPeerConnectionState; dataChannelState: RTCDataChannelState | undefined }>>(new Map());
  
  const clientConnectionsRef = useRef<Map<string, ClientConnection>>(new Map());

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
      browserInfo,
      debug,
    });

    const watchdogConfig: WatchdogConfig = {
      connectionTimeoutMs,
      iceGatheringTimeoutMs,
      browserInfo,
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

    const watchdog = createConnectionWatchdog(watchdogConfig);

    const iceCandidateManager = new ICECandidateManager(browserInfo, debug, 'host', clientId);

    const eventHandlers = createWebRTCEventHandlers({
      role: 'host',
      clientId,
      pc,
      watchdog,
      sendSignal: (payload, targetClientId) => sendSignal(payload, targetClientId || clientId),
      onConnectionStateChange: (state) => {
        if (debug) console.log(`[WebRTC Host] Client ${clientId} connection state: ${state}`);

        setClientConnections(prev => {
          const newMap = new Map(prev);
          const clientConn = clientConnectionsRef.current.get(clientId);
          newMap.set(clientId, {
            connectionState: state,
            dataChannelState: clientConn?.dc?.readyState
          });
          
          // Update host's overall connection state based on client connections
          const connectedClients = Array.from(newMap.values()).filter(conn => conn.connectionState === 'connected');
          if (connectedClients.length > 0) {
            setConnectionState('connected');
          } else {
            const connectingClients = Array.from(newMap.values()).filter(conn => conn.connectionState === 'connecting');
            if (connectingClients.length > 0) {
              setConnectionState('connecting');
            } else if (newMap.size === 0) {
              setConnectionState('new');
            } else {
              setConnectionState('disconnected');
            }
          }
          
          return newMap;
        });

        if (state === 'connected') {
          if (debug) console.log(`[WebRTC Host] Connection established with client ${clientId}!`);
        } else if (state === 'failed') {
          if (debug) console.error(`[WebRTC Host] Connection failed with client ${clientId}`);
        }

        config.onConnectionStateChange?.(state);
      },
      onChannelOpen: config.onChannelOpen,
      onChannelClose: config.onChannelClose,
      onChannelMessage: config.onChannelMessage,
      browserInfo,
      debug,
    });

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

      setupDataChannel(dc, {
        onOpen: (readyState) => {
          setClientConnections(prev => {
            const newMap = new Map(prev);
            newMap.set(clientId, {
              connectionState: pc.connectionState,
              dataChannelState: readyState
            });
            return newMap;
          });
        },
        onClose: (readyState) => {
          setClientConnections(prev => {
            const newMap = new Map(prev);
            newMap.set(clientId, {
              connectionState: pc.connectionState,
              dataChannelState: readyState
            });
            return newMap;
          });
        },
        onMessage: config.onChannelMessage,
        onDataChannelReady: config.onDataChannelReady,
        debug,
        role: 'host',
        clientId,
      });
    };

    return { pc, dc: null, watchdog, iceCandidateManager };
  }, [iceServers, browserInfo, debug, connectionTimeoutMs, iceGatheringTimeoutMs, config, sendSignal]);

  const handleSignalMessage = useCallback(async (message: SignalingMessage) => {
    if (!message.payload) return;

    let parsed: WebRTCSignalPayload | undefined;
    try {
      parsed = JSON.parse(message.payload);
    } catch (error) {
      if (debug) {
        console.warn('[WebRTC Host] Failed to parse signaling message:', error);
      }
      return;
    }

    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return;

    try {
      if (parsed.kind === 'webrtc-offer') {
        if (!message.clientId) return;

        let clientConn = clientConnectionsRef.current.get(message.clientId);
        if (!clientConn) {
          clientConn = createClientConnection(message.clientId);
          clientConnectionsRef.current.set(message.clientId, clientConn);
        }

        const pc = clientConn.pc;

        if (debug) console.log(`[WebRTC Host] Received offer from client ${message.clientId}`);
        await pc.setRemoteDescription(parsed.sdp);

        const answer = await pc.createAnswer({});
        await pc.setLocalDescription(answer);

        if (debug) console.log(`[WebRTC Host] Sending answer to client ${message.clientId}`);
        await sendSignal({ kind: 'webrtc-answer', sdp: answer }, message.clientId);

        // Add any pending ICE candidates for this client
        await clientConn.iceCandidateManager.addPendingCandidates(pc, message.clientId);
      } else if (parsed.kind === 'webrtc-answer') {
        // Host doesn't receive answers, only sends them
        if (debug) console.warn('[WebRTC Host] Unexpected answer received from client');
      } else if (parsed.kind === 'webrtc-ice') {
        if (!message.clientId) return;

        const clientConn = clientConnectionsRef.current.get(message.clientId);
        if (!clientConn) return;

        await clientConn.iceCandidateManager.addCandidate(clientConn.pc, parsed.candidate, message.clientId);
      }
    } catch (error) {
      if (debug) {
        console.error(`[WebRTC Host] Error handling ${parsed.kind}:`, error);
      }
    }
  }, [createClientConnection, sendSignal, debug]);

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
        try {
          clientConn.dc.send(data as any);
        } catch (error) {
          if (debug) console.error(`[WebRTC Host] ❌ Failed to send to client ${clientId}:`, error);
        }
      } else {
        if (debug) console.warn(`[WebRTC Host] ⚠️ Cannot send to client ${clientId} - connection not ready:`, {
          hasConnection: !!clientConn,
          dataChannelState: clientConn?.dc?.readyState
        });
      }
    } else {
      let sentCount = 0;
      let failedCount = 0;
      clientConnectionsRef.current.forEach((clientConn, id) => {
        if (clientConn.dc && clientConn.dc.readyState === 'open') {
          try {
            clientConn.dc.send(data as any);
            sentCount++;
          } catch (error) {
            failedCount++;
            if (debug) console.error(`[WebRTC Host] ❌ Failed to send to client ${id}:`, error);
          }
        } else {
          failedCount++;
          if (debug) console.warn(`[WebRTC Host] ⚠️ Skipping client ${id} - connection not ready:`, {
            dataChannelState: clientConn.dc?.readyState
          });
        }
      });
      if (debug && (sentCount === 0 || failedCount > 0)) {
        console.log(`[WebRTC Host] 📊 Broadcast summary:`, {
          totalClients: clientConnectionsRef.current.size,
          sentCount,
          failedCount
        });
      }
    }
  }, [debug]);

  const disconnectClient = useCallback((clientId: string) => {
    const clientConn = clientConnectionsRef.current.get(clientId);
    if (clientConn) {
      clientConn.watchdog.clearTimeouts();
      clientConn.iceCandidateManager.clear(clientId);
      clientConn.dc?.close();
      clientConn.pc.close();
      clientConnectionsRef.current.delete(clientId);
      setClientConnections(prev => {
        const newMap = new Map(prev);
        newMap.delete(clientId);
        
        // Update host's overall connection state based on remaining client connections
        const connectedClients = Array.from(newMap.values()).filter(conn => conn.connectionState === 'connected');
        if (connectedClients.length > 0) {
          setConnectionState('connected');
        } else {
          const connectingClients = Array.from(newMap.values()).filter(conn => conn.connectionState === 'connecting');
          if (connectingClients.length > 0) {
            setConnectionState('connecting');
          } else if (newMap.size === 0) {
            setConnectionState('new');
          } else {
            setConnectionState('disconnected');
          }
        }
        
        return newMap;
      });
      if (debug) console.log(`[WebRTC Host] Disconnected client ${clientId}`);
    }
  }, [debug]);

  const close = useCallback(() => {
    clientConnectionsRef.current.forEach((clientConn) => {
      clientConn.watchdog.clearTimeouts();
      clientConn.iceCandidateManager.clear();
      clientConn.dc?.close();
      clientConn.pc.close();
    });
    clientConnectionsRef.current.clear();
    setClientConnections(new Map());
  }, []);

  const disconnect = useCallback(() => {
    close();
    host.disconnect();
    if (debug) console.log('[WebRTC Host] Fully disconnected - WebRTC and signaling');
  }, [close, host, debug]);

  useEffect(() => () => close(), [close]);

  return {
    connectionState,
    dataChannelState,
    send,
    createOrEnsureConnection,
    close,
    disconnect,
    disconnectClient,
    role: 'host' as const,
    peerId: host.hostId,
    connectedClients: host.connectedClients,
    clientConnections,
  };
}