# ==========================================
#   ChatLoom - One-Click Cloud Bridge (Win)
# ==========================================
# Usage: irm https://chatloom.online/scripts/setup_windows.ps1 | iex -args <SESSION_ID>, <API_URL>

$SESSION_ID = $args[0]
$API_URL = if ($args[1]) { $args[1] } else { "https://chatloom.online" }

# Extract domain from API_URL for CORS
$domain = if ($API_URL -match '://([^/:]+)') { $matches[1] } else { "chatloom.online" }

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing ChatLoom Cloud Bridge..." -ForegroundColor Cyan

# 1. Check Ollama
$ollamaUserPath = "$env:LOCALAPPDATA\Ollama\ollama.exe"
$OLLAMA_FOUND = if (Get-Command ollama -ErrorAction SilentlyContinue) { $true } elseif (Test-Path $ollamaUserPath) { $true } else { $false }

if (-not $OLLAMA_FOUND) {
    Write-Host "⚠️  Ollama NOT DETECTED" -ForegroundColor Yellow
    Write-Host "------------------------------------------" -ForegroundColor Cyan
    Write-Host " 🚀 Downloading Ollama Installer..." -ForegroundColor White
    $dest = "$env:TEMP\OllamaSetup.exe"
    Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $dest
    Write-Host "✅ Download complete: $dest" -ForegroundColor Green
    Write-Host "👉 Launching Installer. Please complete setup and run this script again." -ForegroundColor Yellow
    Start-Process -FilePath $dest -Wait
    Exit 1
}

Write-Host "✅ Ollama detected." -ForegroundColor Green

# 2. Configure Ollama for Browser Access (CORS)
# We add dynamic domain and tunnel wildcard to allow requests from anywhere
$SECURE_ORIGINS = "https://chatloom.online,https://*.chatloom.online,http://localhost:*,http://127.0.0.1:*,https://*.trycloudflare.com,http://*.trycloudflare.com,https://$domain,http://$domain"
$OLLAMA_BIND = "0.0.0.0:11434"

Try {
    [Environment]::SetEnvironmentVariable("OLLAMA_HOST", "$OLLAMA_BIND", "User")
    [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "$SECURE_ORIGINS", "User")
    
    $env:OLLAMA_HOST = "$OLLAMA_BIND"
    $env:OLLAMA_ORIGINS = "$SECURE_ORIGINS"

    $ollamaProcess = Get-Process ollama -ErrorAction SilentlyContinue
    if ($ollamaProcess) {
        Write-Host "♻️ Restarting Ollama..." -ForegroundColor Yellow
        Stop-Process -Name ollama -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }

    $ollamaExe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
    if (!$ollamaExe) { $ollamaExe = "$env:LOCALAPPDATA\Ollama\ollama.exe" }
    
    if (Test-Path $ollamaExe) {
        Start-Process $ollamaExe
    } else {
        Start-Process "ollama" "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
    }
} Catch {
    Write-Host "⚠️ Security configuration failed. Try running as Administrator." -ForegroundColor Yellow
}

# 3. Setup Cloudflare Tunnel
Write-Host "☁️ Setting up Cloudflare Tunnel..." -ForegroundColor Cyan
$CLOUDFLARED_BIN = "cloudflared"
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    $arch = $env:PROCESSOR_ARCHITECTURE
    Write-Host "⬇️ Downloading respective cloudflared binary ($arch)..." -ForegroundColor Gray
    
    $baseUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download"
    if ($arch -eq "ARM64") {
        $url = "$baseUrl/cloudflared-windows-arm64.exe"
    } elseif ($arch -eq "x86") {
        $url = "$baseUrl/cloudflared-windows-386.exe"
    } else {
        $url = "$baseUrl/cloudflared-windows-amd64.exe"
    }
    
    $CLOUDFLARED_BIN = "$env:TEMP\cloudflared.exe"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $CLOUDFLARED_BIN
}

Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
$logPath = "$env:TEMP\chatloom_tunnel.log"
Remove-Item $logPath -ErrorAction SilentlyContinue

Write-Host "⚡ Starting Neural Link..." -ForegroundColor Magenta
Start-Process -FilePath $CLOUDFLARED_BIN -ArgumentList "tunnel --url http://127.0.0.1:11434" -WindowStyle Hidden -RedirectStandardError $logPath

# 4. Wait for Tunnel URL
Write-Host "⏳ Routing your AI node to the cloud (may take up to 60s)..." -ForegroundColor Gray
$TUNNEL_URL = $null
for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $logPath) {
        $logContent = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
        if ($logContent -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
            $TUNNEL_URL = $matches[1]
            break
        }
    }
}

if ($TUNNEL_URL) {
    Write-Host "✅ Cloud Link Ready: $TUNNEL_URL" -ForegroundColor Green
    if ($SESSION_ID) {
        $body = @{ session_id = $SESSION_ID; tunnel_url = $TUNNEL_URL } | ConvertTo-Json
        Try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-RestMethod -Uri "$API_URL/api/tunnel" -Method Post -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
            Write-Host "🔗 Node linked to session: $SESSION_ID" -ForegroundColor Green
        } Catch {}
    }
} else {
    Write-Host "❌ ERROR: Tunnel generation timed out." -ForegroundColor Red
}

Write-Host "------------------------------------------" -ForegroundColor Yellow
Write-Host " 🎉 SETUP COMPLETE!" -ForegroundColor Yellow
Write-Host " 🚀 Return to ChatLoom and start chatting." -ForegroundColor White
Write-Host "------------------------------------------" -ForegroundColor Yellow
Start-Sleep -Seconds 3
