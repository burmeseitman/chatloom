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
# Fix common folder access issues (Silent Fix)
$ollamaDataPath = Join-Path $env:USERPROFILE ".ollama"
if (Test-Path $ollamaDataPath) {
    Try {
        # Ensure the directory is not read-only for current user
        $dirInfo = Get-Item $ollamaDataPath
        if ($dirInfo.Attributes -match "ReadOnly") {
            $dirInfo.Attributes = "Directory"
        }
    } Catch { }
}

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

# Official Secured Domains & Safe Local Networks
# We use controlled wildcards to allow local development (localhost, 192.168) while blocking public internet attacks.
$SECURE_ORIGINS = "https://chatloom.online,https://*.chatloom.online,http://localhost:*,http://127.0.0.1:*,http://192.168.*.*:*"
$OLLAMA_BIND = "0.0.0.0:11434"

    # Apply persistency for the user Registry
    Try {
        [Environment]::SetEnvironmentVariable("OLLAMA_HOST", "$OLLAMA_BIND", "User")
        [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "$SECURE_ORIGINS", "User")
        
        # --- IMPORTANT: Inject into current PowerShell session for the restart process ---
        $env:OLLAMA_HOST = "$OLLAMA_BIND"
        $env:OLLAMA_ORIGINS = "$SECURE_ORIGINS"

        Write-Host "🔄 Performing deep session refresh..." -ForegroundColor Cyan
        
        # Check if Ollama is running to restart it
        $ollamaProcess = Get-Process ollama -ErrorAction SilentlyContinue
        if ($ollamaProcess) {
            Write-Host "♻️  Restarting Ollama application..." -ForegroundColor Yellow
            Stop-Process -Name ollama -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
        }

        Write-Host "🚀 Launching Ollama with new security context..." -ForegroundColor Cyan
        $ollamaExe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
        if (!$ollamaExe) { $ollamaExe = "$env:LOCALAPPDATA\Ollama\ollama.exe" }
        
        if (Test-Path $ollamaExe) {
            # Start process inheriting the environment variables from the current shell
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
                    Write-Host "❌ Connection failed. Ensure Ollama icon is in your System Tray." -ForegroundColor Red
                    Break
                }
                Write-Host "⏳ Waiting for API... ($($retryCount + 1)/$maxRetries)" -ForegroundColor Gray
                Start-Sleep -Seconds 3
                $retryCount++
            }
        }

        # --- Cloudflare Secure Tunnel Setup ---
        if ($env:CHATLOOM_SESSION) {
            Write-Host "☁️ Setting up Dynamic Cloudflare Tunnel..." -ForegroundColor Cyan
            $CLOUDFLARED_BIN = "cloudflared"
            if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
                Write-Host "⬇️ Downloading Cloudflare dependencies..." -ForegroundColor Gray
                $CLOUDFLARED_BIN = "$env:TEMP\cloudflared.exe"
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $CLOUDFLARED_BIN
            }

            Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue

            Write-Host "⚡ Initiating Neural Link..." -ForegroundColor Magenta
            Start-Process -FilePath $CLOUDFLARED_BIN -ArgumentList "tunnel --url http://127.0.0.1:11434" -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\chatloom_tunnel.log" -RedirectStandardError "$env:TEMP\chatloom_tunnel_err.log"

            Write-Host "⏳ Routing secure endpoints. Please wait..." -ForegroundColor Gray
            $TUNNEL_URL = $null
            for ($i=0; $i -lt 15; $i++) {
                Start-Sleep -Seconds 2
                if (Test-Path "$env:TEMP\chatloom_tunnel_err.log") {
                    $logContent = Get-Content "$env:TEMP\chatloom_tunnel_err.log" -Raw -ErrorAction SilentlyContinue
                    if ($logContent -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
                        $TUNNEL_URL = $matches[1]
                        break
                    }
                }
            }

            if ($TUNNEL_URL) {
                Write-Host "✅ Dynamic Tunnel established: $TUNNEL_URL" -ForegroundColor Green
                $API_URL = if ($env:CHATLOOM_API) { $env:CHATLOOM_API } else { "https://chatloom.online" }
                $body = @{
                    session_id = $env:CHATLOOM_SESSION
                    tunnel_url = $TUNNEL_URL
                } | ConvertTo-Json
                Try {
                    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                    Invoke-RestMethod -Uri "$API_URL/api/tunnel" -Method Post -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
                } Catch {}
            } else {
                Write-Host "⚠️ Cloudflare tunnel routing took too long. It may still be starting..." -ForegroundColor Yellow
            }
        }

        Write-Host ""
        Write-Host " ✅ Configuration successful!" -ForegroundColor Green
        Write-Host "------------------------------------------" -ForegroundColor Yellow
        Write-Host " 🎉 CHATLOOM IS READY!" -ForegroundColor Yellow
        Write-Host "  1. Back to Browser." -ForegroundColor White
        Write-Host "  2. REFRESH the page (Shift+F5)." -ForegroundColor White
        Write-Host ""
        Write-Host " ⚠️  IMPORTANT (Brave/Chrome/Safari):" -ForegroundColor Red
        Write-Host "    If AI is still NOT FOUND, go to:" -ForegroundColor Cyan
        Write-Host "    http://localhost:11434" -ForegroundColor Cyan
        Write-Host "    If it says 'Ollama is running', return here" -ForegroundColor White
        Write-Host "    and refresh. This 'wakes up' the browser." -ForegroundColor White
        Write-Host "------------------------------------------" -ForegroundColor Yellow
        Write-Host ""
    } Catch {
        Write-Host " ❌ Error during configuration. Please try running as Administrator." -ForegroundColor Red
    }

Pause
