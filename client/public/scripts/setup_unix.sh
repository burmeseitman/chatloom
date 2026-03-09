#!/bin/bash
# ==========================================
#   ChatLoom - One-Click Cloud Bridge (Unix)
# ==========================================
# Usage: curl -sSL ... | bash -s <SESSION_ID> <API_URL>

SESSION_ID=$1
API_URL=${2:-https://chatloom.online}

echo "------------------------------------------"
echo " 🐉 Initializing ChatLoom Cloud Bridge..."
echo "------------------------------------------"

# 1. Check Ollama
OLLAMA_BIN=""
if command -v ollama &> /dev/null; then
    OLLAMA_BIN="ollama"
elif [ -x "/usr/local/bin/ollama" ]; then
    OLLAMA_BIN="/usr/local/bin/ollama"
elif [ -x "/opt/homebrew/bin/ollama" ]; then
    OLLAMA_BIN="/opt/homebrew/bin/ollama"
elif [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
    OLLAMA_BIN="/Applications/Ollama.app/Contents/Resources/ollama"
fi

if [ -z "$OLLAMA_BIN" ]; then
    echo "❌ ERROR: Ollama not detected."
    echo "👉 Please install Ollama first: https://ollama.com"
    echo "👉 After installing, launch it and run this command again."
    exit 1
fi

echo "✅ Ollama detected."

# 2. Configure Ollama for Browser Access (CORS)
# We do this silently to improve the 'Vibe'
SECURE_ORIGINS="https://chatloom.online,https://*.chatloom.online,http://localhost:*,http://127.0.0.1:*"
OLLAMA_BIND="0.0.0.0:11434"

if [[ "$(uname -s)" == "Darwin" ]]; then
    launchctl setenv OLLAMA_HOST "$OLLAMA_BIND"
    launchctl setenv OLLAMA_ORIGINS "$SECURE_ORIGINS"
    # Restart Ollama to apply
    pkill -9 "Ollama" 2>/dev/null || true
    sleep 2
    if [ -d "/Applications/Ollama.app" ]; then
        OLLAMA_HOST="$OLLAMA_BIND" OLLAMA_ORIGINS="$SECURE_ORIGINS" open "/Applications/Ollama.app"
    fi
else
    # Linux
    if [ -d "/etc/systemd/system/ollama.service.d" ] || sudo mkdir -p /etc/systemd/system/ollama.service.d 2>/dev/null; then
        echo "[Service]
Environment=\"OLLAMA_HOST=$OLLAMA_BIND\"
Environment=\"OLLAMA_ORIGINS=$SECURE_ORIGINS\"" | sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null
        sudo systemctl daemon-reload
        sudo systemctl restart ollama 2>/dev/null || true
    fi
fi

# 3. Setup Cloudflare Tunnel
echo "☁️  Setting up Cloudflare Tunnel..."
CLOUDFLARED_BIN="cloudflared"
if ! command -v cloudflared &> /dev/null; then
    echo "⬇️  Downloading temporary Cloudflare agent..."
    if [[ "$(uname -s)" == "Darwin" ]]; then
        curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64 -o /tmp/cloudflared
    else
        curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
    fi
    chmod +x /tmp/cloudflared
    CLOUDFLARED_BIN="/tmp/cloudflared"
fi

# Kill old tunnels
pkill -f "cloudflared tunnel --url" 2>/dev/null || true

# Start new tunnel
echo "⚡ Starting Neural Link..."
$CLOUDFLARED_BIN tunnel --url http://127.0.0.1:11434 > /tmp/chatloom_tunnel.log 2>&1 &

# 4. Wait for Tunnel URL and Post to Backend
echo "⏳ Routing your AI node to the cloud..."
TUNNEL_URL=""
for i in {1..15}; do
    sleep 2
    TUNNEL_URL=$(grep -o 'https://.*[.]trycloudflare[.]com' /tmp/chatloom_tunnel.log | head -n 1)
    if [ -n "$TUNNEL_URL" ]; then
        echo "✅ Cloud Link Ready: $TUNNEL_URL"
        if [ -n "$SESSION_ID" ]; then
            curl -s -X POST -H "Content-Type: application/json" \
                 -d "{\"session_id\":\"$SESSION_ID\", \"tunnel_url\":\"$TUNNEL_URL\"}" \
                 "$API_URL/api/tunnel" > /dev/null
            echo "🔗 Node linked to session: $SESSION_ID"
        fi
        break
    fi
done

if [ -z "$TUNNEL_URL" ]; then
    echo "⚠️  Tunnel generation timed out. Please check your internet and try again."
    exit 1
fi

echo "------------------------------------------"
echo " 🎉 SETUP COMPLETE!"
echo " 🚀 Return to ChatLoom and start chatting."
echo "------------------------------------------"
