# SquareSpheres Platform

A full-stack web application with WebAssembly support and WebRTC signaling for peer-to-peer file sharing.

## Architecture

- **Frontend**: Next.js 14 + TypeScript application with Tailwind CSS (`frontend/`)
- **WASM App**: Rust-based WebAssembly module for file processing (`wasm-app/`)
- **Signaling Server**: .NET 9 WebSocket signaling server (`signaling-server/`)
- **TURN Server**: Coturn TURN/STUN server for NAT traversal (`turn-server/`)

## Quick Start

```bash
# Build everything
make build

# Run in development mode
make up

# Build WASM module only
make wasm
```

## Development

### Prerequisites

- Node.js 18+
- Rust 1.70+
- .NET 9 SDK
- wasm-pack
- Docker & Docker Compose

### Setup

1. Install dependencies:
   ```bash
   # Install Node.js dependencies
   cd frontend && npm install

   # Restore .NET dependencies
   cd signaling-server && dotnet restore
   ```

2. Build WASM module:
   ```bash
   make wasm
   ```

3. Start development servers:
   ```bash
   make up
   ```

## Services

- Frontend: http://localhost:3000
- Signaling Server: http://localhost:8080
- TURN Server: See [turn-server/README.md](turn-server/README.md) for deployment

## Features

- **WebRTC File Sharing**: Direct peer-to-peer file transfer with NAT traversal
- **TURN/STUN Server**: Production-ready relay server for connections behind firewalls
- **WebAssembly Processing**: Fast file processing in the browser
- **QR Code Generation**: Easy connection sharing
- **Real-time Signaling**: WebSocket-based connection management
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS

## Project Structure

```
├── docker-compose.yml      # Production environment
├── docker-compose.dev.yml  # Development overrides
├── Makefile               # Build commands
├── Dockerfile.wasm        # WASM build container
├── frontend/              # Next.js frontend
│   ├── app/              # Next.js 14 app directory
│   │   ├── hooks/        # Custom React hooks
│   │   ├── utils/        # Utility functions
│   │   │   ├── webrtcDebug.ts         # WebRTC debug logging
│   │   │   ├── webrtcStats.ts         # Connection statistics
│   │   │   ├── webrtcBrowserConfig.ts # Browser configs
│   │   │   ├── signalingDebug.ts      # Signaling debug utils
│   │   │   ├── signalingConfig.ts     # Signaling browser configs
│   │   │   └── signalingRequestManager.ts # Request/response pattern
│   │   ├── types/        # TypeScript type definitions
│   │   │   └── signalingTypes.ts      # Signaling interfaces
│   │   ├── page.tsx      # Main page
│   │   └── receive/      # File receiver page
│   ├── wasm-module/      # Built WASM artifacts
│   ├── Dockerfile
│   ├── package.json
│   └── tailwind.config.js
├── wasm-app/              # WebAssembly module
│   ├── Cargo.toml
│   └── src/lib.rs
├── signaling-server/      # WebRTC signaling (.NET 9)
│   ├── Source/           # Main application code
│   │   ├── Endpoints/    # API endpoints
│   │   ├── Services/     # Business logic
│   │   └── Models/       # Data models
│   ├── Tests/            # Unit tests
│   ├── Dockerfile
│   ├── SignalingServer.sln
│   └── fly.toml
├── turn-server/           # TURN/STUN server (coturn)
│   ├── deploy-turn-server.sh  # Master deployment script
│   ├── install-coturn.sh      # Coturn installation
│   ├── setup-tls.sh           # TLS/Let's Encrypt setup
│   ├── .env.example           # Environment template
│   └── README.md              # Deployment guide
└── scripts/               # Setup scripts
    └── setup-dev.sh
```

## TURN Server Deployment

For production WebRTC connections that need to work behind NATs and firewalls, deploy the TURN server:

```bash
cd turn-server
# Copy and configure environment
cp .env.example .env
# Edit .env with your SSH key, domain, secret, and email

# Transfer to Digital Ocean droplet and deploy
scp -r turn-server root@your_droplet_ip:~/
ssh root@your_droplet_ip
cd turn-server
source load-env.sh
sudo -E bash deploy-turn-server.sh
```

See [turn-server/README.md](turn-server/README.md) for detailed deployment instructions.

## Repository

GitHub: [https://github.com/SquareSpheres/squarespheres-platform.git](https://github.com/SquareSpheres/squarespheres-platform.git)
