# ==========================================
#   AI Swarm Network - Node Setup (v2.3 Win)
# ==========================================

$SESSION_ID = if ($args[0]) { $args[0] } else { $env:CHATLOOM_SESSION }
$API_URL = if ($args[1]) { $args[1] } else { if ($env:CHATLOOM_API) { $env:CHATLOOM_API } else { "https://chatloom.online" } }

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " Initializing AI Swarm Node..." -ForegroundColor Cyan
Write-Host "------------------------------------------" -ForegroundColor Cyan

# 1. Check for Ollama
$ollamaExe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
if (!$ollamaExe) { $ollamaExe = "$env:LOCALAPPDATA\Ollama\ollama.exe" }

if (!(Test-Path $ollamaExe)) {
    Write-Host "Ollama not detected. Download from https://ollama.com" -ForegroundColor Red
    Exit 1
}
Write-Host "Ollama detected." -ForegroundColor Green

# 2. Check if Ollama is running
$ollamaRunning = $false
try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 2
    if ($res.StatusCode -eq 200) { $ollamaRunning = $true }
} catch {}

if (!$ollamaRunning) {
    Write-Host "Starting Ollama..." -ForegroundColor Yellow
    $env:OLLAMA_HOST = "127.0.0.1:11434"
    Remove-Item Env:OLLAMA_ORIGINS -ErrorAction SilentlyContinue
    Start-Process $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

# 3. Pull light model if needed, but don't block setup
$models = & $ollamaExe list | Select-String -Pattern "NAME" -NotMatch
if ([string]::IsNullOrWhiteSpace($models)) {
    Write-Host "No local llama model found. Starting background pull for llama3.2:1b..." -ForegroundColor Gray
    Start-Process $ollamaExe -ArgumentList "pull", "llama3.2:1b" -WindowStyle Hidden
}

# 4. Neural Bridge Launch
Write-Host "Syncing Bridge Logic..." -ForegroundColor Gray
$bridgePath = "$env:TEMP\chatloom_bridge.py"
Invoke-WebRequest -Uri "$API_URL/scripts/bridge.py" -OutFile $bridgePath -UseBasicParsing

# Detect Python
$pyCmd = if (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }
if (!(Get-Command $pyCmd -ErrorAction SilentlyContinue)) {
    Write-Host "Python 3 not detected. Please install Python." -ForegroundColor Red
    Exit 1
}

$pyResolved = (Get-Command $pyCmd -ErrorAction SilentlyContinue).Source
$bridgeHome = Join-Path $env:LOCALAPPDATA "ChatLoomBridge"
$bridgeVenv = Join-Path $bridgeHome "venv"
$bridgePython = Join-Path $bridgeVenv "Scripts\python.exe"
$bridgePythonw = Join-Path $bridgeVenv "Scripts\pythonw.exe"
$depsLog = Join-Path $env:TEMP "chatloom_bridge_deps.log"
if (!(Test-Path $bridgeHome)) { New-Item -ItemType Directory -Path $bridgeHome -Force | Out-Null }

if (!(Test-Path $bridgePython)) {
    Write-Host "Creating bridge runtime..." -ForegroundColor Gray
    & $pyResolved -m venv $bridgeVenv *> $depsLog
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Bridge runtime creation failed. Check $depsLog" -ForegroundColor Red
        Exit 1
    }
}

$depsReady = $false
if (Test-Path $bridgePython) {
    & $bridgePython -c "import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('pystray') and importlib.util.find_spec('PIL') else 1)" *> $null
    $depsReady = ($LASTEXITCODE -eq 0)
}

if (-not $depsReady) {
    Write-Host "Installing bridge UI dependencies..." -ForegroundColor Gray
    & $bridgePython -m ensurepip --upgrade *> $depsLog
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Unable to bootstrap pip for bridge runtime. Check $depsLog" -ForegroundColor Red
        Exit 1
    }
    & $bridgePython -m pip install --upgrade pip wheel setuptools *> $depsLog
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Unable to prepare bridge runtime packages. Check $depsLog" -ForegroundColor Red
        Exit 1
    }
    & $bridgePython -m pip install pystray pillow *> $depsLog
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Bridge UI dependency install failed. Check $depsLog" -ForegroundColor Red
        Exit 1
    }
}

Write-Host "Preparing Bridge UI..." -ForegroundColor Gray
Write-Host "Bridge runtime: $bridgePython" -ForegroundColor DarkGray

# Kill existing bridge
Get-Process | Where-Object { $_.ProcessName -like "*python*" -and $_.CommandLine -like "*chatloom_bridge.py*" } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Launching Bridge..." -ForegroundColor Green
$pyw = $null
if (Test-Path $bridgePythonw) { $pyw = $bridgePythonw }
elseif (Test-Path $bridgePython) { $pyResolved = $bridgePython }
else { $pyResolved = (Get-Command $pyCmd -ErrorAction SilentlyContinue).Source }

$env:CHATLOOM_BRIDGE_LOG = Join-Path $env:TEMP "bridge.log"
$bridgeState = Join-Path $env:TEMP "bridge-state.json"
if (Test-Path $bridgeState) { Remove-Item $bridgeState -Force -ErrorAction SilentlyContinue }
$env:CHATLOOM_BRIDGE_STATE = $bridgeState
$env:CHATLOOM_SKIP_RUNTIME_PIP = "1"
if ($pyw) {
    Start-Process $pyw -ArgumentList "`"$bridgePath`" `"$SESSION_ID`" `"$API_URL`"" -WorkingDirectory $env:TEMP
} else {
    Start-Process $pyResolved -ArgumentList "`"$bridgePath`" `"$SESSION_ID`" `"$API_URL`"" -WindowStyle Hidden -WorkingDirectory $env:TEMP
}

Start-Sleep -Milliseconds 500
$trayState = ""
$trayMessage = ""
for ($i = 0; $i -lt 24; $i++) {
    if (Test-Path $bridgeState) {
        try {
            $stateData = Get-Content $bridgeState -Raw | ConvertFrom-Json
            $trayState = $stateData.state
            $trayMessage = $stateData.message
        } catch {}
    }

    if ($trayState -eq "tray_ready" -or $trayState -eq "headless") {
        break
    }
    Start-Sleep -Milliseconds 500
}

Write-Host "SUCCESS: Neural Node is now active." -ForegroundColor Green
Write-Host "Bridge log: $env:TEMP\bridge.log" -ForegroundColor Gray
if ($trayState -eq "tray_ready") {
    Write-Host "Tray icon is ready." -ForegroundColor Green
} elseif ($trayState -eq "headless") {
    Write-Host "Tray icon is unavailable: $trayMessage" -ForegroundColor Yellow
} else {
    Write-Host "Tray status is still starting. Check $env:TEMP\bridge.log if the icon does not appear." -ForegroundColor Yellow
}
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host "Returning to your terminal in 2s..." -ForegroundColor Gray
Start-Sleep -Seconds 2
exit
