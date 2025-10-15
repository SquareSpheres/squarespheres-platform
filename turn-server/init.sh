#!/bin/bash

# This script sets up a new user 'coturn' with sudo access, adds an SSH public key for access,
# and disables root login via SSH. Run as root on a fresh Ubuntu/Debian droplet.
# Usage: sudo bash init.sh "<your_ssh_public_key>"

set -e

PUBLIC_KEY="${1:?Error: PUBLIC_KEY (arg 1) required}"
if [ -z "$PUBLIC_KEY" ]; then
    echo "Usage: $0 <public_ssh_key>"
    echo "Example: $0 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... your_key_here'"
    exit 1
fi

# Create user if not exists
if ! id "coturn" &>/dev/null; then
    adduser --disabled-password --gecos "" coturn
fi

# Add to sudo group
usermod -aG sudo coturn

# Setup SSH directory
mkdir -p /home/coturn/.ssh
chmod 700 /home/coturn/.ssh

# Add public key
echo "$PUBLIC_KEY" > /home/coturn/.ssh/authorized_keys
chmod 600 /home/coturn/.ssh/authorized_keys
chown -R coturn:coturn /home/coturn/.ssh

# Disable root login in SSH config
SSHD_CONFIG="/etc/ssh/sshd_config"
if grep -q "^PermitRootLogin" "$SSHD_CONFIG"; then
    sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' "$SSHD_CONFIG"
else
    echo "PermitRootLogin no" >> "$SSHD_CONFIG"
fi

# Restart SSH service
systemctl restart ssh

echo "Initialization complete. You can now SSH as 'coturn@your_droplet_ip' with your private key."
echo "Warning: Ensure you have the new key ready before running this, as root login is now disabled."
