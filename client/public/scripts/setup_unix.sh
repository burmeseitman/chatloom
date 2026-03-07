#!/bin/bash
echo "=========================================="
echo "  ChatLoom - Automated Ollama Setup (Unix)"
echo "=========================================="
echo ""

# Identify the shell configuration file (zsh or bash)
SHELL_CONFIG=""
if [[ "$SHELL" == *"zsh"* ]]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
    SHELL_CONFIG="$HOME/.bashrc"
fi

echo "Setting environment variables in $SHELL_CONFIG..."

# Check if the variables are already present before adding
if ! grep -q "OLLAMA_HOST" "$SHELL_CONFIG"; then
    echo 'export OLLAMA_HOST="0.0.0.0"' >> "$SHELL_CONFIG"
fi

if ! grep -q "OLLAMA_ORIGINS" "$SHELL_CONFIG"; then
    echo 'export OLLAMA_ORIGINS="*"' >> "$SHELL_CONFIG"
fi

echo ""
echo "[SUCCESS] Configuration Completed!"
echo "Please RESTART your Terminal and Ollama to apply these changes."
echo ""
