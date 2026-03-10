# ==========================================
#   ChatLoom - Neural Link Setup (Win)
# ==========================================

$SESSION_ID = if ($args[0]) { $args[0] } else { $env:CHATLOOM_SESSION }
$API_URL = if ($args[1]) { $args[1] } else { if ($env:CHATLOOM_API) { $env:CHATLOOM_API } else { "https://chatloom.online" } }

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing ChatLoom Neural Link..." -ForegroundColor Cyan
Write-Host "------------------------------------------" -ForegroundColor Cyan

# 1. Check for Ollama
$ollamaExe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
if (!$ollamaExe) { $ollamaExe = "$env:LOCALAPPDATA\Ollama\ollama.exe" }

if (!(Test-Path $ollamaExe)) {
    Write-Host "⚠️  Ollama not detected. Please install it: https://ollama.com" -ForegroundColor Yellow
    Exit 1
}
Write-Host "✅ Ollama detected: $ollamaExe" -ForegroundColor Green

# 2. Kill existing Ollama and free port 11434
Write-Host "♻️  Resetting Brain Engine..." -ForegroundColor Yellow
Stop-Process -Name ollama -Force -ErrorAction SilentlyContinue 2>$null

# Kill anything on port 11434
$portPID = (Get-NetTCPConnection -LocalPort 11434 -ErrorAction SilentlyContinue).OwningProcess
if ($portPID) {
    Write-Host "🛡️  Clearing Port 11434 (PID: $portPID)..." -ForegroundColor Gray
    Stop-Process -Id $portPID -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3

# 3. CRITICAL: Set OLLAMA_HOST to 0.0.0.0 so Cloudflare Tunnel can reach it
Write-Host "🛡️  Injecting Security Policies (CORS + Host Binding)..." -ForegroundColor Gray
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "User")
$env:OLLAMA_HOST = "0.0.0.0:11434"
$env:OLLAMA_ORIGINS = "*"

# 4. Start Ollama
Start-Process $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
Write-Host "🚀 Engine Starting..." -ForegroundColor Green

# 5. Wait for Ollama to be ready (up to 15 seconds)
Write-Host "⏳ Waiting for Ollama to initialize..." -ForegroundColor Gray
$ollamaReady = $false
for ($k=1; $k -le 15; $k++) {
    Start-Sleep -Seconds 1
    try {
        $testRes = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 2
        if ($testRes.StatusCode -eq 200) {
            $ollamaReady = $true
            Write-Host "✅ Ollama Engine Ready." -ForegroundColor Green
            break
        }
    } catch {}
}

if (-not $ollamaReady) {
    Write-Host "❌ Ollama failed to start. Please open Ollama from Start Menu and retry." -ForegroundColor Red
    Exit 1
}

# 6. Check/Pull Models
Write-Host "🔎 Scanning local models..." -ForegroundColor Gray
$models = & $ollamaExe list | Select-String -Pattern "NAME" -NotMatch
if ([string]::IsNullOrWhiteSpace($models)) {
    Write-Host "⚠️  No models found. Auto-pulling 'llama3.2:1b'..." -ForegroundColor Yellow
    & $ollamaExe pull llama3.2:1b
} else {
    Write-Host "✅ Knowledge Base ready." -ForegroundColor Green
}

# 7. Launch Cloudflare Tunnel
Write-Host "☁️  Establishing Secure Tunnel..." -ForegroundColor Cyan
$CLOUDFLARED_BIN = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $CLOUDFLARED_BIN) {
    $arch = $env:PROCESSOR_ARCHITECTURE
    $baseUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download"
    if ($arch -eq "ARM64") { $url = "$baseUrl/cloudflared-windows-arm64.exe" }
    elseif ($arch -eq "x86") { $url = "$baseUrl/cloudflared-windows-386.exe" }
    else { $url = "$baseUrl/cloudflared-windows-amd64.exe" }
    $CLOUDFLARED_BIN = "$env:TEMP\cloudflared.exe"
    Write-Host "⬇️  Downloading cloudflared..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $url -OutFile $CLOUDFLARED_BIN
}

Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue 2>$null
Start-Sleep -Seconds 1
$logPath = "$env:TEMP\chatloom_tunnel.log"
Remove-Item $logPath -ErrorAction SilentlyContinue

# Use http2 protocol for ISP firewall compatibility
Start-Process -FilePath $CLOUDFLARED_BIN -ArgumentList "tunnel --protocol http2 --url http://127.0.0.1:11434" -WindowStyle Hidden -RedirectStandardError $logPath
Write-Host "✅ Cloudflared started. Extracting public URL..." -ForegroundColor Green

# 8. Wait for tunnel URL to appear (up to 60 seconds)
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

if (-not $TUNNEL_URL) {
    Write-Host "❌ Could not get tunnel URL. Cloudflared logs:" -ForegroundColor Red
    Get-Content $logPath -Tail 15 -ErrorAction SilentlyContinue
    Exit 1
}

$cleanTunnel = $TUNNEL_URL.TrimEnd('/')
Write-Host ""
Write-Host "✅ Public Gateway: $cleanTunnel" -ForegroundColor Green
Write-Host ""

# 9. Verify tunnel is working (up to 60s)
Write-Host "⏳ Verifying Tunnel → Ollama connection (up to 60s)..." -ForegroundColor Gray
$tunnelOK = $false
for ($j=1; $j -le 30; $j++) {
    try {
        $testReq = Invoke-WebRequest -Uri "$cleanTunnel/api/tags" -UseBasicParsing -TimeoutSec 5
        if ($testReq.StatusCode -eq 200) {
            $tunnelOK = $true
            Write-Host "🚀 TUNNEL VERIFIED! Traffic flowing through." -ForegroundColor Green
            break
        }
    } catch {
        if ($j % 5 -eq 0) { Write-Host "   (Attempt $j/30...)" -ForegroundColor Gray }
        Start-Sleep -Seconds 2
    }
}

if (-not $tunnelOK) {
    Write-Host ""
    Write-Host "⚠️  Tunnel URL obtained but Ollama connection through it failed." -ForegroundColor Yellow
    Write-Host "   Your Gateway URL: $cleanTunnel" -ForegroundColor White
    Write-Host "   Try opening this URL in your browser. If you see JSON, it's working." -ForegroundColor White
    Get-Content $logPath -Tail 10 -ErrorAction SilentlyContinue
}

# 10. Register with ChatLoom Server
if ($SESSION_ID) {
    Write-Host "🔗 Registering with ChatLoom Server..." -ForegroundColor Gray
    try {
        $body = @{ session_id = $SESSION_ID; tunnel_url = $cleanTunnel } | ConvertTo-Json
        $syncRes = Invoke-RestMethod -Uri "$API_URL/api/tunnel" -Method Post -Body $body -ContentType "application/json"
        if ($syncRes.status -eq "success") {
            Write-Host "🔗 Cloud Sync: SUCCESS. ChatLoom will now detect your AI." -ForegroundColor Green
        }
    } catch {
        Write-Host "⚠️  Sync failed: $_" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "------------------------------------------" -ForegroundColor Yellow
Write-Host " 🎉 SETUP COMPLETE!" -ForegroundColor Yellow
Write-Host " 🌐 Gateway: $cleanTunnel" -ForegroundColor White
if ($SESSION_ID) {
    Write-Host " 🚀 Your browser will auto-update now." -ForegroundColor White
}
Write-Host "------------------------------------------" -ForegroundColor Yellow
Start-Sleep -Seconds 3
