@echo off
echo ==========================================
echo   ChatLoom - Automated Ollama Setup
echo ==========================================
echo.
echo Setting up permissions for ChatLoom...
echo.

:: Set environment variables permanently for the user
setx OLLAMA_HOST "0.0.0.0"
setx OLLAMA_ORIGINS "*"

echo.
echo [SUCCESS] Configuration Saved!
echo.
echo IMPORTANT: Please CLOSE and RESTART your Ollama application 
echo for these changes to take effect.
echo.
pause
