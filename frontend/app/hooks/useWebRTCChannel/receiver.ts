import { useRef, useState, useCallback } from 'react'
import { WebRTCChannel } from './types'

const rawIceServers: (RTCIceServer | undefined)[] = [
  process.env.NEXT_PUBLIC_STUN_SERVER
    ? { urls: process.env.NEXT_PUBLIC_STUN_SERVER as string }
    : undefined,
  process.env.NEXT_PUBLIC_TURN_SERVER
    ? {
        urls: process.env.NEXT_PUBLIC_TURN_SERVER as string,
        username: process.env.NEXT_PUBLIC_TURN_USERNAME,
        credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
      }
    : undefined,
]
const iceServers: RTCIceServer[] = rawIceServers.filter((s): s is RTCIceServer => !!s)

// Helper to wait for ICE gathering to complete
async function waitForIceGatheringComplete(
  pc: RTCPeerConnection,
  timeoutMs = 5000
): Promise<void> {
  if (pc.iceGatheringState === 'complete') return;

  return new Promise<void>((resolve, reject) => {
    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        cleanup();
        resolve();
      }
    };

    const onTimeout = () => {
      cleanup();
      reject(new Error('ICE gathering timed out'));
    };

    const cleanup = () => {
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      clearTimeout(timeoutId);
    };

    pc.addEventListener('icegatheringstatechange', onStateChange);

    // Double-check in case the state changed before the listener was added
    if (pc.iceGatheringState === 'complete') {
      cleanup();
      resolve();
      return;
    }

    const timeoutId = setTimeout(onTimeout, timeoutMs);
  });
}

export function useWebRTCReceiver(): WebRTCChannel {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const [connectionState, setConnectionState] = useState<string>('new')
  const chunkCallbackRef = useRef<((chunk: Uint8Array) => void) | null>(null)
  const connectionEstablishedCallbackRef = useRef<(() => void) | null>(null)
  const [localIceCandidates, setLocalIceCandidates] = useState<RTCIceCandidateInit[]>([])

  // Setup peer connection and data channel (receiver)
  const setupConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers })
    peerConnectionRef.current = pc
    console.log('[WebRTC] PeerConnection created. Initiator: false')

    // RECEIVER: Wait for the DataChannel to be created by the initiator
    pc.ondatachannel = (event) => {
      console.log('[WebRTC] DataChannel received by receiver')
      setupDataChannel(event.channel)
    }

    pc.onconnectionstatechange = () => {
      const newState = pc.connectionState
      setConnectionState(newState)
      console.log('[WebRTC] Connection state changed:', newState)
      
      // Notify when P2P connection is established
      if (newState === 'connected' && connectionEstablishedCallbackRef.current) {
        console.log('[WebRTC] P2P connection established - signaling server can close WebSocket')
        connectionEstablishedCallbackRef.current()
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        setLocalIceCandidates((prev) => [...prev, event.candidate!.toJSON()])
        console.log('[WebRTC] New local ICE candidate:', event.candidate)
        // TODO: When implementing a signaling server, send this ICE candidate to the remote peer via the signaling server here.
        // Example: signalingServer.send({ type: 'ice-candidate', candidate: event.candidate })
      }
    }
    return pc
  }, [])

  const setupDataChannel = (dc: RTCDataChannel) => {
    dataChannelRef.current = dc
    dc.binaryType = 'arraybuffer'
    console.log('[WebRTC] DataChannel setup. ReadyState:', dc.readyState)
    dc.onopen = () => {
      setConnectionState('connected')
      console.log('[WebRTC] DataChannel open')
    }
    dc.onclose = () => {
      setConnectionState('closed')
      console.log('[WebRTC] DataChannel closed')
    }
    dc.onerror = (e) => {
      setConnectionState('error')
      console.error('[WebRTC] DataChannel error:', e)
    }
    dc.onmessage = (event) => {
      console.log('[WebRTC] DataChannel message received', event.data)
      if (event.data instanceof ArrayBuffer && chunkCallbackRef.current) {
        chunkCallbackRef.current(new Uint8Array(event.data))
      }
    }
  }

  // Initiator: create offer (not used in receiver, but must be present for interface)
  const createOffer = async () => {
    throw new Error('Receiver does not create offers')
  }

  // Receiver: create answer
  const createAnswer = async () => {
    let pc = peerConnectionRef.current
    if (!pc) {
      pc = setupConnection()
    }
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return answer
  }

  // Receiver: create answer with all ICE candidates (no trickle)
  const createAnswerNoTrickle = async () => {
    let pc = peerConnectionRef.current
    if (!pc) {
      pc = setupConnection()
    }
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceGatheringComplete(pc)
    // Return the final localDescription (with all ICE candidates)
    return pc.localDescription!
  }

  // Set remote SDP (from sender)
  const setRemoteDescription = async (desc: RTCSessionDescriptionInit) => {
    let pc = peerConnectionRef.current
    if (!pc) {
      pc = setupConnection()
    }
    await pc.setRemoteDescription(new RTCSessionDescription(desc))
  }

  // Add ICE candidate
  const addIceCandidate = async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current
    if (!pc) throw new Error('PeerConnection not initialized')
    // TODO: When implementing a signaling server, call this function when you receive a remote ICE candidate from the signaling server.
    await pc.addIceCandidate(new RTCIceCandidate(candidate))
  }

  // Send chunk over DataChannel
  const sendChunk = (chunk: Uint8Array) => {
    const dc = dataChannelRef.current
    console.log('[WebRTC] sendChunk called. DataChannel state:', dc?.readyState)
    if (dc && dc.readyState === 'open') {
      console.log('[WebRTC] Sending chunk:', chunk)
      dc.send(chunk)
    } else {
      console.warn('[WebRTC] DataChannel not open, cannot send chunk')
    }
  }

  // Register callback for received chunks
  const onChunkReceived = (callback: (chunk: Uint8Array) => void) => {
    chunkCallbackRef.current = callback
  }

  // Register callback for when P2P connection is established
  const onConnectionEstablished = (callback: () => void) => {
    connectionEstablishedCallbackRef.current = callback
  }

  return {
    createOffer,
    createAnswer,
    createAnswerNoTrickle,
    setRemoteDescription,
    addIceCandidate,
    sendChunk,
    onChunkReceived,
    onConnectionEstablished,
    connectionState,
    localIceCandidates,
  }
} 