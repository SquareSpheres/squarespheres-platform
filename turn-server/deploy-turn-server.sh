#!/bin/bash

# Master script to fully deploy coturn TURN server on Digital Ocean droplet.
# Run as root on a fresh droplet. Automates user setup, coturn install, and TLS.
# 
# Usage (recommended with .env):
#   1. Copy .env.example to .env and fill in values
#   2. source load-env.sh
#   3. sudo -E bash deploy-turn-server.sh
#
# Alternative usage with args:
#   sudo bash deploy-turn-server.sh "<ssh_public_key>" "<turn_domain>" [email]
#
# Prerequisites: Domain A record points to droplet IP; DO firewall allows UDP 3478,5349,49152-65535 (temp TCP 80 for cert).

set -e

# Use env vars first, fall back to args
SSH_PUBKEY="${SSH_PUBKEY:-${1}}"
TURN_DOMAIN="${TURN_DOMAIN:-${2}}"
EMAIL="${EMAIL:-${3}}"

# Validate required vars
if [ -z "$SSH_PUBKEY" ]; then
    echo "Error: SSH_PUBKEY required (set in .env or pass as arg 1)"
    exit 1
fi

if [ -z "$TURN_DOMAIN" ]; then
    echo "Error: TURN_DOMAIN required (set in .env or pass as arg 2)"
    exit 1
fi

if [ -z "$STATIC_SECRET" ]; then
    echo "Error: STATIC_SECRET required (set in .env)"
    echo "Generate one with: openssl rand -hex 32"
    exit 1
fi

if [ -z "$EMAIL" ]; then
    echo "Error: EMAIL required (set in .env or pass as arg 3)"
    exit 1
fi

# Set defaults for optional vars
REALM="${REALM:-$TURN_DOMAIN}"  # Use domain as realm if not set

echo "Starting automated TURN server deployment for $TURN_DOMAIN"
echo "SSH Pubkey: ${SSH_PUBKEY:0:50}..."
echo "Email: $EMAIL"
echo "Realm: $REALM"
echo "STATIC_SECRET: ${STATIC_SECRET:0:16}... (configured - save for frontend env: TURN_SHARED_SECRET)"

# Step 1: Initialize user and SSH
echo "Step 1: Setting up 'coturn' user and SSH..."
bash "$(dirname "$0")/init.sh" "$SSH_PUBKEY"

# Switch to coturn user for subsequent steps (non-interactive sudo)
su - coturn -c "
    # Step 2: Install coturn with REST API
    echo 'Step 2: Installing coturn...'
    REALM=$REALM STATIC_SECRET=$STATIC_SECRET sudo bash \"$(dirname \"\$0\")/install-coturn.sh\"

    # Step 3: Setup TLS
    echo 'Step 3: Setting up TLS certificates...'
    sudo TURN_DOMAIN=$TURN_DOMAIN EMAIL=$EMAIL bash \"$(dirname \"\$0\")/setup-tls.sh\"
"

echo "Deployment complete! Coturn is running with TLS."
echo "REST API creds: Username '${expiry_ts}:user', password base64(HMAC-SHA1(username, STATIC_SECRET)) where expiry_ts = now + seconds."
echo "Frontend integration: Copy STATIC_SECRET to your frontend .env.local as TURN_SHARED_SECRET"

echo "Digital Ocean Firewall Setup (do this manually via dashboard):"
echo "- Allow inbound: UDP 3478 (STUN/TURN), UDP 5349 (TLS/DTLS), UDP 49152-65535 (relay range)"
echo "- Temp for cert (if not already): TCP 80 (close after deploy)"
echo "- SSH: TCP 22 (restrict to your IP if possible)"
echo "- Outbound: All (default)"
echo "Test: From another machine, turnutils_uclient -v $TURN_DOMAIN -t turns"
echo "Monitor: sudo journalctl -u turnserver -f"
echo "Auto-renew certs: Already set via cron; test with sudo certbot renew --dry-run"
