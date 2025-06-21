# Multi-stage build for the entire platform
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm cache clean --force && \
    rm -rf node_modules package-lock.json && \
    npm install

# Copy frontend source code
COPY frontend/ .

# Build the frontend application
RUN npm run build

# WASM build stage
FROM rust:1.82-alpine AS wasm-builder

# Install dependencies
RUN apk add --no-cache \
    musl-dev \
    curl \
    nodejs \
    npm

# Install wasm-pack and wasm-bindgen-cli
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
RUN cargo install wasm-bindgen-cli

WORKDIR /app

# Copy wasm-app source
COPY wasm-app ./

# Build WASM package
RUN wasm-pack build --target web --out-dir pkg --out-name wasm_app

# Copy WASM files to frontend build
RUN cp pkg/* /app/frontend/dist/wasm/ 2>/dev/null || mkdir -p /app/frontend/dist/wasm && cp pkg/* /app/frontend/dist/wasm/

# Go build stage
FROM golang:1.24-alpine AS go-builder

WORKDIR /app

# Copy signaling server source
COPY signaling-server/ .

# Build the signaling server
RUN go build -o signaling-server .

# Final stage
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy nginx configuration
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Handle client-side routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # WebSocket proxy for signaling server
    location /ws/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
EOF

# Copy built frontend
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Copy WASM files
COPY --from=wasm-builder /app/frontend/dist/wasm /usr/share/nginx/html/wasm

# Copy signaling server
COPY --from=go-builder /app/signaling-server /usr/local/bin/

# Create startup script
COPY <<EOF /start.sh
#!/bin/sh
# Start signaling server in background
/usr/local/bin/signaling-server &
# Start nginx
nginx -g "daemon off;"
EOF

RUN chmod +x /start.sh

# Expose ports
EXPOSE 80 8080

# Start both services
CMD ["/start.sh"] 