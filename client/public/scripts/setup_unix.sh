#!/bin/bash
# ==========================================
#   AI Swarm Network - Node Setup (v2.3)
# ==========================================

SESSION_ID=${1:-$CHATLOOM_SESSION}
API_URL=${2:-${CHATLOOM_API:-https://chatloom.online}}
UNAME_S=$(uname -s)

echo "------------------------------------------"
echo " Initializing AI Swarm Node..."
echo "------------------------------------------"

# 1. Check for Ollama
OLLAMA_CMD=$(command -v ollama)
if [ -z "$OLLAMA_CMD" ] && [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
    OLLAMA_CMD="/Applications/Ollama.app/Contents/Resources/ollama"
fi

if [ -z "$OLLAMA_CMD" ]; then
    echo "Ollama not found. Please download it from https://ollama.com"
    exit 1
fi
echo "Ollama detected."

# 2. Check if Ollama is already running on port 11434
if curl -s "http://127.0.0.1:11434/api/tags" > /dev/null; then
    echo "Ollama is already active."
else
    echo "Starting Ollama..."
    export OLLAMA_HOST="0.0.0.0:11434"
    export OLLAMA_ORIGINS="*"
    nohup "$OLLAMA_CMD" serve >/tmp/ollama.log 2>&1 &
    sleep 3
fi

# 3. Pull light model if needed, but don't block setup
if ! "$OLLAMA_CMD" list | grep -q "llama"; then
    echo "No local llama model found. Starting background pull for llama3.2:1b..."
    if ! pgrep -f 'ollama pull llama3.2:1b' >/dev/null 2>&1; then
        nohup "$OLLAMA_CMD" pull llama3.2:1b >/tmp/chatloom_model_pull.log 2>&1 &
    fi
fi

# 4. Neural Bridge Launch
echo "Syncing Bridge Logic..."
curl -sSL "$API_URL/scripts/bridge.py" -o /tmp/chatloom_bridge.py

# Detect Python
PY_CMD=$(command -v python3 || command -v python)
if [ -z "$PY_CMD" ]; then
    echo "Python 3 is required for the Neural Bridge."
    exit 1
fi

echo "Preparing Bridge UI..."
echo "Tray dependencies will be installed by the detached bridge process if needed."

# Kill existing bridge
pkill -f "chatloom_bridge.py" 2>/dev/null || true

echo "Launching Bridge..."
BRIDGE_STATE=/tmp/bridge-state.json
rm -f "$BRIDGE_STATE"
CHATLOOM_BRIDGE_LOG=/tmp/bridge.log CHATLOOM_BRIDGE_STATE="$BRIDGE_STATE" nohup "$PY_CMD" /tmp/chatloom_bridge.py "$SESSION_ID" "$API_URL" </dev/null >/tmp/bridge-launch.log 2>&1 &
BRIDGE_PID=$!
disown "$BRIDGE_PID" 2>/dev/null || true

# Final Verification
TRAY_STATE=""
TRAY_MESSAGE=""
for _ in $(seq 1 24); do
    if [ -f "$BRIDGE_STATE" ]; then
        TRAY_INFO=$("$PY_CMD" - "$BRIDGE_STATE" <<'PY'
import json, sys
try:
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(data.get('state', ''))
    print(data.get('message', ''))
except Exception:
    print("")
    print("")
PY
)
        TRAY_STATE=$(printf "%s" "$TRAY_INFO" | sed -n '1p')
        TRAY_MESSAGE=$(printf "%s" "$TRAY_INFO" | sed -n '2p')
    fi

    if [ "$TRAY_STATE" = "tray_ready" ] || [ "$TRAY_STATE" = "headless" ]; then
        break
    fi
    sleep 0.5
done

if ! ps aux | grep -v grep | grep -q "chatloom_bridge.py"; then
    echo "Bridge failed to start. View logs: cat /tmp/bridge.log"
    exit 1
fi

echo "SUCCESS: Neural Node is now active."
echo "Background Process ID: $(pgrep -f chatloom_bridge.py | head -n 1)"
echo "Bridge log: /tmp/bridge.log"
if [ "$TRAY_STATE" = "tray_ready" ]; then
    echo "Tray icon is ready."
elif [ "$TRAY_STATE" = "headless" ]; then
    echo "Tray icon is unavailable: $TRAY_MESSAGE"
else
    echo "Tray status is still starting. Check /tmp/bridge.log if the icon does not appear."
fi

echo "------------------------------------------"
echo "Returning to your terminal in 2s..."
sleep 2
exit 0
