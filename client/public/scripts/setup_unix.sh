#!/bin/bash
# ==========================================
#   ChatLoom - Secure Node Onboarding (Unix)
# ==========================================
# curl -sSL https://chatloom.online/scripts/setup_unix.sh | bash

set -e

# Clear screen for a better UX
clear

echo "------------------------------------------"
echo " 🐉 Initializing ChatLoom Secure Bridge..."
echo "------------------------------------------"
echo ""

# --- Pre-scan for existing setup ---
OLLAMA_STATUS="[Will Install]"
MODEL_STATUS="[Will Pull]"

# Check for Ollama in PATH or common locations
if command -v ollama &> /dev/null || [ -f "/usr/local/bin/ollama" ] || [ -f "/opt/homebrew/bin/ollama" ] || [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
    OLLAMA_STATUS="[Already Found ✨]"
fi

# Check for model if ollama is found
if [[ "$OLLAMA_STATUS" == *Found* ]]; then
    if ollama list 2>/dev/null | grep -q "llama3.2:1b"; then
        MODEL_STATUS="[Already Found ✨]"
    fi
fi

# --- Main Confirmation ---
echo "Based on your system, this script will:"
echo " 1. Install Ollama: $OLLAMA_STATUS"
echo " 2. Configure Security Layers (OLLAMA_ORIGINS): [Fixing...]"
echo " 3. Download AI Brain (llama3.2:1b): $MODEL_STATUS"
echo ""
printf "❓ Do you want to proceed with autonomous setup? (y/n): "
read main_choice < /dev/tty

if [[ ! "$main_choice" =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled by user."
    exit 0
fi

echo "🚀 Starting autonomous setup..."
echo ""

# Update PATH if common locations exist but not in current PATH
if [ -d "/opt/homebrew/bin" ]; then export PATH="/opt/homebrew/bin:$PATH"; fi
if [ -d "/usr/local/bin" ]; then export PATH="/usr/local/bin:$PATH"; fi
if [ -d "/Applications/Ollama.app/Contents/Resources" ]; then export PATH="/Applications/Ollama.app/Contents/Resources:$PATH"; fi

# --- Ollama Check & Install ---
if [[ "$OLLAMA_STATUS" == *Install* ]]; then
    echo "📥 Starting autonomous Ollama installation..."
    
    OS_TYPE="$(uname -s)"
    if [[ "$OS_TYPE" == "Linux" ]]; then
        curl -fsSL https://ollama.com/install.sh | sh
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        if command -v brew &> /dev/null; then
            echo "🍺 Using Homebrew to install Ollama..."
            brew install --cask ollama
        else
            echo "❌ Homebrew is not installed. Please install it manually from https://ollama.com"
            exit 1
        fi
    fi
    
    # After installation, try to add to path for current session if possible
    if [[ "$OS_TYPE" == "Darwin" ]]; then
        export PATH="/Applications/Ollama.app/Contents/Resources:$PATH"
    fi
    
    echo "✅ Ollama installation requested!"
else
    echo "✨ Ollama is already installed. Proceeding with configuration..."
fi

echo ""

# Official Secured Domains only (Protects user from malicious sites)
SECURE_ORIGINS="https://chatloom.online, https://www.chatloom.online, https://*.chatloom.online, http://localhost:*, http://127.0.0.1:*"
OLLAMA_BIND="0.0.0.0:11434"

# Identify the shell configuration file (zsh or bash)
SHELL_CONFIG=""
if [[ "$SHELL" == *"zsh"* ]]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
    SHELL_CONFIG="$HOME/.bashrc"
else
    SHELL_CONFIG="$HOME/.profile"
fi

echo "🛡️  Configuring security layers in $SHELL_CONFIG..."

# Create file if not exists
touch "$SHELL_CONFIG"

# Clean up old iterations of these variables to prevent duplicates
if [ -f "$SHELL_CONFIG" ]; then
    # Use a temporary file for safety
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' '/export OLLAMA_ORIGINS=/d' "$SHELL_CONFIG" 2>/dev/null
        sed -i '' '/export OLLAMA_HOST=/d' "$SHELL_CONFIG" 2>/dev/null
    else
        sed -i '/export OLLAMA_ORIGINS=/d' "$SHELL_CONFIG" 2>/dev/null
        sed -i '/export OLLAMA_HOST=/d' "$SHELL_CONFIG" 2>/dev/null
    fi
fi

# Inject the secure variables
echo "export OLLAMA_HOST=\"$OLLAMA_BIND\"" >> "$SHELL_CONFIG"
echo "export OLLAMA_ORIGINS=\"$SECURE_ORIGINS\"" >> "$SHELL_CONFIG"

# --- Seamless Integration (No Restart Hack) ---
if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "🛡️  Applying instant security policy (macOS)..."
    launchctl setenv OLLAMA_HOST "$OLLAMA_BIND"
    launchctl setenv OLLAMA_ORIGINS "$SECURE_ORIGINS"
fi

# --- Ensure Ollama is running (with auto-restart if needed) ---
echo "🔄 Ensuring Ollama service is active with new settings..."
if [[ "$(uname -s)" == "Darwin" ]]; then
    # If Ollama is running, we MUST restart it to pick up new CORS settings
    if pgrep -x "Ollama" > /dev/null; then
        echo "♻️  Restarting Ollama to apply new security layers..."
        killall Ollama || true
        sleep 2
    fi
    
    echo "🚀 Starting Ollama application..."
    if [ -d "/Applications/Ollama.app" ]; then
        open "/Applications/Ollama.app"
    else
        open -a Ollama || echo "⚠️  Could not start Ollama GUI. Please start it manually."
    fi
    echo "⏳ Waiting for Ollama to initialize (10s)..."
    sleep 10
else
    # Linux...
    if systemctl is-active --quiet ollama; then
        echo "♻️  Restarting Ollama service..."
        sudo systemctl restart ollama || true
    else
        echo "🚀 Starting Ollama service..."
        sudo systemctl start ollama || true
    fi
    sleep 5
fi

echo ""
echo "🧠  Checking for local AI Brain (llama3.2:1b)..."
# Try a few times to connect to the API
MAX_RETRIES=5
RETRY_COUNT=0
while ! curl -s http://localhost:11434/api/tags > /dev/null; do
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "❌ Could not connect to Ollama API. Please make sure Ollama is running and try again."
        exit 1
    fi
    echo "⏳ Waiting for Ollama API to be ready... ($((RETRY_COUNT+1))/$MAX_RETRIES)"
    sleep 5
    RETRY_COUNT=$((RETRY_COUNT+1))
done

if ollama list 2>/dev/null | grep -q "llama3.2:1b"; then
    echo "✨  Model 'llama3.2:1b' is already available."
else
    echo "📥  Pulling small Llama model (llama3.2:1b) for instant start..."
    ollama pull llama3.2:1b
    echo "✅  Model downloaded!"
fi

echo ""
echo " 🎉 Setup Complete! No restart required."
echo "------------------------------------------"
echo " 🚀 NEXT STEPS:"
echo "  1. Go back to ChatLoom in your browser."
echo "  2. It will now detect your local AI Brain."
echo "------------------------------------------"
echo ""
