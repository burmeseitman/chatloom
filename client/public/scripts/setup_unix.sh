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

# --- Ollama Check & Install ---
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama is not detected on your system."
    read -p "❓ Would you like to install Ollama automatically? (y/n): " install_choice
    if [[ "$install_choice" =~ ^[Yy]$ ]]; then
        echo "📥 Starting Ollama installation..."
        OS_TYPE="$(uname -s)"
        if [[ "$OS_TYPE" == "Linux" ]]; then
            curl -fsSL https://ollama.com/install.sh | sh
        elif [[ "$OS_TYPE" == "Darwin" ]]; then
            if command -v brew &> /dev/null; then
                echo "🍺 Using Homebrew to install Ollama..."
                brew install --cask ollama
            else
                echo "❌ Homebrew is not installed. Please install it first or download Ollama from https://ollama.com/download"
                exit 1
            fi
        else
            echo "❌ Unsupported OS for automatic installation. Please visit https://ollama.com"
            exit 1
        fi
        echo "✅ Ollama installation requested!"
    else
        echo "⏭️  Skipping Ollama installation. Note: ChatLoom requires Ollama to be installed."
    fi
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

echo ""
echo "🧠  Checking for local AI Brain (llama3.2:1b)..."
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
