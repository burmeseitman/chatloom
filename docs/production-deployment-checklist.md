# ChatLoom Production Deployment Checklist

This checklist is for the current production shape:

- frontend on `https://www.chatloom.online`
- backend on an Ubuntu VPS
- API exposed through Cloudflare Tunnel at `https://api.chatloom.online`
- backend service name: `chatloom.service`
- tunnel service name: `chatloom-cloudflared.service`

## 1. Preconditions

- SSH access to the VPS as a sudo-capable user
- latest code already copied or pulled into the repo on the VPS
- `.env.server` exists on the VPS
- `chatloom.service` is already installed
- `chatloom-cloudflared.service` is already installed if the API uses Cloudflare Tunnel
- Cloudflare DNS `api` CNAME points to the same tunnel UUID used by `/etc/cloudflared/config.yml`

## 2. Required Files To Verify On The VPS

- repo root contains:
  - `host_setup.sh`
  - `deploy_production.sh`
  - `server/app.py`
  - `server/init_db.py`
  - `server/requirements.txt`
- runtime files:
  - `.env.server`
  - `server/chatloom.db`
  - `/etc/cloudflared/config.yml`
  - `/etc/cloudflared/<TUNNEL_ID>.json`

## 3. Environment Validation

- confirm the production secret is set and not the fallback value:
```bash
grep '^CHATLOOM_SECRET_KEY=' .env.server
```
- confirm the public API hostname is set:
```bash
grep '^CHATLOOM_TUNNEL_HOSTNAME=' .env.server
```
- confirm backend health before deployment:
```bash
curl -i http://127.0.0.1:5001/health
```

## 4. Backup Before Deployment

- back up:
  - `.env.server`
  - `server/chatloom.db`
  - `/etc/cloudflared/config.yml`
  - current `systemd` unit definitions
- the automated script stores these under:
  - `backups/production/<timestamp>/`

## 5. Backend Deployment Steps

Run from the repo root on the VPS:

```bash
sudo bash ./deploy_production.sh
```

What the script does:

- captures release metadata
- backs up DB, env, and tunnel config
- validates `CHATLOOM_SECRET_KEY`
- repairs or creates `.venv`
- installs backend dependencies
- compiles Python sources
- runs `server/init_db.py`
- restarts `chatloom.service`
- validates and restarts `chatloom-cloudflared.service` if present
- verifies local and public health

## 6. Frontend Deployment Steps

The frontend is deployed separately from the VPS.

- if the frontend changed, deploy the `client/` app to Cloudflare Pages
- ensure the Pages environment variable is:
```bash
VITE_BACKEND_URL=https://api.chatloom.online
```
- after Pages deploy completes, confirm:
  - `https://www.chatloom.online` loads
  - topic list fetch works
  - Socket.IO connects

## 7. Cloudflare Verification

- confirm the tunnel config on the VPS:
```bash
sudo cat /etc/cloudflared/config.yml
```
- confirm the running tunnel UUID:
```bash
cloudflared tunnel list
```
- confirm DNS points to the same tunnel UUID:
  - Cloudflare DNS `api` record content should be:
    - `<TUNNEL_ID>.cfargotunnel.com`
- confirm the tunnel service is healthy:
```bash
sudo systemctl status chatloom-cloudflared --no-pager
sudo journalctl -u chatloom-cloudflared -n 100 --no-pager
```

## 8. Post-Deploy Smoke Tests

Run these checks:

```bash
curl -i http://127.0.0.1:5001/health
curl -i https://api.chatloom.online/health
sudo systemctl status chatloom --no-pager
sudo systemctl status chatloom-cloudflared --no-pager
```

In the browser:

- open `https://www.chatloom.online`
- verify topics load
- verify bridge setup command appears
- connect a bridge and confirm model detection
- join a room
- send a human message
- confirm AI reply arrives
- stop the bridge and confirm Neural Link goes offline

## 9. Security Checks

- `CHATLOOM_SECRET_KEY` is not the dev fallback
- Cloudflare tunnel is the only public path to the backend
- VPS firewall does not expose port `5001` publicly unless explicitly intended
- Cloudflare DNS `api` record points to the correct tunnel UUID
- Cloudflare WAF and HTTPS settings are enabled
- unauthenticated socket chat injection no longer works

## 10. Rollback Plan

If deployment fails:

1. restore the previous DB backup from `backups/production/<timestamp>/chatloom.db`
2. restore `.env.server` if it changed
3. restore `/etc/cloudflared/config.yml` if it changed
4. revert the repo to the last known-good commit
5. rerun:
```bash
sudo systemctl restart chatloom
sudo systemctl restart chatloom-cloudflared
```
6. verify:
```bash
curl -i http://127.0.0.1:5001/health
curl -i https://api.chatloom.online/health
```

## 11. Useful Commands

```bash
sudo systemctl status chatloom --no-pager
sudo journalctl -u chatloom -f
sudo systemctl status chatloom-cloudflared --no-pager
sudo journalctl -u chatloom-cloudflared -f
cloudflared tunnel list
cloudflared tunnel info chatloom-api
curl -i http://127.0.0.1:5001/health
curl -i https://api.chatloom.online/health
```
