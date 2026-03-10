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

# 2. Configure Environment (CORS & Host)
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_ORIGINS="*"

if [[ "$UNAME_S" == "Darwin" ]]; then
    launchctl setenv OLLAMA_HOST "0.0.0.0:11434"
    launchctl setenv OLLAMA_ORIGINS "*"
fi

# 3. Restart Engine (Forcing New Core Config)
echo "♻️  Resetting Brain Engine..."
pkill -9 "Ollama" 2>/dev/null || true
pkill -9 "ollama" 2>/dev/null || true
sleep 2
nohup $OLLAMA_CMD serve >/tmp/ollama_engine.log 2>&1 &
echo "🚀 Engine Active with Neural Access."

# 4. Auto-Pull llama3 if empty
echo "🔎 Scanning local models..."
sleep 2
MODELS=$($OLLAMA_CMD list | grep -v "NAME")
if [ -z "$MODELS" ]; then
    echo "⚠️  No models found. Auto-pulling 'llama3'..."
    $OLLAMA_CMD pull llama3
else
    echo "✅ Knowledge Base ready."
fi

# 5. Launch Cloudflare Tunnel
echo "☁️  Establishing Secure Tunnel..."
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

# 6. Session Registration
echo "⏳ Syncing with ChatLoom Cloud..."
TUNNEL_URL=""
for i in {1..30}; do
    sleep 2
    TUNNEL_URL=$(grep -o 'https://.*[.]trycloudflare[.]com' /tmp/chatloom_tunnel.log | head -n 1)
    if [ -n "$TUNNEL_URL" ]; then
        echo "⏳ Validating Cloud Entrypoint..."
        CLEAN_URL=$(echo "$TUNNEL_URL" | sed 's/\/$//')
        
        # Wait up to 10s for the tunnel to actually respond
        for j in {1..5}; do
            if curl -s -f "$CLEAN_URL/api/tags" > /dev/null; then
                echo "✅ Cloud Entrypoint: $CLEAN_URL (Active)"
                if [ -n "$SESSION_ID" ]; then
                    # SYNC: Send to backend
                    SYNC_RES=$(curl -s -X POST -H "Content-Type: application/json" \
                         -d "{\"session_id\":\"$SESSION_ID\", \"tunnel_url\":\"$CLEAN_URL\"}" \
                         "$API_URL/api/tunnel")
                    
                    if [[ "$SYNC_RES" == *"success"* ]]; then
                         echo "🔗 Neural Link Established."
                    fi
                fi
                break
            fi
            echo "   (Waiting for Cloudflare routing...)"
            sleep 2
        done
        break
    fi
done

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ ERROR: Cloud Link Failed. Check your Internet."
    exit 1
fi

echo "------------------------------------------"
echo " 🎉 SETUP COMPLETE! EVERYTHING IS READY."
echo " 🚀 Your browser will auto-update now."
echo "------------------------------------------"
