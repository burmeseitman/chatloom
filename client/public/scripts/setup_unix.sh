#!/bin/bash
# ==========================================
#   ChatLoom - Secure Node Onboarding (Unix)
# ==========================================
# curl -sSL https://www.chatloom.online/scripts/setup_unix.sh | bash

set -e

# Clear screen for a better UX
clear

echo "------------------------------------------"
echo " 🐉 Initializing ChatLoom Secure Bridge..."
echo "------------------------------------------"
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

echo "Configuring security layers in $SHELL_CONFIG..."

# Create file if not exists
touch "$SHELL_CONFIG"

# Clean up old iterations of these variables to prevent duplicates
if [ -f "$SHELL_CONFIG" ]; then
    # Use a temporary file for safety
    sed -i.bak '/export OLLAMA_ORIGINS=/d' "$SHELL_CONFIG" 2>/dev/null
    sed -i.bak '/export OLLAMA_HOST=/d' "$SHELL_CONFIG" 2>/dev/null
    rm -f "${SHELL_CONFIG}.bak"
fi

# Inject the secure variables
echo 'export OLLAMA_HOST="0.0.0.0"' >> "$SHELL_CONFIG"
echo "export OLLAMA_ORIGINS=\"$SECURE_ORIGINS\"" >> "$SHELL_CONFIG"

echo ""
echo " ✅ Security configuration successfully injected!"
echo "------------------------------------------"
echo " 🚀 NEXT STEPS:"
echo "  1. Close and RESTART your Terminal."
echo "  2. Fully RESTART the Ollama application."
echo "  3. Refresh https://www.chatloom.online"
echo "------------------------------------------"
echo ""
