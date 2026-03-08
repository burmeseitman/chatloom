# ==========================================
#   ChatLoom - Secure Node Onboarding (Win)
# ==========================================
# PowerShell version for Windows.
# irm https://chatloom.online/scripts/setup_windows.ps1 | iex

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing ChatLoom Secure Bridge..." -ForegroundColor Cyan
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host ""

# --- Ollama Check & Install ---
if (!(Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  Ollama is not detected on your system." -ForegroundColor Yellow
    $choice = Read-Host "❓ Would you like to install Ollama automatically? (y/n)"
    if ($choice -match "[Yy]") {
        Write-Host "📥 Starting Ollama installation via winget..." -ForegroundColor Cyan
        Try {
            winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements
            Write-Host "✅ Ollama installation requested!" -ForegroundColor Green
        } Catch {
            Write-Host "❌ winget failed. Please download Ollama manually from https://ollama.com/download" -ForegroundColor Red
            Exit
        }
    } else {
        Write-Host "⏭️  Skipping Ollama installation. Note: ChatLoom requires Ollama to be installed." -ForegroundColor Gray
    }
} else {
    Write-Host "✨ Ollama is already installed. Proceeding with configuration..." -ForegroundColor Green
}

Write-Host ""

# Define Secure Origins (Official production + local nodes)
$SECURE_ORIGINS = "https://www.chatloom.online, http://localhost:*, http://127.0.0.1:*"

Write-Host "🛡️  Configuring security layers for your local node..." -ForegroundColor White

# Use Environment variable for the Current User
Try {
    [Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0", "User")
    [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "$SECURE_ORIGINS", "User")
    
    Write-Host ""
    Write-Host "🧠  Checking for local AI Brain (llama3.2:1b)..." -ForegroundColor Magenta
    $modelCheck = ollama list | Select-String "llama3.2:1b"
    if ($modelCheck) {
        Write-Host "✨  Model 'llama3.2:1b' is already available." -ForegroundColor Green
    } else {
        Write-Host "📥  Pulling small Llama model (llama3.2:1b) for instant start..." -ForegroundColor Cyan
        ollama pull llama3.2:1b
        Write-Host "✅  Model downloaded!" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host " ✅ Security configuration successfully injected!" -ForegroundColor Green
    Write-Host "------------------------------------------" -ForegroundColor Yellow
    Write-Host " 🚀 NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "  1. Close and RESTART your PowerShell window." -ForegroundColor White
    Write-Host "  2. Fully RESTART your Ollama application." -ForegroundColor White
    Write-Host "  3. Open ChatLoom: https://www.chatloom.online" -ForegroundColor White
    Write-Host "------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
} Catch {
    Write-Host " ❌ Error setting environment variables. Please run as Administrator." -ForegroundColor Red
}

Pause
