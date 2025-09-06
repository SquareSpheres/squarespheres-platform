"use client"
import { useState, useEffect } from 'react'
import { useWebRTCSender } from '../hooks/useWebRTCChannel/sender'
import { useWebRTCReceiver } from '../hooks/useWebRTCChannel/receiver'

export default function WebRTCTestPage() {
  const [role, setRole] = useState<'sender' | 'receiver' | null>(null)
  const [localSDP, setLocalSDP] = useState('')
  const [remoteSDP, setRemoteSDP] = useState('')
  const [message, setMessage] = useState('')
  const [receivedMessages, setReceivedMessages] = useState<string[]>([])
  const [sdpReady, setSdpReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remoteSdpSet, setRemoteSdpSet] = useState(false)
  const [remoteIce, setRemoteIce] = useState('')
  const [addedRemoteIce, setAddedRemoteIce] = useState<string[]>([])
  const [noTrickle, setNoTrickle] = useState(false)

  const senderChannel = useWebRTCSender()
  const receiverChannel = useWebRTCReceiver()

  let channel: typeof senderChannel
  if (role === 'sender') {
    channel = senderChannel
  } else if (role === 'receiver') {
    channel = receiverChannel
  } else {
    channel = {
      createOffer: async () => { throw new Error('No role selected') },
      createOfferNoTrickle: async () => { throw new Error('No role selected') },
      createAnswer: async () => { throw new Error('No role selected') },
      createAnswerNoTrickle: async () => { throw new Error('No role selected') },
      setRemoteDescription: async () => { throw new Error('No role selected') },
      addIceCandidate: async () => { throw new Error('No role selected') },
      sendChunk: () => {},
      onChunkReceived: () => {},
      connectionState: 'new',
      localIceCandidates: [],
    }
  }

  useEffect(() => {
    console.log('Component rendered. Current state:', {
      role,
      localSDP,
      remoteSDP,
      message,
      receivedMessages,
      sdpReady,
      error,
      connectionState: channel?.connectionState
    })
  })

  useEffect(() => {
    console.log('Role changed:', role)
  }, [role])

  useEffect(() => {
    if (channel && channel.onChunkReceived) {
      console.log('Registering onChunkReceived handler')
      channel.onChunkReceived((chunk) => {
        const decoded = new TextDecoder().decode(chunk)
        console.log('Received chunk:', chunk, 'Decoded:', decoded)
        setReceivedMessages((msgs) => [...msgs, decoded])
      })
    }
  }, [channel])

  useEffect(() => {
    if (channel) {
      console.log('WebRTC channel connection state:', channel.connectionState)
    }
  }, [channel, channel?.connectionState])

  const handleCreateOffer = async () => {
    setError(null)
    console.log('Creating offer...')
    try {
      let offer
      if (noTrickle && channel.createOfferNoTrickle) {
        offer = await channel.createOfferNoTrickle()
      } else {
        offer = await channel.createOffer()
      }
      console.log('Offer created:', offer)
      setLocalSDP(JSON.stringify(offer, null, 2))
      setSdpReady(true)
    } catch (e: any) {
      console.error('Error creating offer:', e)
      setError(e.message)
    }
  }

  const handleCreateAnswer = async () => {
    setError(null)
    console.log('Creating answer...')
    try {
      let answer
      if (noTrickle && channel.createAnswerNoTrickle) {
        answer = await channel.createAnswerNoTrickle()
      } else {
        answer = await channel.createAnswer()
      }
      console.log('Answer created:', answer)
      setLocalSDP(JSON.stringify(answer, null, 2))
      setSdpReady(true)
    } catch (e: any) {
      console.error('Error creating answer:', e)
      setError(e.message)
    }
  }

  const handleSetRemoteSDP = async () => {
    setError(null)
    console.log('Setting remote SDP:', remoteSDP)
    try {
      const desc = JSON.parse(remoteSDP)
      await channel.setRemoteDescription(desc)
      console.log('Remote SDP set successfully')
      setRemoteSdpSet(true)
    } catch (e: any) {
      console.error('Error setting remote SDP:', e)
      setError(e.message)
      setRemoteSdpSet(false)
    }
  }

  const handleSendMessage = () => {
    if (message) {
      console.log('Sending message:', message)
      channel.sendChunk(new TextEncoder().encode(message))
      setMessage('')
    } else {
      console.log('No message to send')
    }
  }

  const handleAddRemoteIce = async () => {
    setError(null)
    try {
      const candidate = JSON.parse(remoteIce)
      await channel.addIceCandidate(candidate)
      setAddedRemoteIce((prev) => [...prev, remoteIce])
      setRemoteIce('')
      console.log('Remote ICE candidate added:', candidate)
    } catch (e: any) {
      setError('Failed to add ICE candidate: ' + e.message)
    }
  }

  return (
    <div className="max-w-xl mx-auto my-8 font-sans bg-card rounded-xl shadow-lg p-8">
      <h1 className="text-2xl font-bold text-center mb-8 text-card-foreground">WebRTC Manual Signaling Test</h1>
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex justify-center gap-8">
          <label className="font-bold text-lg flex items-center gap-2 text-card-foreground">
            <input
              type="radio"
              name="role"
              value="sender"
              checked={role === 'sender'}
              onChange={() => {
                setRole('sender')
                setLocalSDP('')
                setRemoteSDP('')
                setSdpReady(false)
                setError(null)
              }}
              className="accent-primary"
            />
            Sender
          </label>
          <label className="font-bold text-lg flex items-center gap-2 text-card-foreground">
            <input
              type="radio"
              name="role"
              value="receiver"
              checked={role === 'receiver'}
              onChange={() => {
                setRole('receiver')
                setLocalSDP('')
                setRemoteSDP('')
                setSdpReady(false)
                setError(null)
              }}
              className="accent-primary"
            />
            Receiver
          </label>
        </div>
        <label className="flex items-center gap-2 mt-2 text-muted-foreground text-base">
          <input
            type="checkbox"
            checked={noTrickle}
            onChange={e => setNoTrickle(e.target.checked)}
            className="accent-primary"
          />
          No Trickle ICE (single SDP with all candidates)
        </label>
      </div>
      <div className="mb-5 text-center">
        <strong className="text-card-foreground">Connection state:</strong>{' '}
        <span className={channel.connectionState === 'connected' ? 'status-success' : 'text-muted-foreground'}>
          {channel.connectionState}
        </span>
      </div>
      {error && <div className="text-destructive mb-4 text-center">{error}</div>}

      {/* SENDER FLOW */}
      {role === 'sender' && (
        <div className="space-y-6">
          {/* Step 1: Create Offer */}
          <div>
            <div className="font-bold text-card-foreground mb-1">1. Create Offer</div>
            <button
              onClick={handleCreateOffer}
              disabled={sdpReady}
              className={`btn ${!sdpReady ? 'btn-primary' : 'btn-secondary cursor-not-allowed'}`}
            >
              Create Offer
            </button>
          </div>
          {/* Step 2: Copy Offer */}
          <div>
            <div className="font-bold text-card-foreground mb-1">2. Copy Offer and send to Receiver</div>
            <textarea
              className="w-full h-32 font-mono text-sm bg-muted border border-border rounded-md p-3 text-card-foreground resize-vertical overflow-auto select-all"
              value={localSDP}
              readOnly
            />
          </div>
          {/* Step 3: Paste Answer */}
          <div>
            <div className="font-bold text-card-foreground mb-1">3. Paste Answer from Receiver</div>
            <textarea
              className="w-full h-32 font-mono text-sm bg-muted border border-border rounded-md p-3 text-card-foreground resize-vertical overflow-auto mb-2"
              value={remoteSDP}
              onChange={(e) => setRemoteSDP(e.target.value)}
              disabled={!localSDP}
            />
          </div>
          {/* Step 4: Set Remote SDP */}
          <div>
            <div className="font-bold text-card-foreground mb-1">4. Set Remote SDP</div>
            <button
              onClick={handleSetRemoteSDP}
              disabled={!remoteSDP}
              className={`btn btn-primary mt-1 ${!remoteSDP ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Set Remote SDP
            </button>
          </div>
          {/* ICE Candidate Exchange */}
          {!noTrickle && localSDP && remoteSDP && (
            <div className="space-y-4">
              <div className="font-bold text-card-foreground mb-1">5. ICE Candidate Exchange</div>
              <div>
                <div className="text-card-foreground mb-1">Your Local ICE Candidates (copy and send to Receiver):</div>
                <ul className="bg-muted border border-border rounded-md p-3 text-card-foreground text-xs max-h-32 overflow-auto">
                  {channel.localIceCandidates.length === 0 && <li className="text-muted-foreground">(none yet)</li>}
                  {channel.localIceCandidates.map((cand, i) => (
                    <li key={i} className="mb-1 flex items-center justify-between gap-2">
                      <span className="break-all">{JSON.stringify(cand)}</span>
                      <button className="ml-2 px-2 py-1 text-xs btn btn-secondary" onClick={() => {navigator.clipboard.writeText(JSON.stringify(cand))}}>Copy</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-card-foreground mb-1">Paste Remote ICE Candidate from Receiver:</div>
                <div className="flex gap-2">
                  <textarea
                    className="w-full h-12 font-mono text-xs bg-muted border border-border rounded-md p-2 text-card-foreground"
                    value={remoteIce}
                    onChange={e => setRemoteIce(e.target.value)}
                  />
                  <button className="btn btn-primary px-3 py-1" onClick={handleAddRemoteIce} disabled={!remoteIce}>Add</button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Added: {addedRemoteIce.length}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RECEIVER FLOW */}
      {role === 'receiver' && (
        <div className="space-y-6">
          {/* Step 1: Paste Offer */}
          <div>
            <div className="font-bold text-card-foreground mb-1">1. Paste Offer from Sender</div>
            <textarea
              className="w-full h-32 font-mono text-sm bg-muted border border-border rounded-md p-3 text-card-foreground resize-vertical overflow-auto mb-2"
              value={remoteSDP}
              onChange={(e) => {
                setRemoteSDP(e.target.value)
                setRemoteSdpSet(false)
              }}
            />
          </div>
          {/* Step 2: Set Remote SDP */}
          <div>
            <div className="font-bold text-card-foreground mb-1">2. Set Remote SDP</div>
            <button
              onClick={handleSetRemoteSDP}
              disabled={!remoteSDP}
              className={`btn btn-primary mt-1 ${!remoteSDP ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Set Remote SDP
            </button>
          </div>
          {/* Step 3: Create Answer */}
          <div>
            <div className="font-bold text-card-foreground mb-1">3. Create Answer</div>
            <button
              onClick={handleCreateAnswer}
              disabled={!remoteSdpSet}
              className={`btn ${remoteSdpSet ? 'btn-primary' : 'btn-secondary cursor-not-allowed'}`}
            >
              Create Answer
            </button>
          </div>
          {/* Step 4: Copy Answer */}
          <div>
            <div className="font-bold text-card-foreground mb-1">4. Copy Answer and send to Sender</div>
            <textarea
              className="w-full h-32 font-mono text-sm bg-muted border border-border rounded-md p-3 text-card-foreground resize-vertical overflow-auto select-all"
              value={localSDP}
              readOnly
            />
          </div>
          {/* ICE Candidate Exchange */}
          {!noTrickle && localSDP && remoteSDP && (
            <div className="space-y-4">
              <div className="font-bold text-card-foreground mb-1">5. ICE Candidate Exchange</div>
              <div>
                <div className="text-card-foreground mb-1">Your Local ICE Candidates (copy and send to Sender):</div>
                <ul className="bg-muted border border-border rounded-md p-3 text-card-foreground text-xs max-h-32 overflow-auto">
                  {channel.localIceCandidates.length === 0 && <li className="text-muted-foreground">(none yet)</li>}
                  {channel.localIceCandidates.map((cand, i) => (
                    <li key={i} className="mb-1 flex items-center justify-between gap-2">
                      <span className="break-all">{JSON.stringify(cand)}</span>
                      <button className="ml-2 px-2 py-1 text-xs btn btn-secondary" onClick={() => {navigator.clipboard.writeText(JSON.stringify(cand))}}>Copy</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-card-foreground mb-1">Paste Remote ICE Candidate from Sender:</div>
                <div className="flex gap-2">
                  <textarea
                    className="w-full h-12 font-mono text-xs bg-muted border border-border rounded-md p-2 text-card-foreground"
                    value={remoteIce}
                    onChange={e => setRemoteIce(e.target.value)}
                  />
                  <button className="btn btn-primary px-3 py-1" onClick={handleAddRemoteIce} disabled={!remoteIce}>Add</button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Added: {addedRemoteIce.length}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messaging Section (only if connected) */}
      {channel.connectionState === 'connected' && (
        <div className="mb-6 mt-8">
          <div className="font-bold mb-1 text-card-foreground">Send Message:</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="input w-4/5"
            />
            <button
              onClick={handleSendMessage}
              className="btn btn-primary"
            >
              Send
            </button>
          </div>
        </div>
      )}
      {/* Received Messages (only if connected) */}
      {channel.connectionState === 'connected' && (
        <div className="mb-2">
          <strong className="text-card-foreground">Received Messages:</strong>
          <ul className="bg-muted border border-border rounded-md p-3 min-h-[40px] mt-2">
            {receivedMessages.length === 0 && <li className="text-muted-foreground">(none yet)</li>}
            {receivedMessages.map((msg, i) => (
              <li key={i} className="break-all py-0.5 text-card-foreground">{msg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
} 