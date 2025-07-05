# Signaling Server

A simplified HTTP server implementation in Go, designed for easy deployment and minimal dependencies.

## Overview

This server provides a lightweight HTTP service with:
- Simple "Hello World" endpoint at `/`
- Health check endpoint at `/health`
- Minimal dependencies (uses only Go standard library)
- Optimized for containerized deployment

## Features

- **Lightweight**: Uses only Go standard library, no external dependencies
- **Health Checks**: Built-in health endpoint for monitoring
- **Container Ready**: Includes Dockerfile for easy deployment
- **Simple**: Minimal codebase for easy maintenance and understanding

## Endpoints

- `GET /` - Returns "Hello World"
- `GET /health` - Returns "OK" with HTTP 200 status (used for health checks)

## Local Development

```bash
# Run the server
go run main.go

# Build the binary
go build -o signaling-server main.go

# Run the binary
./signaling-server
```

The server will start on port 8080.

## Docker Deployment

```bash
# Build the Docker image
docker build -t signaling-server .

# Run the container
docker run -p 8080:8080 signaling-server
```

## Fly.io Deployment

This server is optimized for Fly.io deployment with:
- Minimal resource usage
- Built-in health checks
- Standard port 8080
- Lightweight Alpine-based container

The Dockerfile includes:
- Multi-stage build for smaller final image
- Health check configuration
- Non-root user for security
- Optimized Go binary compilation

## Architecture

This is a simplified version of the signaling server that focuses on:
- Minimal complexity
- Fast startup times
- Low resource consumption
- Easy deployment and scaling

Perfect for basic HTTP service needs or as a starting point for more complex functionality.
