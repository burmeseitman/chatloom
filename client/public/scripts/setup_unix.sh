#!/bin/bash
# ==========================================
#   ChatLoom - One-Click Cloud Bridge (Unix)
# ==========================================
# Usage: curl -sSL ... | bash -s <SESSION_ID> <API_URL>

SESSION_ID=$1
API_URL=${2:-https://chatloom.online}
UNAME_S=$(uname -s)
UNAME_M=$(uname -m)

echo "------------------------------------------"
echo " 🐉 Initializing ChatLoom Cloud Bridge..."
echo "------------------------------------------"

# 1. Locate Ollama
OLLAMA_CMD=""
if command -v ollama &> /dev/null; then
    OLLAMA_CMD="ollama"
elif [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
    OLLAMA_CMD="/Applications/Ollama.app/Contents/Resources/ollama"
elif [ -x "/usr/local/bin/ollama" ]; then
    OLLAMA_CMD="/usr/local/bin/ollama"
fi

if [ -z "$OLLAMA_CMD" ]; then
    echo "⚠️  Ollama not found. Please install it first: https://ollama.com"
    exit 1
fi

echo "✅ Ollama detected."

# 2. Configure Environment (CORS & Host)
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_ORIGINS="*"

echo "🛡️  Injecting Security Policies..."
if [[ "$UNAME_S" == "Darwin" ]]; then
    launchctl setenv OLLAMA_HOST "0.0.0.0:11434"
    launchctl setenv OLLAMA_ORIGINS "*"
    [[ "$SHELL" == */zsh ]] && CONFIG="$HOME/.zshrc" || CONFIG="$HOME/.bashrc"
    sed -i '' '/OLLAMA_ORIGINS/d' "$CONFIG" 2>/dev/null
    sed -i '' '/OLLAMA_HOST/d' "$CONFIG" 2>/dev/null
    echo "export OLLAMA_HOST=\"0.0.0.0:11434\"" >> "$CONFIG"
    echo "export OLLAMA_ORIGINS=\"*\"" >> "$CONFIG"
fi

# 3. Restart Ollama with forced environment
echo "♻️  Resetting Ollama Engine..."
pkill -9 "Ollama" 2>/dev/null || true
pkill -9 "ollama" 2>/dev/null || true
sleep 3
nohup $OLLAMA_CMD serve >/tmp/ollama_engine.log 2>&1 &
echo "🚀 Ollama Engine started with Secure Access."

# 4. Check for Models
echo "🔎 Checking for local AI models..."
sleep 2
MODELS=$($OLLAMA_CMD list | grep -v "NAME")
if [ -z "$MODELS" ]; then
    echo "⚠️  No models found! Pulling 'llama3' (this may take a few mins)..."
    $OLLAMA_CMD pull llama3
else
    echo "✅ Models found: $(echo "$MODELS" | awk '{print $1}' | tr '\n' ' ')"
fi

# 5. Setup Cloudflare Tunnel
echo "☁️  Launching Secure Cloud Tunnel..."
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

pkill -f "cloudflared tunnel" 2>/dev/null || true
rm -f /tmp/chatloom_tunnel.log
$CLOUDFLARED_BIN tunnel --url http://127.0.0.1:11434 > /dev/null 2> /tmp/chatloom_tunnel.log &

# 6. Link to ChatLoom
echo "⏳ Routing your Node to the Cloud..."
TUNNEL_URL=""
for i in {1..30}; do
    sleep 2
    TUNNEL_URL=$(grep -o 'https://.*[.]trycloudflare[.]com' /tmp/chatloom_tunnel.log | head -n 1)
    if [ -n "$TUNNEL_URL" ]; then
        echo "✅ Cloud Node Active: $TUNNEL_URL"
        if [ -n "$SESSION_ID" ]; then
            CLEAN_URL=$(echo "$TUNNEL_URL" | sed 's/\/$//')
            curl -s -X POST -H "Content-Type: application/json" -d "{\"session_id\":\"$SESSION_ID\", \"tunnel_url\":\"$CLEAN_URL\"}" "$API_URL/api/tunnel" >/dev/null
            echo "🔗 Neural Link Established."
        fi
        break
    fi
done

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ ERROR: Cloud Routing Failed. Check Internet Connection."
    exit 1
fi

echo "------------------------------------------"
echo " 🎉 ALL DONE! NO MANUAL STEPS REMAINING."
echo " 🚀 Your screen will automatically update."
echo "------------------------------------------"
