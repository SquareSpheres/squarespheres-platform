# SquareSpheres Platform

A full-stack web application with WebAssembly support and WebRTC signaling.

## Architecture

- **Frontend**: React + Vite application (`frontend/`)
- **WASM App**: Rust-based WebAssembly module (`wasm-app/`)
- **Signaling Server**: Go WebRTC signaling server (`signaling-server/`)

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
- Go 1.23+
- wasm-pack
- Docker & Docker Compose

### Setup

1. Install dependencies:
   ```bash
   # Install Go dependencies
   cd signaling-server && go mod download

   # Install Node.js dependencies
   cd frontend && npm install
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

## Project Structure

```
├── docker-compose.yml      # Production environment
├── docker-compose.dev.yml  # Development overrides
├── Makefile               # Build commands
├── Dockerfile.wasm        # WASM build container
├── frontend/              # React frontend
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── wasm-app/              # WebAssembly module
│   ├── Cargo.toml
│   └── src/
├── signaling-server/      # WebRTC signaling (Go)
│   ├── Dockerfile
│   ├── go.mod
│   └── main.go
└── scripts/               # Setup scripts
    └── setup-dev.sh
```
