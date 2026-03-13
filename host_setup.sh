#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '[ChatLoom] %s\n' "$1"
}

fail() {
  printf '[ChatLoom] ERROR: %s\n' "$1" >&2
  exit 1
}

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$BASE_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"
APP_PY="$BASE_DIR/server/app.py"
INIT_DB_PY="$BASE_DIR/server/init_db.py"
REQ_FILE="$BASE_DIR/server/requirements.txt"
ENV_FILE="$BASE_DIR/.env.server"
SYSTEMD_UNIT="/etc/systemd/system/chatloom.service"
CF_SYSTEMD_UNIT="/etc/systemd/system/chatloom-cloudflared.service"
CF_CONFIG_DIR="/etc/cloudflared"
CF_CONFIG_FILE="$CF_CONFIG_DIR/config.yml"
BIN_DIR="$BASE_DIR/.bin"
SERVER_PORT="5001"
DEFAULT_TUNNEL_HOSTNAME="${CHATLOOM_TUNNEL_HOSTNAME:-api.chatloom.online}"

APP_USER="${SUDO_USER:-root}"
if ! id "$APP_USER" >/dev/null 2>&1; then
  APP_USER="root"
fi
APP_GROUP="$(id -gn "$APP_USER")"

mkdir -p "$BIN_DIR"

[[ -f "$APP_PY" ]] || fail "Missing backend entrypoint at $APP_PY"
[[ -f "$INIT_DB_PY" ]] || fail "Missing database initializer at $INIT_DB_PY"
[[ -f "$REQ_FILE" ]] || fail "Missing requirements file at $REQ_FILE"

install_packages() {
  log "Installing Ubuntu packages..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y python3 python3-venv python3-pip curl ca-certificates
}

ensure_virtualenv() {
  local venv_broken="0"

  if [[ -x "$VENV_PYTHON" ]]; then
    if ! "$VENV_PYTHON" -c "print('ok')" >/dev/null 2>&1; then
      venv_broken="1"
    fi
  else
    venv_broken="1"
  fi

  if [[ "$venv_broken" == "1" ]]; then
    log "Rebuilding virtual environment..."
    rm -rf "$VENV_DIR"
    python3 -m venv "$VENV_DIR"
  fi

  log "Syncing Python dependencies..."
  "$VENV_PYTHON" -m pip install --upgrade pip --quiet
  "$VENV_PYTHON" -m pip install -r "$REQ_FILE" --quiet
  chown -R "$APP_USER:$APP_GROUP" "$VENV_DIR"
}

ensure_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    chmod 600 "$ENV_FILE"
    chown "$APP_USER:$APP_GROUP" "$ENV_FILE"
    return
  fi

  log "Creating $ENV_FILE ..."
  local secret_key
  secret_key="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)"

  cat > "$ENV_FILE" <<EOF
CHATLOOM_SECRET_KEY=$secret_key
CHATLOOM_EXTRA_ORIGINS=https://chatloom.online,https://www.chatloom.online
CHATLOOM_TUNNEL_HOSTNAME=$DEFAULT_TUNNEL_HOSTNAME
EOF

  chmod 600 "$ENV_FILE"
  chown "$APP_USER:$APP_GROUP" "$ENV_FILE"
}

load_env_file() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

initialize_database() {
  log "Initializing SQLite database..."
  "$VENV_PYTHON" "$INIT_DB_PY"
  chown "$APP_USER:$APP_GROUP" "$BASE_DIR/server/chatloom.db" 2>/dev/null || true
}

dry_run_backend() {
  log "Validating backend startup..."
  local status

  set +e
  timeout 6s "$VENV_PYTHON" "$APP_PY" >"$BASE_DIR/server_boot.log" 2>&1
  status="$?"
  set -e

  if [[ "$status" -ne 0 && "$status" -ne 124 ]]; then
    fail "Backend failed dry run. Check $BASE_DIR/server_boot.log"
  fi
}

install_backend_service() {
  log "Writing systemd unit for ChatLoom backend..."
  cat > "$SYSTEMD_UNIT" <<EOF
[Unit]
Description=ChatLoom Backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$BASE_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$VENV_PYTHON $APP_PY
Restart=always
RestartSec=5
StandardOutput=append:$BASE_DIR/server_out.log
StandardError=append:$BASE_DIR/server_err.log

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now chatloom.service
}

check_backend_health() {
  log "Checking local backend health..."
  for _ in $(seq 1 15); do
    if curl -fsS "http://127.0.0.1:$SERVER_PORT/health" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  fail "Backend health check failed on http://127.0.0.1:$SERVER_PORT/health"
}

detect_cloudflared_arch() {
  case "$(dpkg --print-architecture)" in
    amd64) printf '%s' 'amd64' ;;
    arm64) printf '%s' 'arm64' ;;
    *)
      fail "Unsupported architecture for automatic cloudflared install: $(dpkg --print-architecture)"
      ;;
  esac
}

ensure_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    return
  fi

  local arch deb_file
  arch="$(detect_cloudflared_arch)"
  deb_file="$BIN_DIR/cloudflared-linux-$arch.deb"

  log "Installing cloudflared..."
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$arch.deb" -o "$deb_file"
  apt-get install -y "$deb_file"
}

find_cloudflared_credentials() {
  local search_dirs=("$CF_CONFIG_DIR" "/root/.cloudflared")
  if [[ "$APP_USER" != "root" ]]; then
    search_dirs+=("/home/$APP_USER/.cloudflared")
  fi

  local dir file
  for dir in "${search_dirs[@]}"; do
    [[ -d "$dir" ]] || continue
    while IFS= read -r -d '' file; do
      printf '%s\n' "$file"
      return 0
    done < <(find "$dir" -maxdepth 1 -type f -name '*.json' -print0)
  done

  return 1
}

extract_tunnel_id() {
  python3 - "$1" <<'PY'
import json
import os
import sys

path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception:
    payload = {}

tunnel_id = payload.get("TunnelID") or os.path.basename(path).rsplit(".", 1)[0]
print(tunnel_id)
PY
}

install_cloudflared_service() {
  local credentials_source tunnel_id credentials_target tunnel_hostname cloudflared_bin

  if ! credentials_source="$(find_cloudflared_credentials)"; then
    log "No Cloudflare tunnel credentials found. Skipping cloudflared service setup."
    return
  fi

  ensure_cloudflared

  tunnel_id="$(extract_tunnel_id "$credentials_source")"
  [[ -n "$tunnel_id" ]] || fail "Could not determine tunnel ID from $credentials_source"

  mkdir -p "$CF_CONFIG_DIR"
  credentials_target="$CF_CONFIG_DIR/$tunnel_id.json"
  cp "$credentials_source" "$credentials_target"
  chmod 600 "$credentials_target"

  tunnel_hostname="${CHATLOOM_TUNNEL_HOSTNAME:-$DEFAULT_TUNNEL_HOSTNAME}"
  cat > "$CF_CONFIG_FILE" <<EOF
tunnel: $tunnel_id
credentials-file: $credentials_target
ingress:
  - hostname: $tunnel_hostname
    service: http://127.0.0.1:$SERVER_PORT
  - service: http_status:404
EOF

  cloudflared tunnel --config "$CF_CONFIG_FILE" ingress validate >/dev/null

  cloudflared_bin="$(command -v cloudflared)"
  cat > "$CF_SYSTEMD_UNIT" <<EOF
[Unit]
Description=ChatLoom Cloudflare Tunnel
After=network-online.target chatloom.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=$cloudflared_bin tunnel --config $CF_CONFIG_FILE run $tunnel_id
Restart=always
RestartSec=5
StandardOutput=append:$BASE_DIR/cloudflared_out.log
StandardError=append:$BASE_DIR/cloudflared_err.log

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now chatloom-cloudflared.service

  log "Cloudflare tunnel configured for $tunnel_hostname."
  log "If DNS is not already attached, run:"
  log "cloudflared tunnel route dns $tunnel_id $tunnel_hostname"
}

print_summary() {
  log "Deployment complete."
  log "Backend health: http://127.0.0.1:$SERVER_PORT/health"
  log "Systemd units:"
  log "  chatloom.service"
  if systemctl is-enabled chatloom-cloudflared.service >/dev/null 2>&1; then
    log "  chatloom-cloudflared.service"
  fi
  log "Useful commands:"
  log "  sudo systemctl status chatloom"
  log "  sudo journalctl -u chatloom -f"
}

install_packages
ensure_virtualenv
ensure_env_file
load_env_file
initialize_database
dry_run_backend
install_backend_service
check_backend_health
install_cloudflared_service
print_summary
