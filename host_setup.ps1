# ========================================================
#   ChatLoom Server - Ironclad Deployment (Win)
# ========================================================
# Version: 7.1 - Quiet & Ultra Stable

# 1. Elevate to Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

# 2. Context & Environment
$BASE_DIR = (Get-Item -Path ".").FullName
Set-Location -Path "$BASE_DIR"
Write-Host "--- CHATLOOM IRONCLAD DEPLOYMENT ---" -ForegroundColor Blue

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

# --- 4. PYTHON SYNC ---
Write-Host "[2/6] Syncing Dependencies..." -ForegroundColor Gray
if (!(Test-Path $VENV_DIR)) {
    Write-Host "Creating Virtual Env..." -ForegroundColor Cyan
    python -m venv "$VENV_DIR"
}

Write-Host "Syncing gevent, flask-socketio..." -ForegroundColor Cyan
Start-Process -FilePath $VENV_PYTHON -ArgumentList "-m pip install --upgrade pip" -Wait -NoNewWindow
Start-Process -FilePath $VENV_PYTHON -ArgumentList "-m pip install -r `"$REQ_FILE`"" -Wait -NoNewWindow

# --- 5. APPLICATION DRY RUN ---
Write-Host "[3/6] Validating Backend Stability..." -ForegroundColor Gray
$testRun = Start-Process -FilePath $VENV_PYTHON -ArgumentList "`"$APP_PY`"" -NoNewWindow -PassThru
Start-Sleep -Seconds 5
if ($testRun.HasExited) {
    Write-Host "CRITICAL: Backend failed to start." -ForegroundColor Red; exit
} else {
    Write-Host "✅ Backend Check Passed." -ForegroundColor Green
    Stop-Process -Id $testRun.Id -Force -ErrorAction SilentlyContinue 2>$null
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
& $NSSM install $SERVICE_NAME "`"$VENV_PYTHON`"" "`"$APP_PY`""; & $NSSM set $SERVICE_NAME AppDirectory `"$BASE_DIR`"
& $NSSM set $SERVICE_NAME AppStdout `"$BASE_DIR\server_out.log`"
& $NSSM set $SERVICE_NAME AppStderr `"$BASE_DIR\server_err.log`"
& $NSSM set $SERVICE_NAME ObjectName LocalSystem
& $NSSM start $SERVICE_NAME 2>$null

# --- 7. CLOUDFLARE SYNC ---
Write-Host "[5/6] Syncing Tunnel..." -ForegroundColor Gray
$TUNNEL_NAME = Read-Host "Enter Tunnel Name (chatloom-server)"
$CF_SRV = "ChatLoomTunnel"

if ($TUNNEL_NAME) {
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
        $cmd = "tunnel --cred-file `"$($cf_cred.FullName)`" run --url http://127.0.0.1:5001 $TUNNEL_NAME"
        & $NSSM install $CF_SRV "`"$cf_bin`"" $cmd
        & $NSSM set $CF_SRV ObjectName LocalSystem
        & $NSSM start $CF_SRV 2>$null
        Write-Host "✅ Tunnel Synced." -ForegroundColor Green
    }
}

# --- 8. FINAL STATUS ---
Write-Host ""
$sObj = Get-Service $SERVICE_NAME -ErrorAction SilentlyContinue
$stText = if ($sObj) { $sObj.Status } else { "Not Found" }
$stColor = if ($stText -eq "Running") { "Green" } else { "Red" }

Write-Host "FINAL STATUS: $SERVICE_NAME is $stText" -ForegroundColor $stColor
Write-Host "Congratulations! ChatLoom is ready." -ForegroundColor Green
Start-Sleep -Seconds 5
