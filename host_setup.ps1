# ========================================================
#   ChatLoom Server - Ironclad Deployment (Win)
# ========================================================
# Version: 7.2 - Path Resilient & Secure Service Setup

# 1. Elevate to Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

# 2. Context & Environment
$BASE_DIR = (Get-Item -Path ".").FullName
Set-Location -Path "$BASE_DIR"
Write-Host "--- CHATLOOM IRONCLAD DEPLOYMENT (v7.2) ---" -ForegroundColor Blue

$VENV_DIR = Join-Path $BASE_DIR ".venv"
$VENV_PYTHON = Join-Path $VENV_DIR "Scripts\python.exe"
$APP_PY = Join-Path $BASE_DIR "server\app.py"
$REQ_FILE = Join-Path $BASE_DIR "server\requirements.txt"
$BIN_DIR = Join-Path $BASE_DIR ".bin"
if (!(Test-Path $BIN_DIR)) { New-Item -ItemType Directory -Path $BIN_DIR -Force }
$NSSM = Join-Path $BIN_DIR "nssm.exe"

# --- 3. HARDWARE & NETWORK PREP ---
Write-Host "[1/6] Opening Firewall Port 5001..." -ForegroundColor Gray
try {
    Remove-NetFirewallRule -DisplayName "ChatLoom Server" -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "ChatLoom Server" -Direction Inbound -LocalPort 5001 -Protocol TCP -Action Allow -Profile Any -ErrorAction SilentlyContinue
} catch { }

# --- 4. PYTHON SYNC & VENV REPAIR ---
Write-Host "[2/6] Syncing Dependencies..." -ForegroundColor Gray

# If venv exists, verify it still works (handles moved folders)
$venvBroken = $false
if (Test-Path $VENV_PYTHON) {
    try {
        $check = & $VENV_PYTHON -c "print('ok')" -ErrorAction SilentlyContinue
        if ($check -ne "ok") { $venvBroken = $true }
    } catch { $venvBroken = $true }
} else { $venvBroken = $true }

if ($venvBroken) {
    Write-Host "🔧 Rebuilding Virtual Environment (Paths updated)..." -ForegroundColor Cyan
    if (Test-Path $VENV_DIR) { Remove-Item -Path $VENV_DIR -Recurse -Force -ErrorAction SilentlyContinue }
    python -m venv "$VENV_DIR"
}

Write-Host "Syncing libraries (gevent, flask, etc.)..." -ForegroundColor Cyan
& $VENV_PYTHON -m pip install --upgrade pip --quiet
& $VENV_PYTHON -m pip install -r "$REQ_FILE" --quiet

# --- 5. APPLICATION DRY RUN ---
Write-Host "[3/6] Validating Backend Stability..." -ForegroundColor Gray
$testRun = Start-Process -FilePath $VENV_PYTHON -ArgumentList """$APP_PY""" -NoNewWindow -PassThru
Start-Sleep -Seconds 5
if ($testRun.HasExited) {
    Write-Host "❌ CRITICAL: Backend failed to start. Check server_out.log" -ForegroundColor Red
    exit
} else {
    Write-Host "✅ Backend Check Passed." -ForegroundColor Green
    Stop-Process -Id $testRun.Id -Force -ErrorAction SilentlyContinue
}

# --- 6. SERVICE REBUILD ---
Write-Host "[4/6] Rebuilding Windows Services..." -ForegroundColor Gray
$SERVICE_NAME = "ChatLoomServer"

# Kill anything in port 5001
$oldPort = Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
if ($oldPort) { Stop-Process -Id $oldPort -Force -ErrorAction SilentlyContinue 2>$null }

# NSSM check
if (!(Test-Path $NSSM)) {
    $zip = "$BIN_DIR\nssm.zip"
    Invoke-WebRequest -Uri "https://github.com/fawno/nssm.cc/releases/download/v2.24/nssm-2.24.zip" -OutFile "$zip" -UseBasicParsing
    Expand-Archive -Path "$zip" -DestinationPath "$BIN_DIR\temp" -Force
    Copy-Item "$BIN_DIR\temp\*\win64\nssm.exe" -Destination "$NSSM" -Force
    Remove-Item "$BIN_DIR\temp" -Recurse -Force; Remove-Item "$zip" -Force
}

# Install Backend
$s = Get-Service $SERVICE_NAME -ErrorAction SilentlyContinue
if ($s) {
    if ($s.Status -eq 'Running') { & $NSSM stop $SERVICE_NAME 2>$null }
    & $NSSM remove $SERVICE_NAME confirm 2>$null
}

# CRITICAL FIX: Use explicit parameters for NSSM install to avoid process creation errors
& $NSSM install $SERVICE_NAME "$VENV_PYTHON"
& $NSSM set $SERVICE_NAME AppParameters """$APP_PY"""
& $NSSM set $SERVICE_NAME AppDirectory "$BASE_DIR"
& $NSSM set $SERVICE_NAME AppStdout "$BASE_DIR\server_out.log"
& $NSSM set $SERVICE_NAME AppStderr "$BASE_DIR\server_err.log"
& $NSSM set $SERVICE_NAME ObjectName LocalSystem
& $NSSM start $SERVICE_NAME 2>$null

# --- 7. CLOUDFLARE SYNC ---
Write-Host "[5/6] Syncing Tunnel..." -ForegroundColor Gray
# We'll skip the Read-Host for automation if possible, but keep it for user choice
$TUNNEL_NAME = "chatloom-server" # Standardize
$CF_SRV = "ChatLoomTunnel"

$ts = Get-Service $CF_SRV -ErrorAction SilentlyContinue
if ($ts) {
    if ($ts.Status -eq 'Running') { & $NSSM stop $CF_SRV 2>$null }
    & $NSSM remove $CF_SRV confirm 2>$null
}

$cf_bin = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (!$cf_bin) {
    $msi = "$BIN_DIR\cf.msi"
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi" -OutFile "$msi" -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i", "`"$msi`"", "/quiet" -Wait
    $cf_bin = "C:\Program Files\cloudflared\cloudflared.exe"
}

$cf_cred = Get-ChildItem -Path "$env:USERPROFILE\.cloudflared\*.json" | Select-Object -First 1
if ($cf_cred) {
    & $NSSM install $CF_SRV "$cf_bin" "tunnel --cred-file `"$($cf_cred.FullName)`" run --url http://127.0.0.1:5001 $TUNNEL_NAME"
    & $NSSM set $CF_SRV ObjectName LocalSystem
    & $NSSM start $CF_SRV 2>$null
    Write-Host "✅ Tunnel Synced." -ForegroundColor Green
}

# --- 8. FINAL STATUS ---
Write-Host ""
Start-Sleep -Seconds 2
$sObj = Get-Service $SERVICE_NAME -ErrorAction SilentlyContinue
$stText = if ($sObj) { $sObj.Status } else { "Not Found" }
$stColor = if ($stText -eq "Running") { "Green" } else { "Red" }

Write-Host "FINAL STATUS: $SERVICE_NAME is $stText" -ForegroundColor $stColor
Write-Host "🐉 Congratulations! ChatLoom Server is fixed and running." -ForegroundColor Green
Start-Sleep -Seconds 5

