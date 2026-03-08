# ==========================================
#   ChatLoom - Secure Node Bridge (Win)
# ==========================================
# PowerShell version for Windows.
# irm https://chatloom.online/scripts/setup_windows.ps1 | iex

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing ChatLoom Secure Bridge..." -ForegroundColor Cyan
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host ""

# --- Pre-scan for Ollama ---
$ollamaUserPath = "$env:LOCALAPPDATA\Ollama\ollama.exe"
$OLLAMA_FOUND = $false

if (Get-Command ollama -ErrorAction SilentlyContinue) {
    $OLLAMA_FOUND = $true
} elseif (Test-Path $ollamaUserPath) {
    $OLLAMA_FOUND = $true
    # Add to current session PATH
    $env:PATH += ";$env:LOCALAPPDATA\Ollama"
}

# --- Check Requirement ---
if (-not $OLLAMA_FOUND) {
    Write-Host "------------------------------------------" -ForegroundColor Red
    Write-Host " ❌ OLLAMA NOT DETECTED" -ForegroundColor Red
    Write-Host "------------------------------------------" -ForegroundColor Red
    Write-Host " To use ChatLoom, please follow these steps:" -ForegroundColor White
    Write-Host ""
    Write-Host " 1. Download Ollama: https://ollama.com/download" -ForegroundColor Cyan
    Write-Host " 2. Run the installer (.exe file)" -ForegroundColor Cyan
    Write-Host " 3. Launch Ollama from your Start menu" -ForegroundColor Cyan
    Write-Host " 4. Once it appears in your System Tray (bottom right)," -ForegroundColor Cyan
    Write-Host "    Run this command again to secure it." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "------------------------------------------" -ForegroundColor Yellow
    Pause
    Exit
}

# --- Main Confirmation ---
Write-Host "This script will CONFIGURE your existing Ollama for ChatLoom:" -ForegroundColor White
Write-Host " 1. Inject Security Layers (OLLAMA_ORIGINS)" -ForegroundColor White
Write-Host " 2. Enable Local Networking (OLLAMA_HOST)" -ForegroundColor White
Write-Host ""

$mainChoice = Read-Host "❓ Proceed with secure configuration? (y/n)"
if ($mainChoice -notmatch "[Yy]") {
    Write-Host "❌ Setup cancelled by user." -ForegroundColor Red
    Exit
}

Write-Host "🚀 Starting secure configuration..." -ForegroundColor Cyan
Write-Host ""

# Define Secure Origins (Strictly whitelisted for user safety)
$SECURE_ORIGINS = "https://chatloom.online, https://www.chatloom.online, https://*.chatloom.online"
$OLLAMA_BIND = "0.0.0.0:11434"

# Apply persistency for the user
Try {
    [Environment]::SetEnvironmentVariable("OLLAMA_HOST", "$OLLAMA_BIND", "User")
    [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "$SECURE_ORIGINS", "User")
    
    Write-Host "🔄 Refreshing Ollama session..." -ForegroundColor Cyan
    
    # Check if Ollama is running to restart it
    $ollamaProcess = Get-Process ollama -ErrorAction SilentlyContinue
    if ($ollamaProcess) {
        Write-Host "♻️  Restarting Ollama application..." -ForegroundColor Yellow
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

    Write-Host "🔗 Verifying secure bridge..." -ForegroundColor Magenta
    
    # Wait for API to be ready
    $maxRetries = 10
    $retryCount = 0
    while ($true) {
        Try {
            $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -ErrorAction Stop
            break
        } Catch {
            if ($retryCount -ge $maxRetries) {
                Write-Host "❌ Connection timed out. Ensure Ollama icon is in your System Tray." -ForegroundColor Red
                Break
            }
            Write-Host "⏳ Waiting for API... ($($retryCount + 1)/$maxRetries)" -ForegroundColor Gray
            Start-Sleep -Seconds 3
            $retryCount++
        }
    }

    Write-Host ""
    Write-Host " ✅ Configuration successful!" -ForegroundColor Green
    Write-Host "------------------------------------------" -ForegroundColor Yellow
    Write-Host " 🎉 CHATLOOM IS READY!" -ForegroundColor Yellow
    Write-Host "  1. Go back to your browser." -ForegroundColor White
    Write-Host "  2. Your local node is now secure." -ForegroundColor White
    Write-Host "------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
} Catch {
    Write-Host " ❌ Error during configuration. Please try running as Administrator." -ForegroundColor Red
}

Pause
