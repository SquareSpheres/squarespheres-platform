package main

import (
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// Message types for WebRTC signaling
type Message struct {
	Type     string      `json:"type"`
	RoomID   string      `json:"room_id,omitempty"`
	ClientID string      `json:"client_id,omitempty"`
	From     string      `json:"from,omitempty"`
	To       string      `json:"to,omitempty"`
	Data     interface{} `json:"data,omitempty"`
	SDP      string      `json:"sdp,omitempty"`
}

// Client represents a WebSocket connection
type Client struct {
	ID   string
	Conn *websocket.Conn
	Room *Room
	Send chan Message
	done chan struct{}
}

// Room manages multiple clients
type Room struct {
	ID      string
	Clients map[string]*Client
	mutex   sync.RWMutex
}

// Hub manages all rooms and clients
type Hub struct {
	Rooms map[string]*Room
	mutex sync.RWMutex
}

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins for development
		},
	}
	hub = &Hub{
		Rooms: make(map[string]*Room),
	}
	clientIDCounter = 0
	clientIDMutex   = &sync.Mutex{}
)

// NewRoom creates a new room
func NewRoom(id string) *Room {
	return &Room{
		ID:      id,
		Clients: make(map[string]*Client),
	}
}

// AddClient adds a client to the room
func (r *Room) AddClient(client *Client) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	r.Clients[client.ID] = client
	client.Room = r
	log.Printf("Client %s joined room %s", client.ID, r.ID)
}

// RemoveClient removes a client from the room and returns the number of remaining clients.
func (r *Room) RemoveClient(clientID string) int {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	if client, exists := r.Clients[clientID]; exists {
		delete(r.Clients, clientID)
		// Closing the done channel signals the writePump to exit.
		close(client.done)
		log.Printf("Client %s left room %s", clientID, r.ID)
	}
	return len(r.Clients)
}

// Broadcast sends a message to all clients in the room except the sender
func (r *Room) Broadcast(message Message, senderID string) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	for _, client := range r.Clients {
		if client.ID != senderID {
			select {
			case client.Send <- message:
			default:
				// Client's send channel is full, remove them
				go r.RemoveClient(client.ID)
			}
		}
	}
}

// GetOrCreateRoom gets an existing room or creates a new one
func (h *Hub) GetOrCreateRoom(roomID string) *Room {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if room, exists := h.Rooms[roomID]; exists {
		return room
	}

	room := NewRoom(roomID)
	h.Rooms[roomID] = room
	log.Printf("Created new room: %s", roomID)
	return room
}

// RemoveEmptyRoom removes a room if it is empty.
func (h *Hub) RemoveEmptyRoom(roomID string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	room, exists := h.Rooms[roomID]
	if !exists {
		return
	}
	// The room's mutex should be locked before calling this.
	// To be safe against race conditions, we double-check.
	room.mutex.RLock()
	clientCount := len(room.Clients)
	room.mutex.RUnlock()

	if clientCount == 0 {
		delete(h.Rooms, roomID)
		log.Printf("Removed empty room: %s", roomID)
	}
}

// handleWebSocket handles WebSocket connections
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// Extract room ID from URL path or query parameters
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	if roomID == "" {
		roomID = r.URL.Query().Get("room")
		if roomID == "" {
			roomID = "default"
		}
	}

	// Generate a unique client ID
	clientIDMutex.Lock()
	clientIDCounter++
	clientID := fmt.Sprintf("client_%d", clientIDCounter)
	clientIDMutex.Unlock()

	// Get or create room
	room := hub.GetOrCreateRoom(roomID)

	// Create client
	client := &Client{
		ID:   clientID,
		Conn: conn,
		Send: make(chan Message, 256),
		done: make(chan struct{}),
	}

	// Add client to room
	room.AddClient(client)

	// Start goroutines for reading and writing
	go client.writePump()
	go client.readPump()

	// Send welcome message
	welcomeMsg := Message{
		Type:     "connected",
		ClientID: clientID,
		RoomID:   roomID,
		Data:     "Connected to signaling server",
	}
	client.Send <- welcomeMsg
}

// readPump handles incoming messages from the client
func (c *Client) readPump() {
	defer func() {
		if c.Room != nil {
			remainingClients := c.Room.RemoveClient(c.ID)
			if remainingClients == 0 {
				hub.RemoveEmptyRoom(c.Room.ID)
			}
		}
		c.Conn.Close()
	}()

	for {
		var message Message
		err := c.Conn.ReadJSON(&message)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Set client ID if not provided
		if message.ClientID == "" {
			message.ClientID = c.ID
		}

		log.Printf("Received message from %s: %s", c.ID, message.Type)

		// Handle different message types
		switch message.Type {
		case "join":
			// Client wants to join a specific room
			if message.RoomID != "" && message.RoomID != c.Room.ID {
				// Remove from current room
				if c.Room != nil {
					if remaining := c.Room.RemoveClient(c.ID); remaining == 0 {
						hub.RemoveEmptyRoom(c.Room.ID)
					}
				}

				// Join new room
				newRoom := hub.GetOrCreateRoom(message.RoomID)
				newRoom.AddClient(c)
			}

		case "offer", "answer", "ice-candidate":
			// Relay WebRTC signaling messages
			if c.Room != nil {
				c.Room.Broadcast(message, c.ID)
			}

		case "ping":
			// Respond to ping with pong
			pongMsg := Message{
				Type:     "pong",
				ClientID: c.ID,
				RoomID:   c.Room.ID,
			}
			c.Send <- pongMsg

		default:
			// Broadcast unknown messages to all clients in room
			if c.Room != nil {
				c.Room.Broadcast(message, c.ID)
			}
		}
	}
}

// writePump handles outgoing messages to the client
func (c *Client) writePump() {
	defer func() {
		c.Conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			err := c.Conn.WriteJSON(message)
			if err != nil {
				log.Printf("Failed to write message: %v", err)
				return
			}
		case <-c.done:
			return
		}
	}
}

// healthCheck handles health check requests
func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// indexPage serves a simple HTML page with instructions
func indexPage(w http.ResponseWriter, r *http.Request) {
	html := `
<!DOCTYPE html>
<html>
<head>
    <title>WebRTC Signaling Server</title>
</head>
<body>
    <h1>🔗 WebRTC Signaling Server (Go)</h1>
    <p>Server is running. Use WebSocket connections to:</p>
    <ul>
        <li><code>/ws</code> - General signaling endpoint</li>
        <li><code>/ws/{room_id}</code> - Room-specific signaling</li>
        <li><code>/health</code> - Health check endpoint</li>
    </ul>
    <h2>Example Usage</h2>
    <pre>
const ws = new WebSocket('ws://localhost:8080/ws/room-123');

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('Received:', message);
};

// Join a room
ws.send(JSON.stringify({
    type: 'join',
    room_id: 'room-123',
    client_id: 'client-456'
}));

// Send an offer
ws.send(JSON.stringify({
    type: 'offer',
    from: 'client-456',
    to: 'client-789',
    sdp: 'your-sdp-data-here'
}));
    </pre>
</body>
</html>
    `
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}

func main() {
	r := mux.NewRouter()

	// Routes
	r.HandleFunc("/", indexPage).Methods("GET")
	r.HandleFunc("/health", healthCheck).Methods("GET")
	r.HandleFunc("/ws", handleWebSocket)
	r.HandleFunc("/ws/{roomID}", handleWebSocket)

	// CORS middleware for development
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})

	port := ":8080"
	log.Printf("🚀 Signaling server starting on port %s", port)
	log.Fatal(http.ListenAndServe(port, r))
}
