# Signaling Server

A simplified HTTP server implementation in .NET, designed for easy deployment and minimal dependencies.

## Overview

This server provides a lightweight HTTP service with:
- Simple "Hello World" endpoint at `/`
- Health check endpoint at `/health`
- Minimal dependencies (uses only .NET minimal APIs)
- Optimized for containerized deployment

## Features

- **Lightweight**: Uses .NET minimal APIs with minimal dependencies
- **Health Checks**: Built-in health endpoint for monitoring
- **Container Ready**: Includes Dockerfile for easy deployment
- **Simple**: Minimal codebase for easy maintenance and understanding

## Endpoints

- `GET /` - Returns "Hello World"
- `GET /health` - Returns "OK" with HTTP 200 status (used for health checks)

## Local Development

```bash
# Run the server
dotnet run --project Source/SignalingServer.csproj

# Build the application
dotnet build Source/SignalingServer.csproj

# Publish for deployment
dotnet publish Source/SignalingServer.csproj -c Release -o out

# Run the published application
dotnet out/SignalingServer.dll
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
- Optimized .NET runtime image

## Architecture

This is a minimal placeholder implementation of the signaling server that focuses on:
- Minimal complexity using .NET minimal APIs
- Fast startup times with native AOT compilation support
- Low resource consumption
- Easy deployment and scaling

## Current Implementation

This is a placeholder implementation containing:
- Basic Program.cs with minimal API setup
- Two simple endpoints (/ and /health)
- Basic project configuration (SignalingServer.csproj)
- Docker configuration for containerized deployment
- No actual signaling functionality - just HTTP endpoint placeholders

The current implementation serves as a foundation that can be extended with:
- WebSocket support for real-time signaling
- Authentication and authorization
- Message routing and delivery
- Connection management
- Integration with external services

Perfect for basic HTTP service needs or as a starting point for building a complete signaling server.
