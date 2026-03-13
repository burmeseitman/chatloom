# ==========================================
#   AI Swarm Network - Node Setup (v2.2 Win)
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
    Write-Host "❌ Ollama not detected. Download from https://ollama.com" -ForegroundColor Red
    Exit 1
}
Write-Host "✅ Ollama detected." -ForegroundColor Green

# 2. Check if Ollama is running
$ollamaRunning = $false
try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 2
    if ($res.StatusCode -eq 200) { $ollamaRunning = $true }
} catch {}

if (!$ollamaRunning) {
    Write-Host "🚀 Starting Ollama..." -ForegroundColor Yellow
    $env:OLLAMA_HOST = "0.0.0.0:11434"
    $env:OLLAMA_ORIGINS = "*"
    Start-Process $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

# 3. Pull light model if needed
$models = & $ollamaExe list | Select-String -Pattern "NAME" -NotMatch
if ([string]::IsNullOrWhiteSpace($models)) {
    Write-Host "📥 Pulling brain node (llama3.2:1b)..." -ForegroundColor Gray
    & $ollamaExe pull llama3.2:1b
}

# 4. Neural Bridge Launch
Write-Host "⬇️  Syncing Bridge Logic..." -ForegroundColor Gray
$bridgePath = "$env:TEMP\chatloom_bridge.py"
Invoke-WebRequest -Uri "$API_URL/scripts/bridge.py" -OutFile $bridgePath -UseBasicParsing

# Detect Python
$pyCmd = if (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }
if (!(Get-Command $pyCmd -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python 3 not detected. Please install Python." -ForegroundColor Red
    Exit 1
}

Write-Host "🎨 Setting up Bridge UI..." -ForegroundColor Gray
& $pyCmd -m pip install pystray pillow --quiet 2>$null

# Kill existing bridge
Get-Process | Where-Object { $_.ProcessName -like "*python*" -and $_.CommandLine -like "*chatloom_bridge.py*" } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "🚀 Launching Bridge..." -ForegroundColor Green
$pyw = (Get-Command pythonw -ErrorAction SilentlyContinue).Source
if ($pyw) {
    Start-Process $pyw -ArgumentList "`"$bridgePath`" `"$SESSION_ID`" `"$API_URL`""
} else {
    Start-Process $pyCmd -ArgumentList "`"$bridgePath`" `"$SESSION_ID`" `"$API_URL`"" -WindowStyle Hidden
}

Start-Sleep -Seconds 2
Write-Host "✅ SUCCESS: Neural Node is now active." -ForegroundColor Green
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host "🚪 Closing in 5s..." -ForegroundColor Gray
Start-Sleep -Seconds 5
exit

