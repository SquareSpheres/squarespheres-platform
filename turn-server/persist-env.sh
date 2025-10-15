#!/bin/bash

# Add environment loading to shell profile for persistence across sessions
# Run this once after deployment if you want env vars available in all future sessions
# Usage: bash persist-env.sh

PROFILE_FILE="$HOME/.bashrc"

if [ -f "$HOME/.zshrc" ]; then
    PROFILE_FILE="$HOME/.zshrc"
fi

# Check if already added
if grep -q "source.*turn-server/.env" "$PROFILE_FILE" 2>/dev/null; then
    echo "Environment loading already configured in $PROFILE_FILE"
    exit 0
fi

# Add sourcing to profile
cat >> "$PROFILE_FILE" << 'EOF'

# Load TURN server environment variables
if [ -f ~/turn-server/.env ]; then
    set -a
    source ~/turn-server/.env
    set +a
fi
EOF

echo "Added environment loading to $PROFILE_FILE"
echo "Env vars will be available in all future shell sessions"
echo "For current session, run: source $PROFILE_FILE"

