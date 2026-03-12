# ==========================================
#   AI Swarm Network - Node Setup (Win)
# ==========================================

$SESSION_ID = if ($args[0]) { $args[0] } else { $env:CHATLOOM_SESSION }
$API_URL = if ($args[1]) { $args[1] } else { if ($env:CHATLOOM_API) { $env:CHATLOOM_API } else { "https://chatloom.online" } }

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing AI Swarm Node..." -ForegroundColor Cyan
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

# 7. Launch Swarm Node (Neural Bridge)
Write-Host "🐉 Launching AI Swarm Node..." -ForegroundColor Cyan

# Check for Python
if (!(Get-Command python -ErrorAction SilentlyContinue) -and !(Get-Command python3 -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python 3 not detected. Please install Python to use the Bridge." -ForegroundColor Red
    Exit 1
}

$pyCmd = if (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }

# Kill existing bridge
Get-Process | Where-Object { $_.ProcessName -like "*python*" -and $_.CommandLine -like "*bridge.py*" } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "⬇️  Syncing Bridge Logic..." -ForegroundColor Gray
$bridgePath = "$env:TEMP\chatloom_bridge.py"
Invoke-WebRequest -Uri "$API_URL/scripts/bridge.py" -OutFile $bridgePath

if (!(Test-Path $bridgePath)) {
    Write-Host "❌ Failed to download bridge script from $API_URL" -ForegroundColor Red
    Exit 1
}

# 8. Install UI Dependencies in a Virtual Environment
Write-Host "🎨 Optimizing UI Experience (System Tray)..." -ForegroundColor Gray
$venvDir = "$env:TEMP\chatloom_venv"
if (!(Test-Path $venvDir)) {
    & $pyCmd -m venv $venvDir
}
$venvPy = "$venvDir\Scripts\python.exe"
$venvPyw = "$venvDir\Scripts\pythonw.exe"

# Install dependencies into venv
& $venvPy -m pip install pystray pillow --quiet

Write-Host "🚀 BRIDGE STARTING (Tray Mode)..." -ForegroundColor Green
Write-Host "------------------------------------------"

# Execute bridge.py using pythonw (if available) to hide terminal
if (Test-Path $venvPyw) {
    Start-Process $venvPyw -ArgumentList "$bridgePath `"$SESSION_ID`" `"$API_URL`""
    Write-Host ""
    Write-Host "✅ SUCCESS! Neural Node is running in the background." -ForegroundColor Green
    Write-Host "🎨 Look for the ChatLoom icon 🐉 in your system tray (bottom-right)." -ForegroundColor Gray
    Write-Host "🚪 Closing this window in 3 seconds..." -ForegroundColor Gray
    Start-Sleep -Seconds 3
    exit
} else {
    & $venvPy $bridgePath "$SESSION_ID" "$API_URL"
}
