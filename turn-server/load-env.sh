#!/bin/bash

# Load environment variables from .env file
# Usage: source load-env.sh

if [ ! -f "$(dirname "$0")/.env" ]; then
    echo "Error: .env file not found in turn-server directory"
    echo "Copy .env.example to .env and fill in your values first"
    exit 1
fi

set -a
source "$(dirname "$0")/.env"
set +a

echo "Environment variables loaded from .env"
echo "TURN_DOMAIN: ${TURN_DOMAIN:-<not set>}"
echo "EMAIL: ${EMAIL:-<not set>}"
echo "SSH_PUBKEY: ${SSH_PUBKEY:0:50}${SSH_PUBKEY:+...}"

