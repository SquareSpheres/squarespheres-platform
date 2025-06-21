# Go Signaling Server Dockerfile
FROM golang:1.23-alpine AS builder

# Install dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy source code
COPY . .

# Initialize go modules and download dependencies
RUN go mod tidy && go mod download

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o signaling-server .

# Runtime stage
FROM alpine:latest

# Install CA certificates and curl for health checks
RUN apk --no-cache add ca-certificates curl

WORKDIR /app

# Copy the binary
COPY --from=builder /app/signaling-server .

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the binary
CMD ["./signaling-server"]
