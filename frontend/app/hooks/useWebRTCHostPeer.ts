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
import { useWebRTCConfig } from './useWebRTCConfig';
import { detectBrowser } from '../utils/browserUtils';
import { createLogger, consoleLogger } from '../types/logger';

export interface WebRTCHostPeerApi {
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  send: (data: string | ArrayBuffer | Blob) => void;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  disconnect: () => void;
  getDataChannel: () => RTCDataChannel | null;
  getPeerConnection: () => RTCPeerConnection | null;
  role: 'host';
  peerId?: string;
  connectedClient?: string;
}

interface HostConnection {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  watchdog: ConnectionWatchdog;
  iceCandidateManager: ICECandidateManager;
  clientId?: string;
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

  // Use dynamic TURN servers with fallback to default STUN servers
  const { iceServers, usingTurnServers, isLoadingTurnServers } = useWebRTCConfig({
    includeTurnServers: true,
    fallbackIceServers: config.iceServers ?? DEFAULT_ICE_SERVERS
  });
  const connectionTimeoutMs = config.connectionTimeoutMs ?? (browserInfo.isChrome ? 45000 : 30000);
  const iceGatheringTimeoutMs = config.iceGatheringTimeoutMs ?? (browserInfo.isChrome ? 20000 : 15000);
  
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [dataChannelState, setDataChannelState] = useState<RTCDataChannelState>();
  const [connectedClient, setConnectedClient] = useState<string>();
  
  const hostConnectionRef = useRef<HostConnection | null>(null);

  const host = useSignalHost({
    onMessage: (message: SignalingMessage) => handleSignalMessage(message),
    onClientJoined: (clientId: string) => {
      if (debug) console.log(`[WebRTC Host] Client ${clientId} joined`);
      // Only allow one client at a time
      if (!connectedClient) {
        setConnectedClient(clientId);
      } else {
        if (debug) console.warn(`[WebRTC Host] Ignoring additional client ${clientId} - already connected to ${connectedClient}`);
      }
    },
    onClientDisconnected: (clientId: string) => {
      if (debug) console.log(`[WebRTC Host] Client ${clientId} disconnected`);
      if (connectedClient === clientId) {
        setConnectedClient(undefined);
        close();
      }
    },
  });

  const sendSignal = useCallback(
    async (payload: WebRTCSignalPayload, targetClientId?: string) => {
      const clientId = targetClientId || connectedClient;
      if (!clientId) return;
      const serialized = JSON.stringify(payload);
      host.sendMessageToClient(clientId, serialized);
    },
    [host, connectedClient]
  );

  const createHostConnection = useCallback((clientId: string): HostConnection => {
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

    const logger = config.logger || createLogger(`WebRTC Host${clientId ? ` Client ${clientId}` : ''}`, consoleLogger);
    
    const eventHandlers = createWebRTCEventHandlers({
      role: 'host',
      clientId,
      pc,
      watchdog,
      sendSignal: (payload) => sendSignal(payload, clientId),
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        setDataChannelState(hostConnectionRef.current?.dc?.readyState);

        if (debug && (state === 'connected' || state === 'failed')) {
          console.log(`[WebRTC Host] Client ${clientId}: ${state}`);
        }

        config.onConnectionStateChange?.(state);
      },
      onIceConnectionStateChange: (state) => {
        if (debug && (state === 'connected' || state === 'failed')) {
          console.log(`[WebRTC Host] Client ${clientId} ICE: ${state}`);
        }
        config.onIceConnectionStateChange?.(state);
      },
      onIceCandidate: (candidate, connectionType) => {
        config.onIceCandidate?.(candidate, connectionType);
      },
      onChannelOpen: config.onChannelOpen,
      onChannelClose: config.onChannelClose,
      onChannelMessage: config.onChannelMessage,
      browserInfo,
      debug,
      logger,
    });

    attachEventHandlers(pc, eventHandlers, debug);

    // Set up data channel handling for this host connection
    pc.ondatachannel = (evt) => {
      const dc = evt.channel;
      // Update the host connection with the data channel
      if (hostConnectionRef.current) {
        hostConnectionRef.current.dc = dc;
      }

      if (debug) console.log(`[WebRTC Host] Data channel received from client ${clientId}: ${dc.readyState}`);

      setupDataChannel(dc, {
        onOpen: (readyState) => {
          setDataChannelState(readyState);
        },
        onClose: (readyState) => {
          setDataChannelState(readyState);
        },
        onMessage: config.onChannelMessage,
        onDataChannelReady: config.onDataChannelReady,
        debug,
        role: 'host',
        clientId,
      });
    };

    return { pc, dc: null, watchdog, iceCandidateManager, clientId };
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

        // Only allow one client connection at a time
        if (hostConnectionRef.current && hostConnectionRef.current.clientId !== message.clientId) {
          if (debug) console.warn(`[WebRTC Host] Rejecting offer from ${message.clientId} - already connected to ${hostConnectionRef.current.clientId}`);
          
          // Send a rejection message to the client
          await sendSignal({ 
            kind: 'webrtc-rejection', 
            reason: 'Host is already connected to another client',
            connectedClientId: hostConnectionRef.current.clientId 
          }, message.clientId);
          return;
        }

        let hostConn = hostConnectionRef.current;
        if (!hostConn) {
          hostConn = createHostConnection(message.clientId);
          hostConnectionRef.current = hostConn;
        }

        const pc = hostConn.pc;

        if (debug) console.log(`[WebRTC Host] Received offer from client ${message.clientId}`);
        await pc.setRemoteDescription(parsed.sdp);

        const answer = await pc.createAnswer({});
        await pc.setLocalDescription(answer);

        if (debug) console.log(`[WebRTC Host] Sending answer to client ${message.clientId}`);
        await sendSignal({ kind: 'webrtc-answer', sdp: answer }, message.clientId);

        // Add any pending ICE candidates for this client
        await hostConn.iceCandidateManager.addPendingCandidates(pc, message.clientId);
      } else if (parsed.kind === 'webrtc-answer') {
        // Host doesn't receive answers, only sends them
        if (debug) console.warn('[WebRTC Host] Unexpected answer received from client');
      } else if (parsed.kind === 'webrtc-ice') {
        if (!message.clientId) return;

        const hostConn = hostConnectionRef.current;
        if (!hostConn || hostConn.clientId !== message.clientId) return;

        await hostConn.iceCandidateManager.addCandidate(hostConn.pc, parsed.candidate, message.clientId);
      }
    } catch (error) {
      if (debug) {
        console.error(`[WebRTC Host] Error handling ${parsed.kind}:`, error);
      }
    }
  }, [createHostConnection, sendSignal, debug]);

  const createOrEnsureConnection = useCallback(async () => {
    try {
      if (!host.hostId) {
        await host.connect();
        await host.registerHost(1); // Set maxClients to 1 for single-client mode
      }
    } catch (error) {
      if (debug) console.error('[WebRTC Host] Connection failed:', error);
      config.onConnectionFailed?.(error instanceof Error ? error : new Error('Connection failed'));
      throw error;
    }
  }, [host, config, debug]);

  const send = useCallback((data: string | ArrayBuffer | Blob) => {
    const hostConn = hostConnectionRef.current;
    if (hostConn?.dc && hostConn.dc.readyState === 'open') {
      hostConn.dc.send(data as any);
    }
  }, []);

  const getDataChannel = useCallback((): RTCDataChannel | null => {
    const hostConn = hostConnectionRef.current;
    return hostConn?.dc || null;
  }, []);

  const getPeerConnection = useCallback((): RTCPeerConnection | null => {
    const hostConn = hostConnectionRef.current;
    return hostConn?.pc || null;
  }, []);


  const close = useCallback(() => {
    const hostConn = hostConnectionRef.current;
    if (hostConn) {
      hostConn.watchdog.clearTimeouts();
      hostConn.iceCandidateManager.clear();
      hostConn.dc?.close();
      hostConn.pc.close();
      hostConnectionRef.current = null;
    }
    setConnectionState('new');
    setDataChannelState(undefined);
    setConnectedClient(undefined);
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
    getDataChannel,
    getPeerConnection,
    role: 'host' as const,
    peerId: host.hostId,
    connectedClient,
  };
}