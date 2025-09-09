'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignalHost, useSignalClient, SignalingMessage } from './useSignalingClient';
import { WebRTCPeerConfig, WebRTCSignalPayload } from './webrtcTypes';

export interface WebRTCPeerApi {
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | undefined;
  send: (data: string | ArrayBuffer | Blob) => void;
  createOrEnsureConnection: () => Promise<void>;
  close: () => void;
  role: 'host' | 'client';
  peerId?: string; // hostId for host, clientId for client
}

// Default ICE servers: public STUN. TODO: Add TURN (e.g., coturn) with credentials.
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTCPeer(config: WebRTCPeerConfig): WebRTCPeerApi {
  const iceServers = useMemo(() => config.iceServers ?? DEFAULT_ICE_SERVERS, [config.iceServers]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const connectedClientIdRef = useRef<string | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [dataChannelState, setDataChannelState] = useState<RTCDataChannelState>();

  const host = useSignalHost({
    onMessage: (m) => handleSignalMessage(m),
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
      
      const pc = pcRef.current;
      if (!pc) return;

      if (parsed.kind === 'webrtc-offer') {
        if (config.role === 'host' && message.clientId) {
          connectedClientIdRef.current = message.clientId;
        }
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
            console.warn(`[WebRTC ${config.role}] Failed to add ICE candidate:`, error);
          }
        }
      }
    },
    [sendSignal, config.role]
  );

  const ensurePeerConnection = useCallback(async () => {
    if (pcRef.current) return;
    
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setConnectionState(state);
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
  }, [client, host, config, ensurePeerConnection, sendSignal]);

  const send = useCallback((data: string | ArrayBuffer | Blob) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') {
      dc.send(data as any);
    }
  }, []);

  const close = useCallback(() => {
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
    role: config.role,
    peerId: config.role === 'host' ? host.hostId : client.clientId,
  };
}


