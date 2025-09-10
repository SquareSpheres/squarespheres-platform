'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSignalClient, SignalingMessage } from './useSignalingClient';
import { WebRTCPeerConfig, WebRTCSignalPayload } from './webrtcTypes';
import {
  createPeerConnection,
  attachEventHandlers,
  createDataChannel,
  ConnectionWatchdog,
  ConnectionWatchdogConfig,
  isChrome,
  DEFAULT_ICE_SERVERS,
  EventHandlers,
} from './webrtcUtils';

export interface WebRTCClientPeerApi {
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  send: (data: string | ArrayBuffer | Blob) => void;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  role: 'client';
  peerId?: string;
}

export function useWebRTCClientPeer(config: WebRTCPeerConfig): WebRTCClientPeerApi {
  const debug = config.debug ?? false;
  const isChromeBrowser = isChrome();
  
  const iceServers = config.iceServers ?? DEFAULT_ICE_SERVERS;
  const connectionTimeoutMs = config.connectionTimeoutMs ?? (isChromeBrowser ? 45000 : 30000);
  const iceGatheringTimeoutMs = config.iceGatheringTimeoutMs ?? (isChromeBrowser ? 20000 : 15000);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const connectedClientIdRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
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
    const watchdogConfig: ConnectionWatchdogConfig = {
      connectionTimeoutMs,
      iceGatheringTimeoutMs,
      maxRetries: isChromeBrowser ? 1 : 2,
      retryDelayMs: isChromeBrowser ? 8000 : 3000,
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

    return new ConnectionWatchdog(watchdogConfig);
  }, [connectionTimeoutMs, iceGatheringTimeoutMs, isChromeBrowser, config, debug]);

  const ensurePeerConnection = useCallback(async () => {
    if (pcRef.current) return;

    const pc = createPeerConnection({
      iceServers,
      isChrome: isChromeBrowser,
      debug,
    });

    const watchdog = createWatchdog();
    watchdogRef.current = watchdog;

    const eventHandlers: EventHandlers = {
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        watchdog.handleConnectionStateChange(state);
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
              pendingIceCandidatesRef.current = [];
              
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
      onDataChannelStateChange: (state) => {
        setDataChannelState(state);
      },
      onChannelOpen: () => {
        if (debug) console.log('[WebRTC Client] Data channel opened');
        config.onChannelOpen?.();
      },
      onChannelClose: () => {
        if (debug) console.log('[WebRTC Client] Data channel closed');
        config.onChannelClose?.();
      },
      onChannelMessage: (data) => {
        config.onChannelMessage?.(data);
      },
      onIceCandidate: (candidate) => {
        if (candidate) {
          if (debug) console.log('[WebRTC Client] ICE candidate:', candidate.candidate);
          sendSignal({ kind: 'webrtc-ice', candidate });
        } else {
          if (debug) console.log('[WebRTC Client] ICE gathering completed - sending end-of-candidates');
          sendSignal({ kind: 'webrtc-ice', candidate: null as any });
        }
      },
      onIceGatheringStateChange: (state) => {
        if (debug) console.log('[WebRTC Client] ICE gathering state:', state);
      },
      onIceConnectionStateChange: (state) => {
        if (debug) console.log('[WebRTC Client] ICE connection state:', state);
        
        if (state === 'failed') {
          if (debug) console.warn('[WebRTC Client] ICE connection failed');
          if (isChromeBrowser && pcRef.current?.remoteDescription) {
            if (debug) console.log('[WebRTC Client] Chrome ICE failed - attempting immediate restart');
            try {
              pcRef.current.restartIce();
            } catch (error) {
              if (debug) console.error('[WebRTC Client] ICE restart failed:', error);
            }
          }
        } else if (state === 'disconnected') {
          if (debug) console.warn('[WebRTC Client] ICE connection disconnected, waiting for reconnection...');
          if (isChromeBrowser && pcRef.current?.remoteDescription) {
            setTimeout(() => {
              if (pcRef.current?.iceConnectionState === 'disconnected') {
                if (debug) console.log('[WebRTC Client] Chrome ICE still disconnected, attempting restart');
                try {
                  pcRef.current.restartIce();
                } catch (error) {
                  if (debug) console.error('[WebRTC Client] ICE restart failed:', error);
                }
              }
            }, 2000);
          }
        } else if (state === 'connected') {
          if (debug) console.log('[WebRTC Client] ICE connection established!');
        }
      },
    };

    attachEventHandlers(pc, eventHandlers, debug);
    
    // Set up data channel handling for client
    pc.ondatachannel = (evt) => {
      const dc = evt.channel;
      dcRef.current = dc;
      setDataChannelState(dc.readyState);
      
      if (debug) console.log(`[WebRTC Client] Data channel received: ${dc.readyState}`);
      
      dc.onopen = () => {
        if (debug) console.log('[WebRTC Client] Data channel opened');
        setDataChannelState(dc.readyState);
        config.onChannelOpen?.();
      };
      
      dc.onclose = () => {
        if (debug) console.log('[WebRTC Client] Data channel closed');
        setDataChannelState(dc.readyState);
        config.onChannelClose?.();
      };
      
      dc.onmessage = (e) => {
        config.onChannelMessage?.(e.data);
      };
    };
    
    pcRef.current = pc;
  }, [iceServers, isChromeBrowser, debug, createWatchdog, config, sendSignal]);

  const handleOfferMessage = useCallback(async (message: SignalingMessage, sdp: RTCSessionDescriptionInit) => {
    const pc = pcRef.current;
    if (!pc) return;

    if (debug) console.log('[WebRTC Client] Received offer from host');
    connectedClientIdRef.current = message.clientId || null;
    await pc.setRemoteDescription(sdp);
    
    const answer = await pc.createAnswer({});
    await pc.setLocalDescription(answer);
    
    if (debug) console.log('[WebRTC Client] Sending answer to host');
    await sendSignal({ kind: 'webrtc-answer', sdp: answer });
  }, [sendSignal, debug]);

  const handleAnswerMessage = useCallback(async (message: SignalingMessage, sdp: RTCSessionDescriptionInit) => {
    const pc = pcRef.current;
    if (!pc) return;

    if (debug) console.log('[WebRTC Client] Received answer from host');
    await pc.setRemoteDescription(sdp);
    
    // Add any pending ICE candidates
    for (const candidate of pendingIceCandidatesRef.current) {
      try {
        if (debug) console.log('[WebRTC Client] Adding pending ICE candidate:', candidate.candidate);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        if (debug) console.log('[WebRTC Client] Successfully added pending ICE candidate');
      } catch (error) {
        if (debug) console.warn('[WebRTC Client] Failed to add pending ICE candidate:', error);
      }
    }
    pendingIceCandidatesRef.current = [];
    
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
      }, 10000);
    }
  }, [debug]);

  const handleIceCandidateMessage = useCallback(async (message: SignalingMessage, candidate: RTCIceCandidateInit | null) => {
    const pc = pcRef.current;
    if (!pc) return;

    if (candidate !== null && candidate !== undefined) {
      try {
        if (debug) console.log('[WebRTC Client] Adding ICE candidate from host:', candidate.candidate);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        if (debug) console.warn('[WebRTC Client] Failed to add ICE candidate:', error);
        
        if (pc.remoteDescription === null) {
          if (debug) console.log('[WebRTC Client] Storing ICE candidate as pending');
          pendingIceCandidatesRef.current.push(candidate);
        } else if (isChromeBrowser && (error as Error).name === 'OperationError') {
          if (debug) console.log('[WebRTC Client] Chrome ICE candidate error (likely duplicate), ignoring');
        } else {
          if (debug) console.warn('[WebRTC Client] ICE candidate addition failed but remote description is set - this might be normal');
        }
      }
    } else {
      if (debug) console.log('[WebRTC Client] Received end-of-candidates from host');
    }
  }, [isChromeBrowser, debug]);

  const handleSignalMessage = useCallback(
    async (message: SignalingMessage) => {
      if (!message.payload) return;
      
      let parsed: WebRTCSignalPayload | undefined;
      try {
        parsed = JSON.parse(message.payload);
      } catch (error) {
        if (debug) console.warn('[WebRTC Client] Failed to parse signaling message:', error);
        return;
      }

      if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return;

      if (parsed.kind === 'webrtc-offer') {
        await handleOfferMessage(message, parsed.sdp);
      } else if (parsed.kind === 'webrtc-answer') {
        await handleAnswerMessage(message, parsed.sdp);
      } else if (parsed.kind === 'webrtc-ice') {
        await handleIceCandidateMessage(message, parsed.candidate);
      }
    },
    [debug, handleOfferMessage, handleAnswerMessage, handleIceCandidateMessage]
  );

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
        const dc = createDataChannel(pc, clientId, isChromeBrowser, debug);
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

        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        
        // Wait for ICE gathering to complete before sending offer
        if (pc.iceGatheringState === 'gathering') {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              if (debug) console.warn('[WebRTC Client] ICE gathering timeout, proceeding anyway');
              resolve();
            }, iceGatheringTimeoutMs);
            
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
  }, [client, config, ensurePeerConnection, sendSignal, iceGatheringTimeoutMs, isChromeBrowser, debug]);

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
    
    pendingIceCandidatesRef.current = [];
    
    dcRef.current?.close();
    pcRef.current?.close();
    dcRef.current = null;
    pcRef.current = null;
  }, []);

  useEffect(() => () => close(), [close]);

  return {
    connectionState,
    dataChannelState,
    send,
    createOrEnsureConnection,
    close,
    role: 'client' as const,
    peerId: client.clientId,
  };
}