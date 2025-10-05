'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSignalClient, SignalingMessage } from './useSignalingClient';
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
  isChrome,
  DEFAULT_ICE_SERVERS,
} from './webrtcUtils';
import { detectBrowser } from '../utils/browserUtils';

export interface WebRTCClientPeerApi {
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  send: (data: string | ArrayBuffer | Blob) => void;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  disconnect: () => void;
  role: 'client';
  peerId?: string;
}

export function useWebRTCClientPeer(config: WebRTCPeerConfig): WebRTCClientPeerApi {
  const debug = config.debug ?? false;

  // Defer browser detection to avoid SSR issues
  const [browserInfo, setBrowserInfo] = useState(detectBrowser());

  useEffect(() => {
    setBrowserInfo(detectBrowser());
  }, []);

  const iceServers = config.iceServers ?? DEFAULT_ICE_SERVERS;
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
        if (debug) console.warn('[WebRTC Client] Connection timeout');
        config.onConnectionTimeout?.();
      },
      onConnectionFailed: (error) => {
        if (debug) console.error('[WebRTC Client] Connection failed:', error);
        config.onConnectionFailed?.(error);
      },
      debug,
    };

    return createConnectionWatchdog(watchdogConfig);
  }, [connectionTimeoutMs, iceGatheringTimeoutMs, browserInfo, config, debug]);

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

    const eventHandlers = createWebRTCEventHandlers({
      role: 'client',
      pc,
      watchdog,
      sendSignal,
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        config.onConnectionStateChange?.(state);

        if (state === 'failed' && watchdog.canRetry()) {
          if (debug) console.log('[WebRTC Client] Attempting connection retry');
          watchdog.startRetry();

          setTimeout(() => {
            if (pcRef.current?.connectionState === 'failed') {
              if (debug) console.log('[WebRTC Client] Retrying connection...');
              pcRef.current?.close();
              pcRef.current = null;
              dcRef.current = null;
              setConnectionState('new');
              setDataChannelState(undefined);
              iceCandidateManager.clear();

              // Retry by calling ensurePeerConnection directly
              ensurePeerConnection().catch(error => {
                if (debug) console.error('[WebRTC Client] Retry failed:', error);
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
        if (debug) console.log(`[WebRTC Client] ICE connection state: ${state}`);
        config.onIceConnectionStateChange?.(state);
      },
      onChannelOpen: config.onChannelOpen,
      onChannelClose: config.onChannelClose,
      onChannelMessage: config.onChannelMessage,
      browserInfo,
      debug,
    });

    attachEventHandlers(pc, eventHandlers, debug);
    
    // Set up data channel handling for client
    pc.ondatachannel = (evt) => {
      const dc = evt.channel;
      dcRef.current = dc;

      if (debug) console.log(`[WebRTC Client] Data channel received: ${dc.readyState}`);

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
  }, [iceServers, browserInfo, debug, createWatchdog, config, sendSignal]);

  const handleSignalMessage = useCallback(async (message: SignalingMessage) => {
    if (!message.payload) return;

    let parsed: WebRTCSignalPayload | undefined;
    try {
      parsed = JSON.parse(message.payload);
    } catch (error) {
      if (debug) {
        console.warn('[WebRTC Client] Failed to parse signaling message:', error);
      }
      return;
    }

    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return;

    try {
      if (parsed.kind === 'webrtc-offer') {
        const pc = pcRef.current;
        if (!pc) return;

        if (debug) console.log('[WebRTC Client] Received offer from host');
        connectedClientIdRef.current = message.clientId || null;
        await pc.setRemoteDescription(parsed.sdp);

        const answer = await pc.createAnswer({});
        await pc.setLocalDescription(answer);

        if (debug) console.log('[WebRTC Client] Sending answer to host');
        await sendSignal({ kind: 'webrtc-answer', sdp: answer });
      } else if (parsed.kind === 'webrtc-answer') {
        const pc = pcRef.current;
        if (!pc) return;

        if (debug) console.log('[WebRTC Client] Received answer from host');
        await pc.setRemoteDescription(parsed.sdp);

        // Add any pending ICE candidates
        await iceCandidateManagerRef.current?.addPendingCandidates(pc);

        if (debug) {
          console.log('[WebRTC Client] ICE connection state after adding pending candidates:', pc.iceConnectionState);
          console.log('[WebRTC Client] ICE gathering state:', pc.iceGatheringState);
          console.log('[WebRTC Client] Connection state:', pc.connectionState);
        }

        // Set a timeout to detect if ICE connection gets stuck
        if (pc.iceConnectionState === 'new' || pc.iceConnectionState === 'checking') {
          if (debug) console.log('[WebRTC Client] Setting ICE connection timeout');
          setTimeout(() => {
            if (pc.iceConnectionState === 'new' || pc.iceConnectionState === 'checking') {
              if (debug) console.warn(`[WebRTC Client] ICE connection stuck in ${pc.iceConnectionState} state, attempting restart`);
              try {
                pc.restartIce();
              } catch (error) {
                if (debug) console.error('[WebRTC Client] ICE restart failed:', error);
              }
            }
          }, 15000); // Increased timeout for cross-network connections
        }
      } else if (parsed.kind === 'webrtc-ice') {
        const pc = pcRef.current;
        if (!pc) return;

        await iceCandidateManagerRef.current?.addCandidate(pc, parsed.candidate);
      }
    } catch (error) {
      if (debug) {
        console.error(`[WebRTC Client] Error handling ${parsed.kind}:`, error);
      }
    }
  }, [debug, sendSignal]);

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
              if (debug) console.warn('[WebRTC Client] ICE gathering timeout, proceeding anyway');
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
        
        if (debug) console.log('[WebRTC Client] Sending offer to host');
        await sendSignal({ kind: 'webrtc-offer', sdp: offer });
      }
    } catch (error) {
      if (debug) console.error('[WebRTC Client] Connection failed:', error);
      config.onConnectionFailed?.(error instanceof Error ? error : new Error('Connection failed'));
      throw error;
    }
  }, [client, config, ensurePeerConnection, sendSignal, iceGatheringTimeoutMs, browserInfo, debug]);

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

  const disconnect = useCallback(() => {
    close();
    client.disconnect();
    if (debug) console.log('[WebRTC Client] Fully disconnected - WebRTC and signaling');
  }, [close, client, debug]);

  useEffect(() => () => close(), [close]);

  return {
    connectionState,
    dataChannelState,
    send,
    createOrEnsureConnection,
    close,
    disconnect,
    role: 'client' as const,
    peerId: client.clientId,
  };
}