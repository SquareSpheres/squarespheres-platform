'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignalClient, SignalingMessage } from './useSignalingClient';
import { WebRTCPeerConfig, WebRTCSignalPayload } from './webrtcTypes';
import {
  createPeerConnection,
  attachEventHandlers,
  createDataChannel,
  createWebRTCEventHandlers,
  setupDataChannel,
  ICECandidateManager,
  ConnectionWatchdog,
  createConnectionWatchdog,
  WatchdogConfig,
  DEFAULT_ICE_SERVERS,
} from './webrtcUtils';
import { useWebRTCConfig } from './useWebRTCConfig';
import { safeDetectBrowser } from '../utils/ssrUtils';
import { createLogger, consoleLogger } from '../types/logger';
import { createClientDebugLogger } from '../utils/webrtcClientDebug';

export interface WebRTCClientPeerApi {
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  send: (data: string | ArrayBuffer | Blob) => void;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  disconnect: () => void;
  getPeerConnection: () => RTCPeerConnection | null;
  role: 'client';
  peerId?: string;
}

export function useWebRTCClientPeer(config: WebRTCPeerConfig): WebRTCClientPeerApi {
  const debug = config.debug ?? false;
  const debugLogger = useMemo(() => createClientDebugLogger(debug), [debug]);

  // SSR-safe browser detection
  const [browserInfo, setBrowserInfo] = useState(() => safeDetectBrowser());

  useEffect(() => {
    setBrowserInfo(safeDetectBrowser());
  }, []);

  // Use dynamic TURN servers with fallback to default STUN servers
  const { iceServers, usingTurnServers, isLoadingTurnServers } = useWebRTCConfig({
    includeTurnServers: true,
    fallbackIceServers: config.iceServers ?? DEFAULT_ICE_SERVERS
  });
  const connectionTimeoutMs = config.connectionTimeoutMs ?? (browserInfo.isChrome ? 45000 : browserInfo.isSafari ? 60000 : 30000);
  const iceGatheringTimeoutMs = config.iceGatheringTimeoutMs ?? (browserInfo.isChrome ? 20000 : browserInfo.isSafari ? 25000 : 15000);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const connectedClientIdRef = useRef<string | null>(null);
  const iceCandidateManagerRef = useRef<ICECandidateManager | null>(null);
  const watchdogRef = useRef<ConnectionWatchdog | null>(null);
  
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [dataChannelState, setDataChannelState] = useState<RTCDataChannelState>();

  const client = useSignalClient({
    onMessage: (message: SignalingMessage) => handleSignalMessage(message),
  });

  const sendSignal = useCallback(
    async (payload: WebRTCSignalPayload) => {
      const serialized = JSON.stringify(payload);
      client.sendMessageToHost(serialized);
    },
    [client]
  );

  const createWatchdog = useCallback((): ConnectionWatchdog => {
    const watchdogConfig: WatchdogConfig = {
      connectionTimeoutMs,
      iceGatheringTimeoutMs,
      browserInfo,
      onConnectionTimeout: () => {
        debugLogger.logConnectionTimeout();
        config.onConnectionTimeout?.();
      },
      onConnectionFailed: (error) => {
        debugLogger.logConnectionFailed(error);
        config.onConnectionFailed?.(error);
      },
      debug,
    };

    return createConnectionWatchdog(watchdogConfig);
  }, [connectionTimeoutMs, iceGatheringTimeoutMs, browserInfo, config, debug, debugLogger]);

  const ensurePeerConnection = useCallback(async () => {
    if (pcRef.current) return;

    const pc = createPeerConnection({
      iceServers,
      browserInfo,
      debug,
    });

    const watchdog = createWatchdog();
    watchdogRef.current = watchdog;

    const iceCandidateManager = new ICECandidateManager(browserInfo, debug, 'client');
    iceCandidateManagerRef.current = iceCandidateManager;

    const logger = config.logger || createLogger('WebRTC Client', consoleLogger);

    const eventHandlers = createWebRTCEventHandlers({
      role: 'client',
      pc,
      watchdog,
      sendSignal,
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        config.onConnectionStateChange?.(state);

        debugLogger.logConnectionState(state);

        if (state === 'failed' && watchdog.canRetry()) {
          debugLogger.logConnectionRetryAttempt();
          watchdog.startRetry();

          setTimeout(() => {
            if (pcRef.current?.connectionState === 'failed') {
              debugLogger.logRetrying();
              pcRef.current?.close();
              pcRef.current = null;
              dcRef.current = null;
              setConnectionState('new');
              setDataChannelState(undefined);
              iceCandidateManager.clear();

              // Retry by calling ensurePeerConnection directly
              ensurePeerConnection().catch(error => {
                debugLogger.logRetryFailed(error);
                watchdog.endRetry();
              }).finally(() => {
                watchdog.endRetry();
              });
            } else {
              watchdog.endRetry();
            }
          }, watchdog.getRetryDelay());
        }
      },
      onIceConnectionStateChange: (state) => {
        debugLogger.logIceState(state);
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
    
    // Set up data channel handling for client
    pc.ondatachannel = (evt) => {
      const dc = evt.channel;
      dcRef.current = dc;

      debugLogger.logDataChannelReceived(dc.readyState);

      setupDataChannel(dc, {
        onOpen: (readyState) => setDataChannelState(readyState),
        onClose: (readyState) => setDataChannelState(readyState),
        onMessage: config.onChannelMessage,
        onDataChannelReady: config.onDataChannelReady,
        debug,
        role: 'client',
      });
    };
    
    pcRef.current = pc;
  }, [iceServers, browserInfo, debug, createWatchdog, config, sendSignal, debugLogger]);

  const handleSignalMessage = useCallback(async (message: SignalingMessage) => {
    if (!message.payload) return;

    let parsed: WebRTCSignalPayload | undefined;
    try {
      parsed = JSON.parse(message.payload);
    } catch (error) {
      debugLogger.logParseFailed(error);
      return;
    }

    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return;

    try {
      if (parsed.kind === 'webrtc-offer') {
        const pc = pcRef.current;
        if (!pc) return;

        debugLogger.logReceivedOffer();
        connectedClientIdRef.current = message.clientId || null;
        await pc.setRemoteDescription(parsed.sdp);

        const answer = await pc.createAnswer({});
        await pc.setLocalDescription(answer);

        debugLogger.logSendingAnswer();
        await sendSignal({ kind: 'webrtc-answer', sdp: answer });
      } else if (parsed.kind === 'webrtc-answer') {
        const pc = pcRef.current;
        if (!pc) return;

        debugLogger.logReceivedAnswer();
        await pc.setRemoteDescription(parsed.sdp);

        // Add any pending ICE candidates
        await iceCandidateManagerRef.current?.addPendingCandidates(pc);

        debugLogger.logIceDiagnostics(pc);

        // Set a timeout to detect if ICE connection gets stuck
        if (pc.iceConnectionState === 'new' || pc.iceConnectionState === 'checking') {
          debugLogger.logIceConnectionTimeout();
          setTimeout(() => {
            if (pc.iceConnectionState === 'new' || pc.iceConnectionState === 'checking') {
              debugLogger.logIceConnectionStuck(pc.iceConnectionState);
              try {
                pc.restartIce();
              } catch (error) {
                debugLogger.logIceRestartFailed(error);
              }
            }
          }, 15000); // Increased timeout for cross-network connections
        }
      } else if (parsed.kind === 'webrtc-ice') {
        const pc = pcRef.current;
        if (!pc) return;

        await iceCandidateManagerRef.current?.addCandidate(pc, parsed.candidate);
      } else if (parsed.kind === 'webrtc-rejection') {
        debugLogger.logConnectionRejected(parsed.reason);
        config.onConnectionRejected?.(parsed.reason, parsed.connectedClientId);
        
        // Close the peer connection since we were rejected
        const pc = pcRef.current;
        if (pc) {
          pc.close();
          pcRef.current = null;
        }
      }
    } catch (error) {
      debugLogger.logSignalingError(parsed.kind, error);
    }
  }, [sendSignal, config, debugLogger]);

  const createOrEnsureConnection = useCallback(async () => {
    try {
      await ensurePeerConnection();

      if (config.hostId) {
        let clientId: string;
        if (!client.clientId) {
          await client.connect();
          clientId = await client.joinHost(config.hostId);
        } else {
          clientId = client.clientId;
        }

        const pc = pcRef.current!;
        const dc = createDataChannel(pc, clientId, browserInfo, debug);
        dcRef.current = dc;
        setDataChannelState(dc.readyState);

        setupDataChannel(dc, {
          onOpen: (readyState) => setDataChannelState(readyState),
          onClose: (readyState) => setDataChannelState(readyState),
          onMessage: config.onChannelMessage,
          onDataChannelReady: config.onDataChannelReady,
          debug,
          role: 'client',
        });

        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        
        // Wait for ICE gathering to complete before sending offer
        if (pc.iceGatheringState === 'gathering') {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              debugLogger.logIceGatheringTimeout();
              resolve();
            }, iceGatheringTimeoutMs * 2); // Double timeout for cross-network

            const checkGathering = () => {
              if (pc.iceGatheringState === 'complete') {
                clearTimeout(timeout);
                resolve();
              } else if (pc.iceGatheringState === 'new') {
                setTimeout(checkGathering, 100);
              } else {
                setTimeout(checkGathering, 100);
              }
            };
            checkGathering();
          });
        }
        
        // Small delay for Chrome compatibility
        await new Promise(resolve => setTimeout(resolve, 100));
        
        debugLogger.logSendingOffer();
        await sendSignal({ kind: 'webrtc-offer', sdp: offer });
      }
    } catch (error) {
      debugLogger.logConnectionFailed(error);
      config.onConnectionFailed?.(error instanceof Error ? error : new Error('Connection failed'));
      throw error;
    }
  }, [client, config, ensurePeerConnection, sendSignal, iceGatheringTimeoutMs, browserInfo, debug, debugLogger]);

  const send = useCallback((data: string | ArrayBuffer | Blob) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') {
      dc.send(data as any);
    }
  }, []);

  const close = useCallback(() => {
    if (watchdogRef.current) {
      watchdogRef.current.clearTimeouts();
    }

    iceCandidateManagerRef.current?.clear();

    dcRef.current?.close();
    pcRef.current?.close();
    dcRef.current = null;
    pcRef.current = null;
  }, []);

  const getPeerConnection = useCallback((): RTCPeerConnection | null => {
    return pcRef.current;
  }, []);

  const disconnect = useCallback(() => {
    close();
    client.disconnect();
    debugLogger.logFullyDisconnected();
  }, [close, client, debugLogger]);

  useEffect(() => () => close(), [close]);

  return {
    connectionState,
    dataChannelState,
    send,
    createOrEnsureConnection,
    close,
    disconnect,
    getPeerConnection,
    role: 'client' as const,
    peerId: client.clientId,
  };
}