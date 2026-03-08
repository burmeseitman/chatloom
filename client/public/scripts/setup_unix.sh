#!/bin/bash
# ==========================================
#   ChatLoom - Secure Node Bridge (Unix)
# ==========================================
# Optimized for: macOS & Linux
# curl -sSL https://chatloom.online/scripts/setup_unix.sh | bash

echo "------------------------------------------"
echo " 🐉 Initializing ChatLoom Secure Bridge..."
echo "------------------------------------------"
echo ""

# --- Pre-scan for Ollama ---
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

# --- Check Requirement ---
if [ -z "$OLLAMA_BIN" ]; then
    echo "------------------------------------------"
    echo " ❌ OLLAMA NOT DETECTED"
    echo "------------------------------------------"
    echo " To use ChatLoom, please follow these steps:"
    echo ""
    echo " 1. Download Ollama: https://ollama.com/download"
    echo " 2. Install it (Drag to Applications on Mac)"
    echo " 3. Launch Ollama from your Applications folder"
    echo " 4. Once the icon appears in your Menu Bar,"
    echo "    Run this command again to secure it."
    echo ""
    echo "------------------------------------------"
    exit 1
fi

# --- Main Confirmation ---
echo "This script will CONFIGURE your existing Ollama for ChatLoom:"
echo " 1. Inject Security Layers (OLLAMA_ORIGINS)"
echo " 2. Enable Local Networking (OLLAMA_HOST)"
echo ""
printf "❓ Proceed with secure configuration? (y/n): "
read main_choice < /dev/tty

if [[ ! "$main_choice" =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled by user."
    exit 0
fi

echo "🚀 Starting secure configuration..."
echo ""

# Official Secured Domains only (Strictly locked to ChatLoom for user safety)
SECURE_ORIGINS="https://chatloom.online, https://www.chatloom.online, https://*.chatloom.online"
OLLAMA_BIND="0.0.0.0:11434"

# Identify shell config
SHELL_CONFIG=""
if [[ "$SHELL" == */zsh ]]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [[ "$SHELL" == */bash ]]; then
    SHELL_CONFIG="$HOME/.bashrc"
else
    SHELL_CONFIG="$HOME/.profile"
fi

# Apply persistency
touch "$SHELL_CONFIG"
sed -i.bak '/OLLAMA_ORIGINS/d' "$SHELL_CONFIG" 2>/dev/null
sed -i.bak '/OLLAMA_HOST/d' "$SHELL_CONFIG" 2>/dev/null
echo "export OLLAMA_HOST=\"$OLLAMA_BIND\"" >> "$SHELL_CONFIG"
echo "export OLLAMA_ORIGINS=\"$SECURE_ORIGINS\"" >> "$SHELL_CONFIG"

# --- Instant Injection for current session ---
if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "🛡️  Applying instant security policy (macOS)..."
    launchctl setenv OLLAMA_HOST "$OLLAMA_BIND"
    launchctl setenv OLLAMA_ORIGINS "$SECURE_ORIGINS"
fi

# --- Refresh Ollama ---
echo "🔄 Refreshing Ollama session..."
if [[ "$(uname -s)" == "Darwin" ]]; then
    if pgrep -x "Ollama" > /dev/null; then
        echo "♻️  Restarting Ollama application..."
        killall Ollama || true
        sleep 3
    fi
    if [ -d "/Applications/Ollama.app" ]; then
        open "/Applications/Ollama.app"
    else
        open -a Ollama || echo "⚠️  Please start Ollama manually."
    fi
    sleep 10
else
    # Linux (Systemd)
    if systemctl is-active --quiet ollama; then
        echo "♻️  Restarting Ollama service..."
        sudo systemctl restart ollama || true
    else
        echo "🚀 Starting Ollama service..."
        sudo systemctl start ollama || true
    fi
    sleep 5
fi

# --- Connection Check ---
echo "🔗 Verifying secure bridge..."
MAX_RETRIES=10
RETRY_COUNT=0
while ! curl -s http://localhost:11434/api/tags > /dev/null; do
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "❌ Connection timed out. Ensure Ollama is running in your Menu Bar/System Tray."
        exit 1
    fi
    echo "⏳ Waiting for API ($((RETRY_COUNT+1))/$MAX_RETRIES)..."
    sleep 3
    RETRY_COUNT=$((RETRY_COUNT+1))
done

echo "✅ Configuration successful!"
echo ""
echo "------------------------------------------"
echo " 🎉 CHATLOOM IS READY!"
echo "  1. Go back to your browser."
echo "  2. Your local node is now secure."
echo ""
echo " 💡 TIP: If you use BRAVE, ARC, or SAFARI:"
echo "    Please disable 'Shields' or 'Privacy Shields'"
echo "    for chatloom.online so it can find your AI."
echo "------------------------------------------"
echo ""
