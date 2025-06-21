# SquareSpheres Platform Makefile

.PHONY: help build build-wasm build-frontend build-signaling up down dev clean install test lint

# Default target
help: ## Show this help message
	echo "SquareSpheres Platform - Available Commands:"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo

# Build commands
build: ## Build all components
	@echo "🔨 Building all components..."
	docker-compose build

build-wasm: ## Build WASM module only
	@echo "🦀 Building WASM module..."
	cd wasm-app && wasm-pack build --target web --out-dir ../frontend/src/wasm --out-name wasm_app

build-frontend: ## Build frontend only
	@echo "⚛️  Building frontend..."
	docker-compose build frontend

build-signaling: ## Build signaling server only
	@echo "📡 Building signaling server..."
	docker-compose build signaling-server

# Development commands
up: ## Start all services with Docker Compose
	@echo "🚀 Starting all services..."
	docker-compose up --build

down: ## Stop all services
	@echo "🛑 Stopping all services..."
	docker-compose down

dev: ## Start development environment
	@echo "🔧 Starting development environment..."
	@echo "Building WASM module first..."
	$(MAKE) build-wasm
	@echo "Starting services..."
	docker-compose up --build

dev-local: ## Start local development (requires local Go/Node.js/Rust for WASM)
	@echo "🔧 Starting local development..."
	@echo "Building WASM module..."
	$(MAKE) build-wasm
	@echo "Starting signaling server..."
	cd signaling-server && go run . &
	@echo "Starting frontend dev server..."
	cd frontend && npm install && npm run dev

# Utility commands
install: ## Install dependencies
	@echo "📦 Installing dependencies..."
	@echo "Installing Go dependencies..."
	cd signaling-server && go mod download
	@echo "Installing Node.js dependencies..."
	cd frontend && npm install

clean: ## Clean build artifacts and Docker containers
	@echo "🧹 Cleaning up..."
	docker-compose down -v --remove-orphans
	docker system prune -f
	cd frontend && rm -rf node_modules dist
	rm -rf wasm-app/target/
	rm -rf frontend/src/wasm/*

test: test-signaling test-frontend ## Run tests

test-signaling: ## Run signaling server tests
	@echo "🧪 Running signaling server tests..."
	cd signaling-server && go test -v ./...

test-frontend: ## Run frontend linting as tests
	@echo "🧪 Running frontend linter..."
	cd frontend && npm run lint

lint: ## Run linting
	@echo "🔍 Running linters..."
	cd signaling-server && go vet ./...
	cd frontend && npm run lint

# Advanced commands
wasm: build-wasm ## Alias for build-wasm

logs: ## Show logs from all services
	docker-compose logs -f

logs-frontend: ## Show frontend logs
	docker-compose logs -f frontend

logs-signaling: ## Show signaling server logs
	docker-compose logs -f signaling-server

restart: ## Restart all services
	docker-compose restart

restart-frontend: ## Restart frontend only
	docker-compose restart frontend

restart-signaling: ## Restart signaling server only
	docker-compose restart signaling-server

# Status commands
status: ## Show status of all services
	docker-compose ps

health: ## Check health of services
	@echo "🩺 Checking service health..."
	@curl -f http://localhost:8080/health && echo "✅ Signaling server is healthy" || echo "❌ Signaling server is not responding"
	@curl -f http://localhost:3000 && echo "✅ Frontend is accessible" || echo "❌ Frontend is not accessible"

# Docker commands
docker-build: ## Build Docker images without starting
	docker-compose build --no-cache

docker-pull: ## Pull latest base images
	docker-compose pull

# Setup commands
setup: ## Initial project setup
	@echo "🎯 Setting up project..."
	@echo "Checking prerequisites..."
	@command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed."; exit 1; }
	@command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed."; exit 1; }
	@command -v cargo >/dev/null 2>&1 || { echo "❌ Rust/Cargo is required but not installed."; exit 1; }
	@command -v wasm-pack >/dev/null 2>&1 || { echo "❌ wasm-pack is required. Install with: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"; exit 1; }
	@command -v go >/dev/null 2>&1 || { echo "❌ Go is required but not installed."; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed."; exit 1; }
	@echo "✅ All prerequisites found!"
	$(MAKE) install
	@echo "🎉 Setup complete! Run 'make dev' to start development."

# Production commands
prod: ## Build and start production environment
	@echo "🏭 Starting production environment..."
	docker-compose -f docker-compose.yml up --build -d

prod-down: ## Stop production environment
	docker-compose down
