#!/bin/bash
# ==========================================
#   AI Swarm Network - Node Setup (Unix/Mac)
# ==========================================

SESSION_ID=${1:-$CHATLOOM_SESSION}
API_URL=${2:-${CHATLOOM_API:-https://chatloom.online}}
UNAME_S=$(uname -s)
UNAME_M=$(uname -m)

echo "------------------------------------------"
echo " 🐉 Initializing AI Swarm Node..."
echo "------------------------------------------"

# 1. Check for Ollama
OLLAMA_CMD=""
if command -v ollama &> /dev/null; then
    OLLAMA_CMD="ollama"
elif [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
    OLLAMA_CMD="/Applications/Ollama.app/Contents/Resources/ollama"
elif [ -x "/usr/local/bin/ollama" ]; then
    OLLAMA_CMD="/usr/local/bin/ollama"
fi

if [ -z "$OLLAMA_CMD" ]; then
    echo "⚠️  Ollama not detected. Please install it: https://ollama.com"
    exit 1
fi

echo "✅ Ollama binary found: $OLLAMA_CMD"

# 2. Kill any existing Ollama processes and free port 11434
echo "♻️  Resetting Brain Engine..."
if command -v lsof &> /dev/null; then
    PIDS=$(lsof -ti:11434 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo "🛡️  Clearing Port 11434 (PID: $PIDS)..."
        echo "$PIDS" | xargs kill -9 2>/dev/null || true
    fi
fi
pkill -9 "Ollama" 2>/dev/null || true
pkill -9 "ollama" 2>/dev/null || true

# Wait for port to be released
sleep 3

# 3. Set the CORRECT environment variables
# CRITICAL: OLLAMA_HOST must be 0.0.0.0 so Cloudflare Tunnel can reach it.
# Using 127.0.0.1 would block external tunnel traffic!
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_ORIGINS="*"

if [[ "$UNAME_S" == "Darwin" ]]; then
    echo "🍏 Applying MacOS Security Policies (CORS + Host Binding)..."
    launchctl setenv OLLAMA_HOST "0.0.0.0:11434"
    launchctl setenv OLLAMA_ORIGINS "*"
fi

# 4. Start Ollama with new settings
nohup $OLLAMA_CMD serve >/tmp/ollama_engine.log 2>&1 &
OLLAMA_PID=$!
echo "🚀 Engine starting (PID: $OLLAMA_PID)..."

# 5. Wait for Ollama to be ready (up to 15 seconds)
echo "⏳ Waiting for Ollama to initialize..."
OLLAMA_READY=0
for k in {1..15}; do
    if curl -s -f "http://127.0.0.1:11434/api/tags" > /dev/null 2>&1; then
        OLLAMA_READY=1
        echo "✅ Ollama Engine Ready."
        break
    fi
    sleep 1
done

if [ "$OLLAMA_READY" -eq 0 ]; then
    echo "❌ Ollama failed to start. Check /tmp/ollama_engine.log"
    tail -n 10 /tmp/ollama_engine.log
    exit 1
fi

# 6. Check/Pull Models
echo "🔎 Scanning local models..."
MODELS=$($OLLAMA_CMD list 2>/dev/null | grep -v "NAME" | grep -v "^$")
if [ -z "$MODELS" ]; then
    echo "⚠️  No models found. Auto-pulling 'llama3.2:1b' (lightest model)..."
    $OLLAMA_CMD pull llama3.2:1b
else
    echo "✅ Knowledge Base ready:"
    echo "$MODELS"
fi

# 7. Launch Swarm Node (Neural Bridge)
echo "🐉 Launching AI Swarm Node..."
pkill -f "bridge.py" 2>/dev/null || true
sleep 1

# Download bridge.py from API if not exists locally
echo "⬇️  Syncing Bridge Logic..."
curl -sSL "$API_URL/scripts/bridge.py" -o /tmp/chatloom_bridge.py

if [ ! -f "/tmp/chatloom_bridge.py" ]; then
    echo "❌ Failed to download bridge script from $API_URL"
    exit 1
fi

# 8. Install UI Dependencies (Optional but Recommended)
echo "🎨 Optimizing UI Experience..."
python3 -m pip install pystray pillow --quiet 2>/dev/null || true

echo "🚀 BRIDGE STARTING (Tray Mode)..."
echo "------------------------------------------"
# Execute bridge.py in background if possible, or direct
python3 /tmp/chatloom_bridge.py "$SESSION_ID" "$API_URL"

