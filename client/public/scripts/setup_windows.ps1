# ==========================================
#   ChatLoom - Secure Node Onboarding (Win)
# ==========================================
# PowerShell version for Windows.
# irm https://chatloom.online/scripts/setup_windows.ps1 | iex

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing ChatLoom Secure Bridge..." -ForegroundColor Cyan
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host ""

# --- Main Confirmation ---
Write-Host "This script will automatically:" -ForegroundColor White
Write-Host " 1. Install Ollama (if missing via winget)" -ForegroundColor White
Write-Host " 2. Configure Environment Variables (OLLAMA_ORIGINS)" -ForegroundColor White
Write-Host " 3. Download the AI Brain (llama3.2:1b)" -ForegroundColor White
Write-Host ""

$mainChoice = Read-Host "❓ Do you want to proceed with autonomous setup? (y/n)"
if ($mainChoice -notmatch "[Yy]") {
    Write-Host "❌ Setup cancelled by user." -ForegroundColor Red
    Exit
}

Write-Host "🚀 Starting autonomous setup..." -ForegroundColor Cyan
Write-Host ""

# --- Ollama Check & Install ---
if (!(Get-Command ollama -ErrorAction SilentlyContinue)) {
    # Check common path as fallback before installing
    $userOllamaPath = "$env:LOCALAPPDATA\Ollama\ollama.exe"
    if (Test-Path $userOllamaPath) {
        Write-Host "✨ Ollama found at $userOllamaPath. Adding to current session PATH..." -ForegroundColor Green
        $env:PATH += ";$env:LOCALAPPDATA\Ollama"
    } else {
        Write-Host "⚠️  Ollama is not detected on your system." -ForegroundColor Yellow
        Write-Host "📥 Starting autonomous Ollama installation..." -ForegroundColor Cyan
        Try {
            winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements --silent
            Write-Host "✅ Ollama installation requested!" -ForegroundColor Green
            
            # Briefly wait and refresh PATH for this session
            Start-Sleep -Seconds 5
            $env:PATH = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
            
            if (!(Get-Command ollama -ErrorAction SilentlyContinue)) {
                # Final fallback check
                if (Test-Path $userOllamaPath) {
                    $env:PATH += ";$env:LOCALAPPDATA\Ollama"
                }
            }
        } Catch {
            Write-Host "❌ winget failed. Please download Ollama manually from https://ollama.com/download" -ForegroundColor Red
            Exit
        }
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
    Write-Host "🔄 Ensuring Ollama service is active..." -ForegroundColor Cyan
    
    # Try to start Ollama if not running
    $ollamaProcess = Get-Process ollama -ErrorAction SilentlyContinue
    if (!$ollamaProcess) {
        Write-Host "🚀 Starting Ollama application..." -ForegroundColor Cyan
        $ollamaExe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
        if (!$ollamaExe) { $ollamaExe = "$env:LOCALAPPDATA\Ollama\ollama.exe" }
        
        if (Test-Path $ollamaExe) {
            # Start the actual GUI app which handles 'serve' automatically
            Start-Process $ollamaExe
        } else {
            Start-Process "ollama" "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
        }
        Write-Host "⏳ Waiting for Ollama to initialize (10s)..." -ForegroundColor Gray
        Start-Sleep -Seconds 10
    }

    Write-Host "🧠  Checking for local AI Brain (llama3.2:1b)..." -ForegroundColor Magenta
    
    # Wait for API to be ready
    $maxRetries = 5
    $retryCount = 0
    while ($true) {
        Try {
            $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -ErrorAction Stop
            break
        } Catch {
            if ($retryCount -ge $maxRetries) {
                Write-Host "❌ Could not connect to Ollama API. Please start Ollama manually and try again." -ForegroundColor Red
                Break
            }
            Write-Host "⏳ Waiting for Ollama API to be ready... ($($retryCount + 1)/$maxRetries)" -ForegroundColor Gray
            Start-Sleep -Seconds 5
            $retryCount++
        }
    }

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
    Write-Host "  2. Fully RESTART your Ollama application (check System Tray)." -ForegroundColor White
    Write-Host "  3. Open ChatLoom: $((Get-Variable -Name "window.location.origin" -ErrorAction SilentlyContinue).Value ?? "https://www.chatloom.online")" -ForegroundColor White
    Write-Host "------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
} Catch {
    Write-Host " ❌ Error during configuration. Please run as Administrator if variables failed." -ForegroundColor Red
}

Pause
