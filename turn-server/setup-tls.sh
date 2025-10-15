#!/bin/bash

# This script sets up TLS for coturn using Let's Encrypt certificates.
# Run as sudo after install-coturn.sh and ensuring your domain points to the droplet IP.
# Set TURN_DOMAIN env var to your domain (e.g., turn.example.com) before running.
# Usage: sudo TURN_DOMAIN=turn.example.com bash setup-tls.sh
# Note: Ensure DO Cloud Firewall allows TCP 80 temporarily for Certbot validation.

set -e

TURN_DOMAIN="${TURN_DOMAIN:?Error: TURN_DOMAIN env var required (e.g., turn.example.com)}"
EMAIL="${EMAIL:?Error: EMAIL env var required for Certbot notifications}"

echo "Setting up TLS for domain: $TURN_DOMAIN"
echo "Using email for Certbot: $EMAIL"
echo "Ensure your domain A record points to this droplet's IP and DO firewall allows TCP 80 temporarily for validation."

# Stop coturn temporarily if running (Certbot standalone needs port 80)
if systemctl is-active --quiet turnserver; then
    echo "Stopping coturn temporarily for certificate validation..."
    systemctl stop turnserver
fi

# Install Certbot
apt update
apt install -y certbot

# Obtain certificate using standalone mode (Certbot runs a temp web server on port 80 for validation)
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --renew-by-default \
    -d "$TURN_DOMAIN"

# Verify cert files
CERT_PATH="/etc/letsencrypt/live/$TURN_DOMAIN/fullchain.pem"
PKEY_PATH="/etc/letsencrypt/live/$TURN_DOMAIN/privkey.pem"
if [ ! -f "$CERT_PATH" ] || [ ! -f "$PKEY_PATH" ]; then
    echo "Error: Certificates not obtained successfully."
    exit 1
fi

# Update turnserver.conf to enable TLS
TURN_CONF="/etc/turnserver.conf"
sed -i "s/# cert=.*/cert=$CERT_PATH/" "$TURN_CONF"
sed -i "s/# pkey=.*/pkey=$PKEY_PATH/" "$TURN_CONF"
# Enable DTLS for secure media (recommended for WebRTC)
echo "dtls-listening-port=5349" >> "$TURN_CONF"

# Set permissions (coturn runs as turnserver user, but certs are root-owned; fix perms)
chown -R root:turnserver "$CERT_PATH" "$PKEY_PATH"
chmod 640 "$CERT_PATH" "$PKEY_PATH"

# Restart coturn
systemctl start turnserver
systemctl enable turnserver

# Automate cron job for Certbot renewal (twice daily, restart coturn if renewed)
CRON_JOB="0 */12 * * * /usr/bin/certbot renew --quiet && [ \$? -eq 0 ] && systemctl restart turnserver"
if ! crontab -l | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null || true; echo "$CRON_JOB") | crontab -
    echo "Added cron job for automatic cert renewal and coturn restart."
else
    echo "Cron job for cert renewal already exists."
fi

echo "TLS setup complete!"
echo "Coturn now listens on:"
echo "- STUN/TURN: turns://$TURN_DOMAIN:5349 (TLS)"
echo "- Fallback: turn://$TURN_DOMAIN:3478 (UDP, non-TLS)"
echo "Test TLS with: turnutils_uclient -v $TURN_DOMAIN -t turns"
echo "Auto-renewal cron added: Runs every 12 hours, restarts coturn if renewed."
echo "Test renewal: sudo certbot renew --dry-run"
echo "Note: Configure DO Cloud Firewall to allow UDP 3478,5349,49152-65535; temp TCP 80 for cert (close after)."
