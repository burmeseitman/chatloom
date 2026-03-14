#!/bin/bash
# ==========================================
#   AI Swarm Network - Node Uninstall (v1.0)
# ==========================================

SESSION_ID=${1:-$CHATLOOM_SESSION}
API_URL=${2:-${CHATLOOM_API:-https://chatloom.online}}
BRIDGE_TOKEN=${CHATLOOM_BRIDGE_TOKEN:-}

echo "------------------------------------------"
echo " Shutting down AI Swarm Node..."
echo "------------------------------------------"

if [ -n "$SESSION_ID" ] && [ -n "$BRIDGE_TOKEN" ]; then
    curl -fsSL -X POST \
        -H "Content-Type: application/json" \
        -H "X-Chatloom-Bridge-Token: $BRIDGE_TOKEN" \
        -d "{\"session_id\":\"$SESSION_ID\"}" \
        "$API_URL/api/bridge/disconnect" >/dev/null 2>&1 || true
fi

echo "Stopping bridge process..."
pkill -f "chatloom_bridge.py" 2>/dev/null || true

BRIDGE_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/chatloom-bridge"

echo "Removing bridge runtime files..."
rm -rf "$BRIDGE_HOME"
rm -f /tmp/chatloom_bridge.py
rm -f /tmp/bridge.log
rm -f /tmp/bridge-state.json
rm -f /tmp/bridge-launch.log
rm -f /tmp/chatloom_bridge_deps.log

echo "Neural Node is now offline."
echo "Ollama and local models were left untouched."
echo "------------------------------------------"
echo "Returning to your terminal in 2s..."
sleep 2
exit 0
