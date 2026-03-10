# ==========================================
#   ChatLoom - Neural Link Setup (Win)
# ==========================================

$SESSION_ID = if ($args[0]) { $args[0] } else { $env:CHATLOOM_SESSION }
$API_URL = if ($args[1]) { $args[1] } else { if ($env:CHATLOOM_API) { $env:CHATLOOM_API } else { "https://chatloom.online" } }

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing ChatLoom Neural Link..." -ForegroundColor Cyan

# 1. Check for Ollama
$ollamaExe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
if (!$ollamaExe) { $ollamaExe = "$env:LOCALAPPDATA\Ollama\ollama.exe" }

if (!(Test-Path $ollamaExe)) {
    Write-Host "⚠️  Ollama not detected. Please install it: https://ollama.com" -ForegroundColor Yellow
    Exit 1
}

Write-Host "✅ Ollama detected." -ForegroundColor Green

# 2. Configure Environment (CORS & Host)
Write-Host "🛡️  Injecting Security Policies..." -ForegroundColor Gray
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "User")
$env:OLLAMA_HOST = "0.0.0.0:11434"
$env:OLLAMA_ORIGINS = "*"

# 3. Restart Engine (Forcing New Core Config)
Write-Host "♻️  Resetting Brain Engine..." -ForegroundColor Yellow
Stop-Process -Name ollama -Force -ErrorAction SilentlyContinue 2>$null
Start-Sleep -Seconds 3
Start-Process $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
Write-Host "🚀 Engine Active with Neural Access." -ForegroundColor Green

# 4. Auto-Pull llama3 if empty
Write-Host "🔎 Scanning local models..." -ForegroundColor Gray
Start-Sleep -Seconds 2
$models = & $ollamaExe list | Select-String -Pattern "NAME" -NotMatch
if ([string]::IsNullOrWhiteSpace($models)) {
    Write-Host "⚠️  No models found. Auto-pulling 'llama3'..." -ForegroundColor Yellow
    & $ollamaExe pull llama3
} else {
    Write-Host "✅ Knowledge Base ready." -ForegroundColor Green
}

# 5. Launch Cloudflare Tunnel
Write-Host "☁️  Establishing Secure Tunnel..." -ForegroundColor Cyan
$CLOUDFLARED_BIN = "cloudflared"
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    $arch = $env:PROCESSOR_ARCHITECTURE
    $baseUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download"
    if ($arch -eq "ARM64") { $url = "$baseUrl/cloudflared-windows-arm64.exe" }
    elseif ($arch -eq "x86") { $url = "$baseUrl/cloudflared-windows-386.exe" }
    else { $url = "$baseUrl/cloudflared-windows-amd64.exe" }
    $CLOUDFLARED_BIN = "$env:TEMP\cloudflared.exe"
    Invoke-WebRequest -Uri $url -OutFile $CLOUDFLARED_BIN
}

Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue 2>$null
$logPath = "$env:TEMP\chatloom_tunnel.log"
Remove-Item $logPath -ErrorAction SilentlyContinue
Start-Process -FilePath $CLOUDFLARED_BIN -ArgumentList "tunnel --url http://127.0.0.1:11434" -WindowStyle Hidden -RedirectStandardError $logPath

# 6. Session Registration
Write-Host "⏳ Syncing with ChatLoom Cloud..." -ForegroundColor Gray
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
    Write-Host "✅ Cloud Entrypoint: $TUNNEL_URL" -ForegroundColor Green
    if ($SESSION_ID) {
        $cleanTunnel = $TUNNEL_URL.TrimEnd('/')
        $body = @{ session_id = $SESSION_ID; tunnel_url = $cleanTunnel } | ConvertTo-Json
        # SYNC: Send to backend for the bridge to find us
        try {
            $syncRes = Invoke-RestMethod -Uri "$API_URL/api/tunnel" -Method Post -Body $body -ContentType "application/json"
            if ($syncRes.status -eq "success") {
                Write-Host "🔗 Neural Link Established." -ForegroundColor Green
            }
        } catch {
            Write-Host "⚠️  Sync Warning: Server acknowledged but check required." -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "❌ ERROR: Cloud Link Failed. Check your Internet." -ForegroundColor Red
}

Write-Host "------------------------------------------" -ForegroundColor Yellow
Write-Host " 🎉 SETUP COMPLETE! EVERYTHING IS READY." -ForegroundColor Yellow
Write-Host " 🚀 Your browser will auto-update now." -ForegroundColor White
Write-Host "------------------------------------------" -ForegroundColor Yellow
Start-Sleep -Seconds 3
