#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '[ChatLoom Deploy] %s\n' "$1"
}

warn() {
  printf '[ChatLoom Deploy] WARN: %s\n' "$1" >&2
}

fail() {
  printf '[ChatLoom Deploy] ERROR: %s\n' "$1" >&2
  exit 1
}

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$BASE_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"
REQ_FILE="$BASE_DIR/server/requirements.txt"
APP_PY="$BASE_DIR/server/app.py"
INIT_DB_PY="$BASE_DIR/server/init_db.py"
ENV_FILE="$BASE_DIR/.env.server"
DB_FILE="$BASE_DIR/server/chatloom.db"
BACKUP_ROOT="$BASE_DIR/backups/production"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
SERVER_PORT="5001"
SYSTEMD_BACKEND="chatloom.service"
SYSTEMD_TUNNEL="chatloom-cloudflared.service"
CF_CONFIG_FILE="/etc/cloudflared/config.yml"

mkdir -p "$BACKUP_DIR"

[[ -f "$REQ_FILE" ]] || fail "Missing requirements file at $REQ_FILE"
[[ -f "$APP_PY" ]] || fail "Missing backend entrypoint at $APP_PY"
[[ -f "$INIT_DB_PY" ]] || fail "Missing database initializer at $INIT_DB_PY"
[[ -f "$ENV_FILE" ]] || fail "Missing environment file at $ENV_FILE"

capture_release_metadata() {
  log "Capturing release metadata..."
  {
    printf 'timestamp=%s\n' "$TIMESTAMP"
    printf 'hostname=%s\n' "$(hostname)"
    printf 'user=%s\n' "${SUDO_USER:-root}"
    printf 'cwd=%s\n' "$BASE_DIR"
    if command -v git >/dev/null 2>&1 && [[ -d "$BASE_DIR/.git" ]]; then
      printf 'git_commit=%s\n' "$(git -C "$BASE_DIR" rev-parse HEAD 2>/dev/null || printf 'unknown')"
      printf 'git_branch=%s\n' "$(git -C "$BASE_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"
      printf 'git_status=\n'
      git -C "$BASE_DIR" status --short || true
    fi
  } > "$BACKUP_DIR/release-info.txt"
}

backup_runtime_files() {
  log "Backing up runtime files to $BACKUP_DIR ..."

  cp "$ENV_FILE" "$BACKUP_DIR/.env.server"

  if [[ -f "$DB_FILE" ]]; then
    cp "$DB_FILE" "$BACKUP_DIR/chatloom.db"
  else
    warn "Database file not found at $DB_FILE"
  fi

  if [[ -f "$CF_CONFIG_FILE" ]]; then
    cp "$CF_CONFIG_FILE" "$BACKUP_DIR/cloudflared-config.yml"
  fi

  if systemctl list-unit-files | grep -q "^${SYSTEMD_BACKEND}"; then
    systemctl cat "$SYSTEMD_BACKEND" > "$BACKUP_DIR/chatloom.service.txt" || true
  fi

  if systemctl list-unit-files | grep -q "^${SYSTEMD_TUNNEL}"; then
    systemctl cat "$SYSTEMD_TUNNEL" > "$BACKUP_DIR/chatloom-cloudflared.service.txt" || true
  fi
}

load_env_file() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

validate_environment() {
  log "Validating production environment..."

  [[ -n "${CHATLOOM_SECRET_KEY:-}" ]] || fail "CHATLOOM_SECRET_KEY is missing in $ENV_FILE"
  [[ "${CHATLOOM_SECRET_KEY}" != "dev-secret-key-123" ]] || fail "CHATLOOM_SECRET_KEY is still using the development fallback"

  if [[ -n "${CHATLOOM_TUNNEL_HOSTNAME:-}" ]]; then
    log "Configured public hostname: $CHATLOOM_TUNNEL_HOSTNAME"
  else
    warn "CHATLOOM_TUNNEL_HOSTNAME is not set; public health check will be skipped"
  fi
}

ensure_virtualenv() {
  local rebuild="0"

  if [[ -x "$VENV_PYTHON" ]]; then
    if ! "$VENV_PYTHON" -c "print('ok')" >/dev/null 2>&1; then
      rebuild="1"
    fi
  else
    rebuild="1"
  fi

  if [[ "$rebuild" == "1" ]]; then
    log "Creating virtual environment..."
    rm -rf "$VENV_DIR"
    python3 -m venv "$VENV_DIR"
  fi

  log "Syncing Python dependencies..."
  "$VENV_PYTHON" -m pip install --upgrade pip --quiet
  "$VENV_PYTHON" -m pip install -r "$REQ_FILE" --quiet
}

validate_backend_code() {
  log "Compiling backend sources..."
  "$VENV_PYTHON" -m py_compile "$BASE_DIR/server/app.py" "$BASE_DIR/server/init_db.py"
}

run_database_sync() {
  log "Running database initializer..."
  "$VENV_PYTHON" "$INIT_DB_PY"
}

restart_backend_service() {
  log "Restarting $SYSTEMD_BACKEND ..."
  systemctl daemon-reload
  systemctl restart "$SYSTEMD_BACKEND"
}

validate_tunnel_service() {
  if ! systemctl list-unit-files | grep -q "^${SYSTEMD_TUNNEL}"; then
    warn "$SYSTEMD_TUNNEL is not installed; skipping tunnel restart"
    return
  fi

  if [[ -f "$CF_CONFIG_FILE" ]]; then
    log "Validating cloudflared config..."
    cloudflared tunnel --config "$CF_CONFIG_FILE" ingress validate >/dev/null
  fi

  log "Restarting $SYSTEMD_TUNNEL ..."
  systemctl restart "$SYSTEMD_TUNNEL"
}

check_local_health() {
  log "Waiting for local backend health..."
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$SERVER_PORT/health" >/dev/null 2>&1; then
      log "Local backend is healthy."
      return
    fi
    sleep 1
  done

  fail "Backend health check failed at http://127.0.0.1:$SERVER_PORT/health"
}

check_public_health() {
  if [[ -z "${CHATLOOM_TUNNEL_HOSTNAME:-}" ]]; then
    return
  fi

  log "Checking public API health..."
  for _ in $(seq 1 20); do
    if curl -fsS "https://${CHATLOOM_TUNNEL_HOSTNAME}/health" >/dev/null 2>&1; then
      log "Public API is healthy."
      return
    fi
    sleep 2
  done

  fail "Public health check failed at https://${CHATLOOM_TUNNEL_HOSTNAME}/health"
}

print_summary() {
  log "Deployment finished successfully."
  log "Backup saved to: $BACKUP_DIR"
  log "Useful commands:"
  log "  sudo systemctl status ${SYSTEMD_BACKEND} --no-pager"
  if systemctl list-unit-files | grep -q "^${SYSTEMD_TUNNEL}"; then
    log "  sudo systemctl status ${SYSTEMD_TUNNEL} --no-pager"
  fi
  log "  curl -i http://127.0.0.1:${SERVER_PORT}/health"
  if [[ -n "${CHATLOOM_TUNNEL_HOSTNAME:-}" ]]; then
    log "  curl -i https://${CHATLOOM_TUNNEL_HOSTNAME}/health"
  fi
}

capture_release_metadata
backup_runtime_files
load_env_file
validate_environment
ensure_virtualenv
validate_backend_code
run_database_sync
restart_backend_service
validate_tunnel_service
check_local_health
check_public_health
print_summary
