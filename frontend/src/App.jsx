import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [wasmModule, setWasmModule] = useState(null)
  const [wasmResult, setWasmResult] = useState('')
  const [wasmError, setWasmError] = useState('')
  const [wsStatus, setWsStatus] = useState('Disconnected')
  const [messages, setMessages] = useState([])
  const [roomId, setRoomId] = useState('room-123')
  const ws = useRef(null)

  // Load WASM module
  useEffect(() => {
    const loadWasm = async () => {
      try {
        const wasmModule = await import('./wasm/wasm_app.js')
        await wasmModule.default()
        setWasmModule(wasmModule)
        console.log('WASM module loaded successfully')
      } catch (error) {
        console.error('Failed to load WASM:', error)
        setWasmError(`Failed to load WASM: ${error.message}`)
      }
    }

    loadWasm()
  }, [])

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      const wsUrl = `ws://localhost:8080/ws/${roomId}`
      ws.current = new WebSocket(wsUrl)

      ws.current.onopen = () => {
        setWsStatus('Connected')
        console.log('WebSocket connected')
      }

      ws.current.onmessage = (event) => {
        const message = JSON.parse(event.data)
        setMessages(prev => [...prev, { ...message, timestamp: new Date().toISOString() }])
        console.log('Received message:', message)
      }

      ws.current.onclose = () => {
        setWsStatus('Disconnected')
        console.log('WebSocket disconnected')
      }

      ws.current.onerror = (error) => {
        setWsStatus('Error')
        console.error('WebSocket error:', error)
      }
    }

    connectWebSocket()

    return () => {
      if (ws.current) {
        ws.current.close()
      }
    }
  }, [roomId])

  const testWasm = () => {
    if (!wasmModule) {
      setWasmError('WASM module not loaded')
      return
    }

    try {
      const greeting = wasmModule.greet('React')
      const sum = wasmModule.add(5, 3)
      const fib = wasmModule.fibonacci(10)
      
      const point = { x: 3, y: 4 }
      const processedData = wasmModule.process_data(point)
      
      setWasmResult(`
        Greeting: ${greeting}
        5 + 3 = ${sum}
        Fibonacci(10) = ${fib}
        Processed Data: ${JSON.stringify(processedData, null, 2)}
      `)
      setWasmError('')
    } catch (error) {
      setWasmError(`WASM error: ${error.message}`)
    }
  }

  const sendWebSocketMessage = (type, data = {}) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const message = {
        type,
        room_id: roomId,
        client_id: 'react-client',
        ...data
      }
      ws.current.send(JSON.stringify(message))
    }
  }

  const joinRoom = () => {
    sendWebSocketMessage('join')
  }

  const leaveRoom = () => {
    sendWebSocketMessage('leave')
  }

  const sendOffer = () => {
    sendWebSocketMessage('offer', {
      from: 'react-client',
      to: 'other-client',
      sdp: 'mock-sdp-offer-data'
    })
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚀 SquareSpheres Platform Demo</h1>
        <p>React + WASM + WebRTC Signaling</p>
      </header>

      <main className="content">
        {/* WASM Section */}
        <section className="section">
          <h2>🦀 WebAssembly (Rust)</h2>
          <div className="status">
            Status: {wasmModule ? '✅ Loaded' : '⏳ Loading...'}
          </div>
          
          <button onClick={testWasm} disabled={!wasmModule}>
            Test WASM Functions
          </button>
          
          {wasmResult && (
            <pre className="result success">{wasmResult}</pre>
          )}
          
          {wasmError && (
            <pre className="result error">{wasmError}</pre>
          )}
        </section>

        {/* WebSocket Section */}
        <section className="section">
          <h2>🔗 WebRTC Signaling</h2>
          <div className="status">
            Status: {wsStatus === 'Connected' ? '✅' : wsStatus === 'Error' ? '❌' : '⏳'} {wsStatus}
          </div>
          
          <div className="controls">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Room ID"
            />
            <button onClick={joinRoom} disabled={wsStatus !== 'Connected'}>
              Join Room
            </button>
            <button onClick={leaveRoom} disabled={wsStatus !== 'Connected'}>
              Leave Room
            </button>
            <button onClick={sendOffer} disabled={wsStatus !== 'Connected'}>
              Send Mock Offer
            </button>
          </div>
          
          <div className="messages">
            <h3>Messages:</h3>
            <div className="message-list">
              {messages.slice(-5).map((msg, index) => (
                <div key={index} className="message">
                  <small>{msg.timestamp}</small>
                  <pre>{JSON.stringify(msg, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Info Section */}
        <section className="section">
          <h2>📋 Project Info</h2>
          <ul>
            <li><strong>Frontend:</strong> React + Vite (Port 3000)</li>
            <li><strong>WASM:</strong> Rust compiled to WebAssembly</li>
            <li><strong>Signaling:</strong> Go WebSocket server (Port 8080)</li>
            <li><strong>Build:</strong> Docker Compose orchestration</li>
          </ul>
        </section>
      </main>
    </div>
  )
}

export default App
