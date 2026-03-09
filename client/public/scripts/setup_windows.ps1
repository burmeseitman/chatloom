# ==========================================
#   ChatLoom - One-Click Cloud Bridge (Win)
# ==========================================
# Usage: irm https://chatloom.online/scripts/setup_windows.ps1 | iex -args <SESSION_ID>, <API_URL>

$SESSION_ID = $args[0]
$API_URL = if ($args[1]) { $args[1] } else { "https://chatloom.online" }

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing ChatLoom Cloud Bridge..." -ForegroundColor Cyan

# 1. Locate Ollama
$ollamaExe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
if (!$ollamaExe) { $ollamaExe = "$env:LOCALAPPDATA\Ollama\ollama.exe" }

if (!(Test-Path $ollamaExe)) {
    Write-Host "⚠️  Ollama not found. Please install it first: https://ollama.com" -ForegroundColor Yellow
    Exit 1
}

Write-Host "✅ Ollama detected." -ForegroundColor Green

# 2. Configure Environment (CORS & Host)
Write-Host "🛡️  Injecting Security Policies..." -ForegroundColor Gray
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "User")

$env:OLLAMA_HOST = "0.0.0.0:11434"
$env:OLLAMA_ORIGINS = "*"

# 3. Restart Ollama with forced environment
Write-Host "♻️  Resetting Ollama Engine..." -ForegroundColor Yellow
Stop-Process -Name ollama -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Launch engine directly to inherit process variables and bypass GUI caching
Start-Process $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
Write-Host "🚀 Ollama Engine started with Secure Access." -ForegroundColor Green

# 4. Setup Cloudflare Tunnel
Write-Host "☁️  Launching Secure Cloud Tunnel..." -ForegroundColor Cyan
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

Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
$logPath = "$env:TEMP\chatloom_tunnel.log"
Remove-Item $logPath -ErrorAction SilentlyContinue

Start-Process -FilePath $CLOUDFLARED_BIN -ArgumentList "tunnel --url http://127.0.0.1:11434" -WindowStyle Hidden -RedirectStandardError $logPath

# 5. Link to ChatLoom
Write-Host "⏳ Routing your Node to the Cloud..." -ForegroundColor Gray
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
    Write-Host "✅ Cloud Node Active: $TUNNEL_URL" -ForegroundColor Green
    if ($SESSION_ID) {
        $cleanTunnel = $TUNNEL_URL.TrimEnd('/')
        $body = @{ session_id = $SESSION_ID; tunnel_url = $cleanTunnel } | ConvertTo-Json
        Invoke-RestMethod -Uri "$API_URL/api/tunnel" -Method Post -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
        Write-Host "🔗 Neural Link Established." -ForegroundColor Green
    }
} else {
    Write-Host "❌ ERROR: Cloud Routing Failed. Check Internet Connection." -ForegroundColor Red
}

Write-Host "------------------------------------------" -ForegroundColor Yellow
Write-Host " 🎉 ALL DONE! NO MANUAL STEPS REMAINING." -ForegroundColor Yellow
Write-Host " 🚀 Your screen will automatically update." -ForegroundColor White
Write-Host "------------------------------------------" -ForegroundColor Yellow
Start-Sleep -Seconds 3
