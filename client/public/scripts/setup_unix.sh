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

# --- Main Confirmation ---
echo "This script will automatically:"
echo " 1. Install Ollama (if missing)"
echo " 2. Configure Security Layers (OLLAMA_ORIGINS)"
echo " 3. Download the AI Brain (llama3.2:1b)"
echo ""
printf "❓ Do you want to proceed with autonomous setup? (y/n): "
read main_choice < /dev/tty

if [[ ! "$main_choice" =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled by user."
    exit 0
fi

echo "🚀 Starting autonomous setup..."
echo ""

# --- Ollama Check & Install ---
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama is not detected on your system."
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

# Official Secured Domain
SECURE_ORIGINS="https://www.chatloom.online, http://localhost:*, http://127.0.0.1:*"

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
echo 'export OLLAMA_HOST="0.0.0.0"' >> "$SHELL_CONFIG"
echo "export OLLAMA_ORIGINS=\"$SECURE_ORIGINS\"" >> "$SHELL_CONFIG"

# --- Ensure Ollama is running ---
echo "🔄 Ensuring Ollama service is active..."
if [[ "$(uname -s)" == "Darwin" ]]; then
    # On Mac, check if app is running, if not open it
    if ! pgrep -x "Ollama" > /dev/null; then
        echo "🚀 Starting Ollama application..."
        if [ -d "/Applications/Ollama.app" ]; then
            open "/Applications/Ollama.app"
        else
            # Fallback for older brew versions or manual installs elsewhere
            open -a Ollama || echo "⚠️  Could not start Ollama GUI. Please start it manually."
        fi
        echo "⏳ Waiting for Ollama to initialize (10s)..."
        sleep 10
    fi
else
    # On Linux, try to start systemd service if not active
    if ! systemctl is-active --quiet ollama; then
        echo "🚀 Starting Ollama service..."
        sudo systemctl start ollama || true
        sleep 5
    fi
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

if ollama list | grep -q "llama3.2:1b"; then
    echo "✨  Model 'llama3.2:1b' is already available."
else
    echo "📥  Pulling small Llama model (llama3.2:1b) for instant start..."
    ollama pull llama3.2:1b
    echo "✅  Model downloaded!"
fi

echo ""
echo " ✅ Security configuration successfully injected!"
echo "------------------------------------------"
echo " 🚀 NEXT STEPS:"
echo "  1. Close and RESTART your Terminal."
echo "  2. Fully RESTART the Ollama application."
echo "  3. Open ChatLoom: https://www.chatloom.online"
echo "------------------------------------------"
echo ""
