# SquareSpheres Platform

A full-stack web application with WebAssembly support and WebRTC signaling for peer-to-peer file sharing.

## Architecture

- **Frontend**: Next.js 14 + TypeScript application with Tailwind CSS (`frontend/`)
- **WASM App**: Rust-based WebAssembly module for file processing (`wasm-app/`)
- **Signaling Server**: .NET 9 WebSocket signaling server (`signaling-server/`)

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

## Features

- **WebRTC File Sharing**: Direct peer-to-peer file transfer
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
└── scripts/               # Setup scripts
    └── setup-dev.sh
```
