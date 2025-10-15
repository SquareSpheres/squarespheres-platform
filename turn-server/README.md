# TURN Server Setup for Squarespheres Platform

This directory contains scripts to set up a coturn TURN server on a Digital Ocean droplet (Ubuntu 22.04 LTS recommended). The master script automates the full deployment.

## Get the Project

```bash
git clone https://github.com/SquareSpheres/squarespheres-platform.git
cd squarespheres-platform/turn-server
```

## Environment Configuration

**Before running any scripts**, set up your environment variables:

1. **Copy the template**: `cp .env.example .env`
2. **Fill in required values** in `.env`:
   - `SSH_PUBKEY`: Your SSH public key (get with `cat ~/.ssh/id_rsa.pub`)
   - `TURN_DOMAIN`: Your domain pointing to the droplet (e.g., turn.example.com)
   - `STATIC_SECRET`: Generate with `openssl rand -hex 32`
   - `EMAIL`: Your email for Let's Encrypt notifications
3. **Load variables**: `source load-env.sh`
4. **Run deployment**: `sudo -E bash deploy-turn-server.sh`

The `.env` file contains sensitive data—**never commit it**. Only commit `.env.example` as a template.

**Note on environment persistence**: Env vars are only needed during deployment. The coturn service reads from `/etc/turnserver.conf` (has actual values). If you reconnect later and need to run scripts manually, re-run `source load-env.sh`, or use `persist-env.sh` to load vars automatically in all future sessions.

**Variables**:
- **Required**: `SSH_PUBKEY`, `TURN_DOMAIN`, `STATIC_SECRET` (generate with `openssl rand -hex 32`), `EMAIL`
- **Auto-detected**: `EXTERNAL_IP` (can override if needed)
- **Auto-defaults**: `REALM` (defaults to TURN_DOMAIN)
- **Optional**: `MIN_PORT`, `MAX_PORT`, `VERBOSE`

## Prerequisites
- Fresh Digital Ocean droplet with root access via SSH.
- Your SSH public key (e.g., from `cat ~/.ssh/id_rsa.pub`).
- **For TLS:** A domain (e.g., `turn.example.com`) with A record pointing to your droplet IP. DO Cloud Firewall must allow TCP 80 temporarily for Let's Encrypt validation.
- Configure DO Cloud Firewall in advance:
  - Inbound: TCP 22 (SSH, restrict to your IP), UDP 3478 (STUN/TURN), UDP 5349 (TLS/DTLS), UDP 49152-65535 (relay), TCP 80 (temp for cert—remove after).
  - Outbound: All (default).
  - Apply to droplet tags for security groups.

## Master Deployment Script (`deploy-turn-server.sh`)
This script chains everything: creates user, installs coturn with REST API, sets up TLS certs. Fully automated and non-interactive.

### Usage
1. **On your local machine**: 
   ```bash
   # Clone the project
   git clone https://github.com/SquareSpheres/squarespheres-platform.git
   cd squarespheres-platform/turn-server
   
   # Configure environment
   cp .env.example .env
   # Edit .env and fill in required values:
   #   SSH_PUBKEY (get with: cat ~/.ssh/id_rsa.pub)
   #   TURN_DOMAIN (your domain pointing to droplet)
   #   STATIC_SECRET (generate with: openssl rand -hex 32)
   #   EMAIL (for Let's Encrypt notifications)
   
   # Transfer to droplet
   scp -r ../turn-server root@your_droplet_ip:~/
   ```

2. **SSH into droplet as root**: 
   ```bash
   ssh root@your_droplet_ip
   ```

3. **Load environment and deploy**:
   ```bash
   cd turn-server
   source load-env.sh
   sudo -E bash deploy-turn-server.sh
   ```

4. **Save the generated secret**: Script outputs `STATIC_SECRET`—copy this to your frontend `.env.local` as `TURN_SHARED_SECRET`

5. **Post-deployment**:
   - SSH as `coturn@your_droplet_ip` for future management
   - Remove TCP 80 from DO firewall (no longer needed after cert setup)
   - Test: `turnutils_uclient -v turn.example.com -t turns`
   - (Optional) Make env vars persistent: `bash persist-env.sh` - loads vars in all future sessions

**What it does:**
- Step 1: Runs `init.sh` to create 'coturn' user, add SSH key, disable root login.
- Step 2: Switches to coturn, runs `install-coturn.sh` with REALM=domain, generated STATIC_SECRET.
- Step 3: Runs `setup-tls.sh` to get Let's Encrypt certs, enable TLS in config, restart coturn.
- Sets up cron for cert renewal.
- Handles errors with `set -e`; logs progress. Fails early if required args/envs missing.

**Notes:**
- Generates STATIC_SECRET if not provided via env.
- Assumes DO firewall is configured (critical for ports).
- For no-TLS: Comment out Step 3 in master script.
- **Auto-Renewal:** Cron job added in setup-tls.sh: Every 12 hours, renews certs and restarts coturn if updated. Test: `sudo certbot renew --dry-run`.

## Individual Scripts (for customization)
- `init.sh`: User/SSH setup (run as root; requires SSH_PUBKEY arg).
- `install-coturn.sh`: Coturn install/config (run as coturn with sudo; requires REALM, STATIC_SECRET envs). Supports VERBOSE=true for logging; EXTERNAL_IP fallback to local IP if auto-detect fails.
- `setup-tls.sh`: TLS certs/config (run as coturn with sudo; requires TURN_DOMAIN env, EMAIL optional).

## Denied-Peer-IP Explanation
The `denied-peer-ip` directives block relaying to private/reserved ranges (e.g., 192.168.x.x, 10.x.x.x per RFC 1918; loopback 127.x; multicast 224.x). Prevents abuse (internal scanning via relay), loops, and invalid traffic—limits to public peers, enhancing security/efficiency. Customize if allowing privates (e.g., VPN).

## REST API for Time-Limited Credentials
Enabled with `rest-api-separator=:` and `use-auth-secret`. Generate ephemeral creds server-side:

- Username: `${expiryTimestamp}:${optional_user}` (e.g., `1735689600:user123`)
- Password: base64(HMAC-SHA1(username, STATIC_SECRET))
- Expiry: now + seconds (e.g., 7200s=2h)

**Node.js Example:**
```js
import crypto from 'crypto';
const secret = process.env.TURN_SHARED_SECRET;
const now = Math.floor(Date.now() / 1000);
const expiry = now + 7200;
const username = `${expiry}:user`;
const hmac = crypto.createHmac('sha1', secret);
hmac.update(username);
const password = hmac.digest('base64');
// ICE: { urls: 'turns:turn.example.com:5349?transport=udp', username, credential: password }
```

Coturn validates HMAC/expiry with lt-cred-mech. Secure—rotate without restart.

## Testing
- Status: `sudo systemctl status turnserver`
- Logs: `sudo journalctl -u turnserver -f`
- Client: `turnutils_uclient -v $TURN_DOMAIN -t turns` or Trickle ICE (TLS).
- REST: Generate creds, test in WebRTC demo (check getStats() for turn usage).

## Deployment on Digital Ocean
1. Create droplet (Ubuntu 22.04; add tags for firewall).
2. Configure DO Cloud Firewall as above.
3. SSH root, run master script.
4. Post-deploy: Monitor, scale with larger droplet if needed.

## Integration with Project
- `.env.local`: `TURN_DOMAIN=turn.example.com`, `TURN_SHARED_SECRET=your_secret`, `TURN_REALM=example.com`, `TURN_EXPIRY_SECONDS=7200`.
- `/api/turn-servers/route.ts`: Use `turns:${TURN_DOMAIN}:5349?transport=udp` for TLS URLs; generate creds as above.
- Hooks (`useWebRTCConfig`): Auto-fetches secure ICE servers.
- Fallback: Non-TLS if domain unset; prefer TLS for prod.

Issues? Check DO firewall/DNS, cert paths (`/etc/letsencrypt/live/$TURN_DOMAIN`), logs. For custom ports/domains, edit scripts.
