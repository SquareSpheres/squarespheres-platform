# Frontend Dockerfile
FROM node:18-alpine as builder

WORKDIR /app

# Install build dependencies including Rust and wasm-pack
RUN apk add --no-cache python3 make g++ curl bash

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install wasm-pack and wasm-bindgen-cli
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
RUN cargo install wasm-bindgen-cli

# Copy package files first (for better layer caching)
COPY frontend/package*.json ./

# Use npm ci for faster, more reliable installs
RUN npm ci --only=production

# Copy source code (separate layer)
COPY frontend/ .
COPY wasm-app/ ../wasm-app/

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

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

# Copy built application
COPY --from=builder /app/out /usr/share/nginx/html

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
