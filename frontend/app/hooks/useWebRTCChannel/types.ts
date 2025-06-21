export interface WebRTCChannel {
  createOffer: () => Promise<RTCSessionDescriptionInit>
  createOfferNoTrickle?: () => Promise<RTCSessionDescriptionInit>
  createAnswer: () => Promise<RTCSessionDescriptionInit>
  createAnswerNoTrickle?: () => Promise<RTCSessionDescriptionInit>
  setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>
  sendChunk: (data: Uint8Array) => void
  onChunkReceived: (callback: (data: Uint8Array) => void) => void
  onConnectionEstablished?: (callback: () => void) => void
  connectionState: string
  localIceCandidates: RTCIceCandidateInit[]
} 