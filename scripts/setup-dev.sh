#!/bin/bash

# SquareSpheres Platform Development Setup Script

set -e

echo "🎯 SquareSpheres Platform Development Setup"
echo "==================================="

# Check if running on macOS, Linux, or WSL
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="Linux"
else
    echo "❌ Unsupported platform: $OSTYPE"
    exit 1
fi

echo "📋 Platform detected: $PLATFORM"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo ""
echo "🔍 Checking prerequisites..."

# Check Docker
if command_exists docker; then
    echo "✅ Docker found: $(docker --version)"
else
    echo "❌ Docker not found. Please install Docker Desktop."
    echo "   Download from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check Docker Compose
if command_exists docker-compose; then
    echo "✅ Docker Compose found: $(docker-compose --version)"
elif docker compose version >/dev/null 2>&1; then
    echo "✅ Docker Compose (v2) found: $(docker compose version)"
else
    echo "❌ Docker Compose not found. Please install Docker Compose."
    exit 1
fi

# Check Rust
if command_exists cargo; then
    echo "✅ Rust/Cargo found: $(cargo --version)"
else
    echo "❌ Rust not found. Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo "✅ Rust installed successfully"
fi

# Check wasm-pack
if command_exists wasm-pack; then
    echo "✅ wasm-pack found: $(wasm-pack --version)"
else
    echo "❌ wasm-pack not found. Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
    echo "✅ wasm-pack installed successfully"
fi

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js found: $NODE_VERSION"
    
    # Check if version is >= 18
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        echo "⚠️  Node.js version $NODE_VERSION detected. Version 18+ recommended."
    fi
else
    echo "❌ Node.js not found. Please install Node.js 18+."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check npm
if command_exists npm; then
    echo "✅ npm found: $(npm --version)"
else
    echo "❌ npm not found. Please install npm."
    exit 1
fi

echo ""
echo "📦 Installing project dependencies..."

# Install Rust dependencies
echo "Installing Rust dependencies..."
if cargo build; then
    echo "✅ Rust dependencies installed"
else
    echo "❌ Failed to install Rust dependencies"
    exit 1
fi

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
cd frontend
if npm install; then
    echo "✅ Node.js dependencies installed"
else
    echo "❌ Failed to install Node.js dependencies"
    exit 1
fi
cd ..

# Build WASM module
echo ""
echo "🦀 Building WASM module..."
if make build-wasm; then
    echo "✅ WASM module built successfully"
else
    echo "❌ Failed to build WASM module"
    exit 1
fi

# Create necessary directories
echo ""
echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p tmp

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📖 Next steps:"
echo "   1. Run 'make dev' to start the development environment"
echo "   2. Open http://localhost:3000 to view the frontend"
echo "   3. Open http://localhost:8080 to view the signaling server"
echo ""
echo "💡 Useful commands:"
echo "   make help        - Show all available commands"
echo "   make build       - Build all components"
echo "   make up          - Start with Docker Compose"
echo "   make dev-local   - Start with local toolchain"
echo "   make clean       - Clean all build artifacts"
echo ""
echo "Happy coding! 🚀"
