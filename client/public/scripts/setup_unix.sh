#!/bin/bash
# ==========================================
#   ChatLoom - One-Click Cloud Bridge (Unix)
# ==========================================
# Usage: curl -sSL ... | bash -s <SESSION_ID> <API_URL>

SESSION_ID=$1
API_URL=${2:-https://chatloom.online}
UNAME_S=$(uname -s)
UNAME_M=$(uname -m)

# Extract domain for CORS (redundant but safe)
DOMAIN=$(echo $API_URL | awk -F[/:] '{print $4}')

echo "------------------------------------------"
echo " 🐉 Initializing ChatLoom Cloud Bridge..."
echo "------------------------------------------"

# 1. Locate Ollama
OLLAMA_BIN=""
if command -v ollama &> /dev/null; then
    OLLAMA_BIN="ollama"
elif [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
    OLLAMA_BIN="/Applications/Ollama.app/Contents/Resources/ollama"
elif [ -x "/usr/local/bin/ollama" ]; then
    OLLAMA_BIN="/usr/local/bin/ollama"
elif [ -x "/opt/homebrew/bin/ollama" ]; then
    OLLAMA_BIN="/opt/homebrew/bin/ollama"
fi

if [ -z "$OLLAMA_BIN" ]; then
    echo "⚠️  Ollama.app not found in standard locations."
    echo "👉 Please install Ollama first: https://ollama.com"
    exit 1
fi

echo "✅ Ollama detected."

# 2. Configure Security & Infrastructure
# Use a wide wildcard for production robustness on local tunnels
SECURE_ORIGINS="*" 
OLLAMA_BIND="0.0.0.0:11434"

if [[ "$UNAME_S" == "Darwin" ]]; then
    echo "🛡️  Injecting Security Policies (macOS)..."
    
    # Kill any existing Ollama processes
    pkill -9 "Ollama" 2>/dev/null || true
    sleep 2
    
    # The most bulletproof way for Ollama Mac to pick up env vars is direct binary launch
    # instead of the "open" wrapper which often scrubs environment variables.
    echo "♻️  Launching Ollama Engine with forced environment..."
    
    # We set these for the current session AND future sessions
    launchctl setenv OLLAMA_HOST "$OLLAMA_BIND"
    launchctl setenv OLLAMA_ORIGINS "$SECURE_ORIGINS"
    
    # Persist in shell for good measure
    [[ "$SHELL" == */zsh ]] && CONFIG="$HOME/.zshrc" || CONFIG="$HOME/.bashrc"
    sed -i '' '/OLLAMA_ORIGINS/d' "$CONFIG" 2>/dev/null
    sed -i '' '/OLLAMA_HOST/d' "$CONFIG" 2>/dev/null
    echo "export OLLAMA_HOST=\"$OLLAMA_BIND\"" >> "$CONFIG"
    echo "export OLLAMA_ORIGINS=\"$SECURE_ORIGINS\"" >> "$CONFIG"

    # Launching binary directly ensures the environment is inherited
    if [ -x "/Applications/Ollama.app/Contents/MacOS/Ollama" ]; then
        OLLAMA_HOST="$OLLAMA_BIND" OLLAMA_ORIGINS="$SECURE_ORIGINS" nohup "/Applications/Ollama.app/Contents/MacOS/Ollama" >/dev/null 2>&1 &
    else
        # Fallback to 'open' if manual path fails
        OLLAMA_HOST="$OLLAMA_BIND" OLLAMA_ORIGINS="$SECURE_ORIGINS" open -a "Ollama"
    fi
else
    # Linux Persistence
    sudo mkdir -p /etc/systemd/system/ollama.service.d
    echo "[Service]
Environment=\"OLLAMA_HOST=$OLLAMA_BIND\"
Environment=\"OLLAMA_ORIGINS=$SECURE_ORIGINS\"" | sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null
    sudo systemctl daemon-reload
    sudo systemctl restart ollama 2>/dev/null || true
fi

# 3. Setup Cloudflare Tunnel
echo "☁️  Configuring Cloudflare Secure Tunnel..."
CLOUDFLARED_BIN="cloudflared"
if ! command -v cloudflared &> /dev/null; then
    BASE_URL="https://github.com/cloudflare/cloudflared/releases/latest/download"
    if [[ "$UNAME_S" == "Darwin" ]]; then
        [[ "$UNAME_M" == "arm64" ]] && ARCH="arm64" || ARCH="amd64"
        curl -L -f "$BASE_URL/cloudflared-darwin-$ARCH.tgz" -o "/tmp/cf.tgz"
        tar -xzf "/tmp/cf.tgz" -C /tmp/ 2>/dev/null
        CLOUDFLARED_BIN="/tmp/cloudflared"
    else
        curl -L -f "$BASE_URL/cloudflared-linux-amd64" -o "/tmp/cloudflared"
        chmod +x /tmp/cloudflared
        CLOUDFLARED_BIN="/tmp/cloudflared"
    fi
fi

# Clear old processes
pkill -f "cloudflared tunnel" 2>/dev/null || true
rm -f /tmp/chatloom_tunnel.log

echo "⚡ Starting Neural Link..."
$CLOUDFLARED_BIN tunnel --url http://127.0.0.1:11434 > /dev/null 2> /tmp/chatloom_tunnel.log &

# 4. Finalize Connection
echo "⏳ Waiting for Cloud URL (max 60s)..."
TUNNEL_URL=""
for i in {1..30}; do
    sleep 2
    TUNNEL_URL=$(grep -o 'https://.*[.]trycloudflare[.]com' /tmp/chatloom_tunnel.log | head -n 1)
    if [ -n "$TUNNEL_URL" ]; then
        echo "✅ Cloud Node Ready: $TUNNEL_URL"
        if [ -n "$SESSION_ID" ]; then
            CLEAN_URL=$(echo "$TUNNEL_URL" | sed 's/\/$//')
            curl -s -X POST -H "Content-Type: application/json" -d "{\"session_id\":\"$SESSION_ID\", \"tunnel_url\":\"$CLEAN_URL\"}" "$API_URL/api/tunnel" >/dev/null
            echo "🔗 Session Linked: $SESSION_ID"
        fi
        break
    fi
done

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ ERROR: Tunnel failed. Check internet/firewall."
    exit 1
fi

echo "------------------------------------------"
echo " 🎉 CLOUD BRIDGE ESTABLISHED!"
echo " 1. Return to ChatLoom."
echo " 2. Perform a Hard Refresh (Shift + F5)."
echo "------------------------------------------"
