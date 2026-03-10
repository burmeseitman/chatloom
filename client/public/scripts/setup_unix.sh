#!/bin/bash
# ==========================================
#   ChatLoom - Neural Link Setup (Unix/Mac)
# ==========================================

SESSION_ID=${1:-$CHATLOOM_SESSION}
API_URL=${2:-${CHATLOOM_API:-https://chatloom.online}}
UNAME_S=$(uname -s)
UNAME_M=$(uname -m)

echo "------------------------------------------"
echo " 🐉 Initializing ChatLoom Neural Link..."
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

# 7. Launch Cloudflare Tunnel
echo "☁️  Establishing Secure Tunnel..."
CLOUDFLARED_BIN="cloudflared"
if ! command -v cloudflared &> /dev/null; then
    BASE_URL="https://github.com/cloudflare/cloudflared/releases/latest/download"
    if [[ "$UNAME_S" == "Darwin" ]]; then
        [[ "$UNAME_M" == "arm64" ]] && ARCH="arm64" || ARCH="amd64"
        echo "⬇️  Downloading cloudflared for darwin-$ARCH..."
        curl -L -f "$BASE_URL/cloudflared-darwin-$ARCH.tgz" -o "/tmp/cf.tgz"
        tar -xzf "/tmp/cf.tgz" -C /tmp/ 2>/dev/null
        chmod +x /tmp/cloudflared
        CLOUDFLARED_BIN="/tmp/cloudflared"
    else
        echo "⬇️  Downloading cloudflared for linux..."
        curl -L -f "$BASE_URL/cloudflared-linux-amd64" -o "/tmp/cloudflared"
        chmod +x /tmp/cloudflared
        CLOUDFLARED_BIN="/tmp/cloudflared"
    fi
fi

pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1
rm -f /tmp/chatloom_tunnel.log

# Use http2 protocol for ISP firewall compatibility
$CLOUDFLARED_BIN tunnel --protocol http2 --url http://127.0.0.1:11434 > /dev/null 2> /tmp/chatloom_tunnel.log &
echo "✅ Cloudflared started. Extracting public URL..."

# 8. Wait for tunnel URL to appear in log (up to 60 seconds)
TUNNEL_URL=""
for i in {1..30}; do
    sleep 2
    TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /tmp/chatloom_tunnel.log | head -n 1)
    if [ -n "$TUNNEL_URL" ]; then
        break
    fi
done

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ Could not get tunnel URL. Cloudflared logs:"
    tail -n 15 /tmp/chatloom_tunnel.log
    exit 1
fi

CLEAN_URL=$(echo "$TUNNEL_URL" | sed 's/\/$//')
echo ""
echo "✅ Public Gateway: $CLEAN_URL"
echo ""

# 9. Verify tunnel is passing through to Ollama (up to 60s)
echo "⏳ Verifying Tunnel → Ollama connection (up to 60s)..."
TUNNEL_OK=0
for j in {1..30}; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$CLEAN_URL/api/tags" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ]; then
        TUNNEL_OK=1
        echo "🚀 TUNNEL VERIFIED! Traffic flowing through."
        break
    fi
    [[ $((j % 5)) -eq 0 ]] && echo "   (Attempt $j/30 - HTTP status: $HTTP_CODE)"
    sleep 2
done

if [ "$TUNNEL_OK" -eq 0 ]; then
    echo ""
    echo "⚠️  Tunnel URL obtained but connection to Ollama through it failed."
    echo "   Your Gateway URL: $CLEAN_URL"
    echo "   Try opening this URL in your browser. If you see JSON, it's working."
    echo "--- CLOUDFLARED LOGS ---"
    tail -n 10 /tmp/chatloom_tunnel.log
fi

# 10. Register with ChatLoom Server (with or without verification)
if [ -n "$SESSION_ID" ]; then
    echo "🔗 Registering with ChatLoom Server..."
    SYNC_RES=$(curl -s -X POST -H "Content-Type: application/json" \
         -d "{\"session_id\":\"$SESSION_ID\", \"tunnel_url\":\"$CLEAN_URL\"}" \
         "$API_URL/api/tunnel")
    
    if [[ "$SYNC_RES" == *"success"* ]]; then
        echo "🔗 Cloud Sync: SUCCESS. ChatLoom will now detect your AI."
    else
        echo "⚠️  Sync failed. Server response: $SYNC_RES"
    fi
fi

echo ""
echo "------------------------------------------"
echo " 🎉 SETUP COMPLETE!"
echo " 🌐 Gateway: $CLEAN_URL"
if [ -n "$SESSION_ID" ]; then
echo " 🚀 Your browser will auto-update now."
fi
echo "------------------------------------------"
