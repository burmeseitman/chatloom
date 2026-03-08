# ==========================================
#   ChatLoom - Secure Node Onboarding (Win)
# ==========================================
# PowerShell version for Windows.
# irm https://chatloom.online/scripts/setup_windows.ps1 | iex

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing ChatLoom Secure Bridge..." -ForegroundColor Cyan
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host ""

# --- Pre-scan for existing setup ---
$OLLAMA_STATUS = "[Will Install]"
$MODEL_STATUS = "[Will Pull]"

# Check for Ollama in PATH or common locations
$ollamaUserPath = "$env:LOCALAPPDATA\Ollama\ollama.exe"
if ((Get-Command ollama -ErrorAction SilentlyContinue) -or (Test-Path $ollamaUserPath)) {
    $OLLAMA_STATUS = "[Already Found ✨]"
}

# Check for model if ollama is found
if ($OLLAMA_STATUS -match "Found") {
    $modelCheck = ollama list 2>$null | Select-String "llama3.2:1b"
    if ($modelCheck) {
        $MODEL_STATUS = "[Already Found ✨]"
    }
}

# --- Main Confirmation ---
Write-Host "Based on your system, this script will:" -ForegroundColor White
Write-Host " 1. Install Ollama: $OLLAMA_STATUS" -ForegroundColor White
Write-Host " 2. Configure Environment Variables (CORS): [Fixing...]" -ForegroundColor White
Write-Host " 3. Download AI Brain (llama3.2:1b): $MODEL_STATUS" -ForegroundColor White
Write-Host ""

$mainChoice = Read-Host "❓ Do you want to proceed with autonomous setup? (y/n)"
if ($mainChoice -notmatch "[Yy]") {
    Write-Host "❌ Setup cancelled by user." -ForegroundColor Red
    Exit
}

Write-Host "🚀 Starting autonomous setup..." -ForegroundColor Cyan
Write-Host ""

# --- Ollama Check & Install ---
if ($OLLAMA_STATUS -match "Install") {
    Write-Host "📥 Starting autonomous Ollama installation..." -ForegroundColor Cyan
    Try {
        winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements --silent
        Write-Host "✅ Ollama installation requested!" -ForegroundColor Green
        
        # Briefly wait and refresh PATH for this session
        Start-Sleep -Seconds 5
        $env:PATH = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    } Catch {
        Write-Host "❌ winget failed. Please download Ollama manually from https://ollama.com/download" -ForegroundColor Red
        Exit
    }
} else {
    # If found via pre-scan but not in command path, add it now
    if (!(Get-Command ollama -ErrorAction SilentlyContinue) -and (Test-Path $ollamaUserPath)) {
         $env:PATH += ";$env:LOCALAPPDATA\Ollama"
    }
    Write-Host "✨ Ollama is already installed. Proceeding with configuration..." -ForegroundColor Green
}

Write-Host ""

# Define Secure Origins (Whitelisted ChatLoom domains only for safety)
$SECURE_ORIGINS = "https://chatloom.online, https://www.chatloom.online, https://*.chatloom.online, http://localhost:*, http://127.0.0.1:*"
$OLLAMA_BIND = "0.0.0.0:11434"

Write-Host "🛡️  Configuring security layers for your local node..." -ForegroundColor White

# Use Environment variable for the Current User
Try {
    [Environment]::SetEnvironmentVariable("OLLAMA_HOST", "$OLLAMA_BIND", "User")
    [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "$SECURE_ORIGINS", "User")
    
    Write-Host ""
    Write-Host "🔄 Ensuring Ollama service is active with new settings..." -ForegroundColor Cyan
    
    # Check if Ollama is already running
    $ollamaProcess = Get-Process ollama -ErrorAction SilentlyContinue
    if ($ollamaProcess) {
        Write-Host "♻️  Restarting Ollama to apply new security layers..." -ForegroundColor Yellow
        Stop-Process -Name ollama -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }

    Write-Host "🚀 Starting Ollama application..." -ForegroundColor Cyan
    $ollamaExe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
    if (!$ollamaExe) { $ollamaExe = "$env:LOCALAPPDATA\Ollama\ollama.exe" }
    
    if (Test-Path $ollamaExe) {
        Start-Process $ollamaExe
    } else {
        Start-Process "ollama" "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
    }
    
    Write-Host "⏳ Waiting for Ollama (15s)..." -ForegroundColor Gray
    Start-Sleep -Seconds 15

    Write-Host "🧠  Synchronizing AI Brain (llama3.2:1b)..." -ForegroundColor Magenta
    
    # Wait for API to be ready
    $maxRetries = 10
    $retryCount = 0
    while ($true) {
        Try {
            $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -ErrorAction Stop
            break
        } Catch {
            if ($retryCount -ge $maxRetries) {
                Write-Host "❌ Could not connect to Ollama API at localhost:11434." -ForegroundColor Red
                Write-Host "💡 Tip: Check your System Tray for the Ollama icon." -ForegroundColor Gray
                Break
            }
            Write-Host "⏳ Waiting for Ollama API to be ready... ($($retryCount + 1)/$maxRetries)" -ForegroundColor Gray
            Start-Sleep -Seconds 3
            $retryCount++
        }
    }

    # Force pull to ensure integrity
    Write-Host "📥 Ensuring 'llama3.2:1b' is fully loaded..." -ForegroundColor Cyan
    ollama pull llama3.2:1b

    $modelCheck = ollama list 2>$null | Select-String "llama3.2:1b"
    if ($modelCheck) {
        Write-Host "✨  Model 'llama3.2:1b' is verified and ready!" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to load model. Please run 'ollama pull llama3.2:1b' manually." -ForegroundColor Red
        Exit
    }
    
    Write-Host ""
    Write-Host " 🎉 Setup Complete! No restart required." -ForegroundColor Green
    Write-Host "------------------------------------------" -ForegroundColor Yellow
    Write-Host " 🚀 NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "  1. Go back to ChatLoom in your browser." -ForegroundColor White
    Write-Host "  2. It will now detect your local AI Brain." -ForegroundColor White
    Write-Host "------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
} Catch {
    Write-Host " ❌ Error during configuration. Please run as Administrator if variables failed." -ForegroundColor Red
}

Pause
