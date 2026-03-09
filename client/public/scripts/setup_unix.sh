#!/bin/bash
# ==========================================
#   ChatLoom - One-Click Cloud Bridge (Unix)
# ==========================================
# Usage: curl -sSL ... | bash -s <SESSION_ID> <API_URL>

SESSION_ID=$1
API_URL=${2:-https://chatloom.online}
UNAME_S=$(uname -s)
UNAME_M=$(uname -m)

# Extract domain from API_URL for CORS
DOMAIN=$(echo $API_URL | awk -F[/:] '{print $4}')

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
    echo "⚠️  Ollama not detected."
    echo "------------------------------------------"
    echo " 🚀 Downloading Ollama Installer..."
    if [[ "$UNAME_S" == "Darwin" ]]; then
        echo "🍎 Fetching Mac Package..."
        curl -L "https://ollama.com/download/Ollama-darwin.zip" -o /tmp/Ollama.zip
        unzip -q /tmp/Ollama.zip -d /tmp/ 2>/dev/null
        echo "✅ Downloaded to /tmp/Ollama.app"
        echo "👉 Please move Ollama to Applications and launch it."
        open /tmp/
    else
        echo "🐧 Running Linux Install Script..."
        curl -fsSL https://ollama.com/install.sh | sh
    fi
    echo "------------------------------------------"
    echo "👉 After launching Ollama, please run this script again."
    exit 1
fi

echo "✅ Ollama detected."

# 2. Configure Ollama for Browser Access (CORS)
# We add dynamic domain and tunnel wildcard to allow requests from anywhere
SECURE_ORIGINS="https://chatloom.online,https://*.chatloom.online,http://localhost:*,http://127.0.0.1:*,https://*.trycloudflare.com,http://*.trycloudflare.com,https://$DOMAIN,http://$DOMAIN"
OLLAMA_BIND="0.0.0.0:11434"

if [[ "$UNAME_S" == "Darwin" ]]; then
    echo "🛡️  Injecting Security Policies (macOS)..."
    
    # Persistent update for Shell
    SHELL_CONFIG=""
    if [[ "$SHELL" == */zsh ]]; then SHELL_CONFIG="$HOME/.zshrc"; else SHELL_CONFIG="$HOME/.bashrc"; fi
    
    touch "$SHELL_CONFIG"
    sed -i '' '/OLLAMA_ORIGINS/d' "$SHELL_CONFIG" 2>/dev/null
    sed -i '' '/OLLAMA_HOST/d' "$SHELL_CONFIG" 2>/dev/null
    echo "export OLLAMA_HOST=\"$OLLAMA_BIND\"" >> "$SHELL_CONFIG"
    echo "export OLLAMA_ORIGINS=\"$SECURE_ORIGINS\"" >> "$SHELL_CONFIG"
    
    # Immediate session update
    launchctl setenv OLLAMA_HOST "$OLLAMA_BIND"
    launchctl setenv OLLAMA_ORIGINS "$SECURE_ORIGINS"
    
    echo "♻️  Restarting Ollama to apply changes..."
    pkill -9 "Ollama" 2>/dev/null || true
    sleep 2
    
    # Launching with EXPLICIT environment variables to force override
    if [ -d "/Applications/Ollama.app" ]; then
        OLLAMA_HOST="$OLLAMA_BIND" OLLAMA_ORIGINS="$SECURE_ORIGINS" open "/Applications/Ollama.app"
    elif [ -d "$HOME/Applications/Ollama.app" ]; then
        OLLAMA_HOST="$OLLAMA_BIND" OLLAMA_ORIGINS="$SECURE_ORIGINS" open "$HOME/Applications/Ollama.app"
    elif [ -d "/tmp/Ollama.app" ]; then
        OLLAMA_HOST="$OLLAMA_BIND" OLLAMA_ORIGINS="$SECURE_ORIGINS" open "/tmp/Ollama.app"
    fi
else
    # Linux Persistence
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
    echo "⬇️  Downloading respective cloudflared binary ($UNAME_S $UNAME_M)..."
    BASE_URL="https://github.com/cloudflare/cloudflared/releases/latest/download"
    if [[ "$UNAME_S" == "Darwin" ]]; then
        FILE_NAME="cloudflared-darwin-arm64.tgz"
        [[ "$UNAME_M" != "arm64" ]] && FILE_NAME="cloudflared-darwin-amd64.tgz"
        curl -L -f "$BASE_URL/$FILE_NAME" -o "/tmp/$FILE_NAME"
        tar -xzf "/tmp/$FILE_NAME" -C /tmp/ 2>/dev/null
        chmod +x /tmp/cloudflared
        CLOUDFLARED_BIN="/tmp/cloudflared"
    else
        URL="$BASE_URL/cloudflared-linux-amd64"
        [[ "$UNAME_M" == "aarch64" || "$UNAME_M" == "arm64" ]] && URL="$BASE_URL/cloudflared-linux-arm64"
        curl -L -f "$URL" -o /tmp/cloudflared
        chmod +x /tmp/cloudflared
        CLOUDFLARED_BIN="/tmp/cloudflared"
    fi
fi

pkill -f "cloudflared tunnel --url" 2>/dev/null || true
rm -f /tmp/chatloom_tunnel.log

echo "⚡ Starting Neural Link..."
$CLOUDFLARED_BIN tunnel --url http://127.0.0.1:11434 > /dev/null 2> /tmp/chatloom_tunnel.log &

# 4. Wait for Tunnel URL
echo "⏳ Routing your AI node to the cloud (may take up to 60s)..."
TUNNEL_URL=""
for i in {1..30}; do
    sleep 2
    if [ -f /tmp/chatloom_tunnel.log ]; then
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
    fi
done

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ ERROR: Tunnel generation timed out."
    exit 1
fi

echo "------------------------------------------"
echo " 🎉 SETUP COMPLETE!"
echo " 🚀 Return to ChatLoom and start chatting."
echo "------------------------------------------"
