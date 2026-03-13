#!/bin/bash
# ==========================================
#   AI Swarm Network - Node Setup (v2.2)
# ==========================================

SESSION_ID=${1:-$CHATLOOM_SESSION}
API_URL=${2:-${CHATLOOM_API:-https://chatloom.online}}
UNAME_S=$(uname -s)

echo "------------------------------------------"
echo " 🐉 Initializing AI Swarm Node..."
echo "------------------------------------------"

# 1. Check for Ollama
OLLAMA_CMD=$(command -v ollama)
if [ -z "$OLLAMA_CMD" ] && [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
    OLLAMA_CMD="/Applications/Ollama.app/Contents/Resources/ollama"
fi

if [ -z "$OLLAMA_CMD" ]; then
    echo "❌ Ollama not found. Please download it from https://ollama.com"
    exit 1
fi
echo "✅ Ollama detected."

# 2. Check if Ollama is already running on port 11434
if curl -s "http://127.0.0.1:11434/api/tags" > /dev/null; then
    echo "✅ Ollama is already active."
else
    echo "🚀 Starting Ollama..."
    export OLLAMA_HOST="0.0.0.0:11434"
    export OLLAMA_ORIGINS="*"
    nohup "$OLLAMA_CMD" serve >/tmp/ollama.log 2>&1 &
    sleep 3
fi

# 3. Pull light model if needed
if ! "$OLLAMA_CMD" list | grep -q "llama"; then
    echo "📥 Pulling brain node (llama3.2:1b)..."
    "$OLLAMA_CMD" pull llama3.2:1b
fi

# 4. Neural Bridge Launch
echo "⬇️  Syncing Bridge Logic..."
curl -sSL "$API_URL/scripts/bridge.py" -o /tmp/chatloom_bridge.py

# Detect Python
PY_CMD=$(command -v python3 || command -v python)
if [ -z "$PY_CMD" ]; then
    echo "❌ Python 3 is required for the Neural Bridge."
    exit 1
fi

echo "🎨 Setting up Bridge UI..."
# Try to install dependencies but don't fail if they can't be installed
$PY_CMD -m pip install pystray pillow --quiet 2>/dev/null || echo "ℹ️  Skipping Tray UI (Terminal mode only)"

# Kill existing bridge
pkill -f "chatloom_bridge.py" 2>/dev/null || true

echo "🚀 Launching Bridge..."
nohup $PY_CMD /tmp/chatloom_bridge.py "$SESSION_ID" "$API_URL" > /tmp/bridge.log 2>&1 &

# Final Verification
sleep 2
if ps aux | grep -v grep | grep -q "chatloom_bridge.py"; then
    echo "✅ SUCCESS: Neural Node is now active."
    echo "🐉 Background Process ID: $(pgrep -f chatloom_bridge.py)"
else
    echo "❌ Bridge failed to start. View logs: cat /tmp/bridge.log"
    exit 1
fi

echo "------------------------------------------"
echo "🚪 Closing session in 5s..."
sleep 5
exit 0

