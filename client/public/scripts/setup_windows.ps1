# ==========================================
#   ChatLoom - One-Click Cloud Bridge (Win)
# ==========================================
# Usage: irm https://chatloom.online/scripts/setup_windows.ps1 | iex -args <SESSION_ID>, <API_URL>

$SESSION_ID = $args[0]
$API_URL = if ($args[1]) { $args[1] } else { "https://chatloom.online" }

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing ChatLoom Cloud Bridge..." -ForegroundColor Cyan

# 1. Check Ollama
$ollamaUserPath = "$env:LOCALAPPDATA\Ollama\ollama.exe"
$OLLAMA_FOUND = if (Get-Command ollama -ErrorAction SilentlyContinue) { $true } elseif (Test-Path $ollamaUserPath) { $true } else { $false }

if (-not $OLLAMA_FOUND) {
    Write-Host "❌ ERROR: Ollama not detected." -ForegroundColor Red
    Write-Host "👉 Please install Ollama first: https://ollama.com" -ForegroundColor White
    Write-Host "👉 After installing, launch it and run this command again." -ForegroundColor White
    Pause
    Exit 1
}

Write-Host "✅ Ollama detected." -ForegroundColor Green

# 2. Configure Ollama for Browser Access (CORS)
$SECURE_ORIGINS = "https://chatloom.online,https://*.chatloom.online,http://localhost:*,http://127.0.0.1:*"
$OLLAMA_BIND = "0.0.0.0:11434"

Try {
    [Environment]::SetEnvironmentVariable("OLLAMA_HOST", "$OLLAMA_BIND", "User")
    [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "$SECURE_ORIGINS", "User")
    
    # Inject into current session for restarting
    $env:OLLAMA_HOST = "$OLLAMA_BIND"
    $env:OLLAMA_ORIGINS = "$SECURE_ORIGINS"

    # Restart Ollama to apply changes
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
    Write-Host "⚠️ Security configuration failed. Try running as Administrator if link doesn't work." -ForegroundColor Yellow
}

# 3. Setup Cloudflare Tunnel
Write-Host "☁️ Setting up Cloudflare Tunnel..." -ForegroundColor Cyan
$CLOUDFLARED_BIN = "cloudflared"
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "⬇️ Downloading temporary Cloudflare agent..." -ForegroundColor Gray
    $CLOUDFLARED_BIN = "$env:TEMP\cloudflared.exe"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $CLOUDFLARED_BIN
}

Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
$logPath = "$env:TEMP\chatloom_tunnel.log"
Remove-Item $logPath -ErrorAction SilentlyContinue

Write-Host "⚡ Starting Neural Link..." -ForegroundColor Magenta
# On Windows, Start-Process captures stderr and stdout separately. Cloudflare URL is usually in stderr.
Start-Process -FilePath $CLOUDFLARED_BIN -ArgumentList "tunnel --url http://127.0.0.1:11434" -WindowStyle Hidden -RedirectStandardError $logPath

# 4. Wait for Tunnel URL and Post to Backend (Increased timeout and robustness)
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
    # Check if process is still running
    if (-not (Get-Process "cloudflared" -ErrorAction SilentlyContinue)) {
        Write-Host "❌ Error: Cloudflare process died unexpectedly." -ForegroundColor Red
        if (Test-Path $logPath) { Get-Content $logPath -Tail 5 }
        Pause
        Exit 1
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
    if (Test-Path $logPath) {
        Write-Host "🔍 Technical details from cloudflared:" -ForegroundColor Gray
        Get-Content $logPath -Tail 5
    }
    Write-Host "👉 Suggestions: Check your internet connection or Firewall / VPN settings." -ForegroundColor Yellow
}

Write-Host "------------------------------------------" -ForegroundColor Yellow
Write-Host " 🎉 SETUP COMPLETE!" -ForegroundColor Yellow
Write-Host " 🚀 Return to ChatLoom and start chatting." -ForegroundColor White
Write-Host "------------------------------------------" -ForegroundColor Yellow
Start-Sleep -Seconds 3
