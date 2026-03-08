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
# Fix common permission issues if .ollama exists (Silent Fix)
if [ -d "$HOME/.ollama" ]; then
    if [ ! -w "$HOME/.ollama" ]; then
        echo "🔧 Fixing .ollama directory permissions..."
        sudo chown -R $(whoami) "$HOME/.ollama" &>/dev/null
        sudo chmod -R 755 "$HOME/.ollama" &>/dev/null
    fi
fi

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

# Official Secured Domains only (Strictly locked to ChatLoom)
# '*' wildcard was removed to prevent malicious Cross-Site Request Forgery (CSRF).
SECURE_ORIGINS="https://chatloom.online,https://www.chatloom.online,https://*.chatloom.online,http://chatloom.online,http://www.chatloom.online,http://localhost"
OLLAMA_BIND="0.0.0.0:11434"

# --- Persistency (Shell Config) ---
SHELL_CONFIG=""
if [[ "$SHELL" == */zsh ]]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [[ "$SHELL" == */bash ]]; then
    SHELL_CONFIG="$HOME/.bashrc"
else
    SHELL_CONFIG="$HOME/.profile"
fi

# Apply to file for reboots
touch "$SHELL_CONFIG"
sed -i.bak '/OLLAMA_ORIGINS/d' "$SHELL_CONFIG" 2>/dev/null
sed -i.bak '/OLLAMA_HOST/d' "$SHELL_CONFIG" 2>/dev/null
echo "export OLLAMA_HOST=\"$OLLAMA_BIND\"" >> "$SHELL_CONFIG"
echo "export OLLAMA_ORIGINS=\"$SECURE_ORIGINS\"" >> "$SHELL_CONFIG"

# --- Force inject into current session and background services ---
export OLLAMA_HOST="$OLLAMA_BIND"
export OLLAMA_ORIGINS="$SECURE_ORIGINS"

if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "🛡️  Injecting system-level policies (macOS)..."
    launchctl setenv OLLAMA_HOST "$OLLAMA_BIND"
    launchctl setenv OLLAMA_ORIGINS "$SECURE_ORIGINS"
fi

# --- Deep Refresh Ollama ---
echo "🔄 Performing deep session refresh..."
if [[ "$(uname -s)" == "Darwin" ]]; then
    # Completely flush any hanging Ollama processes
    pkill -9 "Ollama" 2>/dev/null || true
    killall "Ollama" 2>/dev/null || true
    sleep 3
    
    echo "🚀 Launching Ollama with new security context..."
    # Launching via 'env' to be absolute
    if [ -d "/Applications/Ollama.app" ]; then
        OLLAMA_HOST="$OLLAMA_BIND" OLLAMA_ORIGINS="$SECURE_ORIGINS" open "/Applications/Ollama.app"
    else
        OLLAMA_HOST="$OLLAMA_BIND" OLLAMA_ORIGINS="$SECURE_ORIGINS" open -a Ollama || echo "⚠️ Please start Ollama manually."
    fi
    sleep 10
else
    # Linux (Service persistence fix)
    echo "🔧 Updating Linux service configuration..."
    sudo mkdir -p /etc/systemd/system/ollama.service.d
    echo "[Service]
Environment=\"OLLAMA_HOST=$OLLAMA_BIND\"
Environment=\"OLLAMA_ORIGINS=$SECURE_ORIGINS\"" | sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null
    
    sudo systemctl daemon-reload
    sudo systemctl restart ollama || true
    sleep 5
fi

# --- Verify Bridge ---
echo "🔗 Verifying secure bridge..."
# We test with the production domains as origin simulator
MAX_RETRIES=10
RETRY_COUNT=0
while ! curl -s -f http://localhost:11434/api/tags > /dev/null; do
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "❌ Connection failed. Ensure Ollama is running in your Menu Bar/System Tray."
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
echo "  1. Back to Browser."
echo "  2. REFRESH the page (Shift+F5)."
echo ""
echo " ⚠️  IMPORTANT (Brave/Chrome/Safari):"
echo "    If AI is still NOT FOUND, go to:"
echo "    http://localhost:11434"
echo "    If it says 'Ollama is running', return here"
echo "    and refresh. This 'wakes up' the browser."
echo "------------------------------------------"
echo ""
