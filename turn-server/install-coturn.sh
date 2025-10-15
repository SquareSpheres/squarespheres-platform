#!/bin/bash

# This script installs coturn on Ubuntu/Debian, configures it with basic settings,
# and starts the service. Run as root or with sudo after init.sh.
# Set environment variables before running for customization:
# - REALM: TURN realm (required)
# - STATIC_SECRET: Static auth secret (required)
# - EXTERNAL_IP: Public IP of the droplet (default: auto-detect)
# - MIN_PORT / MAX_PORT: UDP port range for allocations (default: 49152-65535)
# - VERBOSE: Enable verbose logging (default: false)
# Usage: sudo REALM=yourdomain.com STATIC_SECRET=yourhexsecret VERBOSE=true bash install-coturn.sh
# Note: Configure DO Cloud Firewall to allow UDP 3478,49152-65535.

set -e

# Enforce required vars
REALM="${REALM:?Error: REALM env var required}"
STATIC_SECRET="${STATIC_SECRET:?Error: STATIC_SECRET env var required}"

# Defaults
MIN_PORT="${MIN_PORT:-49152}"
MAX_PORT="${MAX_PORT:-65535}"
VERBOSE="${VERBOSE:-false}"

# Install curl if not present
if ! command -v curl &> /dev/null; then
    apt update
    apt install -y curl
fi

# Auto-detect EXTERNAL_IP with fallback
EXTERNAL_IP="${EXTERNAL_IP:-$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}' | head -n1 || echo '')}"
if [ -z "$EXTERNAL_IP" ]; then
    echo "Error: Could not detect EXTERNAL_IP. Please set it manually via env var."
    exit 1
fi

echo "Using REALM: $REALM"
echo "Using EXTERNAL_IP: $EXTERNAL_IP"
echo "STATIC_SECRET: $STATIC_SECRET (provided; save for WebRTC client config and REST API credential generation)"
echo "Port range: $MIN_PORT-$MAX_PORT"
echo "Verbose logging: $VERBOSE"

# Update and install coturn
apt update
apt install -y coturn

# Create config file with REST API enabled for time-limited credentials
cat > /etc/turnserver.conf << EOF
# Basic TURN server config
listening-port=3478
tls-listening-port=5349
# Enable TLS (uncomment and run setup-tls.sh to configure certs)
# cert=/etc/letsencrypt/live/yourdomain/fullchain.pem
# pkey=/etc/letsencrypt/live/yourdomain/privkey.pem

# Realm and auth
realm=$REALM
# Use long-term credentials mechanism (required for REST API)
lt-cred-mech
# Static auth secret for REST API (used to generate time-limited creds server-side)
static-auth-secret=$STATIC_SECRET
# Enable REST API for time-limited credentials
rest-api-separator=:
use-auth-secret

# External IP (for NAT traversal)
external-ip=$EXTERNAL_IP

# Allocation settings
min-port=$MIN_PORT
max-port=$MAX_PORT
# Disable STUN-only mode
no-stun
# Disable CLI for security
no-cli
# Prevent loopback and multicast peering for security
no-loopback-peers
no-multicast-peers
# Denied peer IP ranges: Prevent relaying to private/reserved IPs to avoid abuse, loops, and invalid traffic
# These block common private ranges (RFC 1918), loopback, link-local, etc.
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.0.0.0-192.0.0.255
denied-peer-ip=192.0.2.0-192.0.2.255
denied-peer-ip=192.88.99.0-192.88.99.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.22.255.255
denied-peer-ip=198.51.100.0-198.60.255.255
denied-peer-ip=203.0.113.0-203.0.113.255
denied-peer-ip=224.0.0.0-255.255.255.255

# Logging
${VERBOSE:+verbose}
# log-file=stdout
EOF

# Secure the config file (protects static secret)
chmod 600 /etc/turnserver.conf

# Enable and restart service to apply config
systemctl unmask turnserver
systemctl enable turnserver
systemctl restart turnserver

echo "Coturn installed and started with REST API enabled. Check status with: sudo systemctl status turnserver"
echo "Test with: turnutils_uclient -v $EXTERNAL_IP"
echo "For REST API creds: Generate username as 'expiry_timestamp:username' and password as base64(HMAC-SHA1(username, $STATIC_SECRET))"
echo "For TLS setup, ensure domain points to IP, then run: sudo TURN_DOMAIN=yourdomain.com bash setup-tls.sh"
echo "Configure DO Cloud Firewall: Allow inbound UDP 3478, 49152-$MAX_PORT; TCP 22 (SSH)."
