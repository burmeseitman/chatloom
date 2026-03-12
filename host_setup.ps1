# ========================================================
#   ChatLoom Server - Secure & Hardened Host Setup (Win)
# ========================================================
# This script automates the deployment of ChatLoom as a 
# Windows Service with specialized security hardening.

# Force TLS 1.2/1.3 for secure downloads
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

# 1. Elevate to Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Elevating to Administrator..." -ForegroundColor Cyan
    $currentScript = $MyInvocation.MyCommand.Definition
    if ([string]::IsNullOrEmpty($currentScript)) { $currentScript = $MyInvocation.MyCommand.Path }
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$currentScript`"" -Verb RunAs
    exit
}

# 2. Secure Directory Context
$BASE_DIR = (Get-Item -Path ".").FullName
Set-Location -Path "$BASE_DIR"

$VENV_DIR = Join-Path -Path $BASE_DIR -ChildPath ".venv"
$REQUIREMENTS_PATH = Join-Path -Path $BASE_DIR -ChildPath "server\requirements.txt"
$INIT_DB_PATH = Join-Path -Path $BASE_DIR -ChildPath "server\init_db.py"
$APP_PY_PATH = Join-Path -Path $BASE_DIR -ChildPath "server\app.py"
$STDOUT_PATH = Join-Path -Path $BASE_DIR -ChildPath "server_out.log"
$STDERR_PATH = Join-Path -Path $BASE_DIR -ChildPath "server_err.log"
$CLIENT_DIR = Join-Path -Path $BASE_DIR -ChildPath "client"
$CLIENT_ENV_PATH = Join-Path -Path $CLIENT_DIR -ChildPath ".env"

Write-Host "------------------------------------------------" -ForegroundColor Blue
Write-Host "  ChatLoom Server - Secure Deployment" -ForegroundColor Blue
Write-Host "------------------------------------------------" -ForegroundColor Blue

# --- SECURITY & NETWORK ---
Write-Host "[SEC] Applying folder security and firewall..." -ForegroundColor Gray
icacls "$BASE_DIR" /inheritance:r /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" /grant "Users:(OI)(CI)RX" /Q /C
Remove-NetFirewallRule -DisplayName "ChatLoom Server" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "ChatLoom Server" -Direction Inbound -LocalPort 5001 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue

# --- FRONTEND CONFIGURATION ---
Write-Host "[CFG] Configuring Frontend API Endpoint..." -ForegroundColor Gray
# Point frontend to our background service on 5001
$ENV_CONTENT = "VITE_BACKEND_URL=http://localhost:5001`n"
Set-Content -Path "$CLIENT_ENV_PATH" -Value $ENV_CONTENT -Force

# 3. Environment Checks
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "FATAL: Python 3 missing." -ForegroundColor Red; exit
}

# Setup VENV
if (!(Test-Path -Path "$VENV_DIR")) {
    python -m venv "$VENV_DIR"
}
$VENV_PYTHON_EXE = Join-Path -Path $VENV_DIR -ChildPath "Scripts\python.exe"
$APP_PYTHON = (Get-Item -Path "$VENV_PYTHON_EXE").FullName

# 4. Dependencies & DB
Write-Host "Installing dependencies..." -ForegroundColor Gray
Start-Process -FilePath $APP_PYTHON -ArgumentList "-m pip install --upgrade pip" -Wait -NoNewWindow
Start-Process -FilePath $APP_PYTHON -ArgumentList "-m pip install -r `"$REQUIREMENTS_PATH`"" -Wait -NoNewWindow
Start-Process -FilePath $APP_PYTHON -ArgumentList "`"$INIT_DB_PATH`"" -Wait -NoNewWindow

# 5. Service Manager (NSSM)
$BIN_DIR = Join-Path -Path $BASE_DIR -ChildPath ".bin"
$NSSM_EXE = Join-Path -Path $BIN_DIR -ChildPath "nssm.exe"
if (!(Test-Path -Path "$NSSM_EXE")) {
    if (!(Test-Path -Path "$BIN_DIR")) { New-Item -ItemType Directory -Path "$BIN_DIR" -Force }
    $nssm_zip = Join-Path -Path $BIN_DIR -ChildPath "nssm.zip"
    $nssm_temp = Join-Path -Path $BIN_DIR -ChildPath "nssm_temp"
    Invoke-WebRequest -Uri "https://github.com/fawno/nssm.cc/releases/download/v2.24/nssm-2.24.zip" -OutFile "$nssm_zip" -UseBasicParsing
    Expand-Archive -Path "$nssm_zip" -DestinationPath "$nssm_temp" -Force
    $extracted_exe = Get-ChildItem -Path "$nssm_temp" -Recurse -Filter "nssm.exe" | Where-Object { $_.FullName -match "win64" } | Select-Object -First 1
    if ($extracted_exe) { Copy-Item -Path $extracted_exe.FullName -Destination "$NSSM_EXE" -Force }
    Remove-Item -Path "$nssm_temp" -Recurse -Force; Remove-Item -Path "$nssm_zip" -Force
}

# 6. Deploy ChatLoom Service
Write-Host "Deploying Background Service..." -ForegroundColor Gray
$oldPort = Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
if ($oldPort) { Stop-Process -Id $oldPort -Force -ErrorAction SilentlyContinue }
Stop-Process -Name nssm -Force -ErrorAction SilentlyContinue 2>$null

$SERVICE_NAME = "ChatLoomServer"
if (Get-Service $SERVICE_NAME -ErrorAction SilentlyContinue) {
    Start-Process -FilePath $NSSM_EXE -ArgumentList "stop $SERVICE_NAME" -Wait -NoNewWindow
    Start-Process -FilePath $NSSM_EXE -ArgumentList "remove $SERVICE_NAME confirm" -Wait -NoNewWindow
}

$installArgs = @("install", $SERVICE_NAME, "`"$APP_PYTHON`"", "`"$APP_PY_PATH`"")
Start-Process -FilePath $NSSM_EXE -ArgumentList $installArgs -Wait -NoNewWindow
Start-Process -FilePath $NSSM_EXE -ArgumentList "set $SERVICE_NAME AppDirectory `"$BASE_DIR`"" -Wait -NoNewWindow
Start-Process -FilePath $NSSM_EXE -ArgumentList "set $SERVICE_NAME Start SERVICE_AUTO_START" -Wait -NoNewWindow
Start-Process -FilePath $NSSM_EXE -ArgumentList "set $SERVICE_NAME AppStdout `"$STDOUT_PATH`"" -Wait -NoNewWindow
Start-Process -FilePath $NSSM_EXE -ArgumentList "set $SERVICE_NAME AppStderr `"$STDERR_PATH`"" -Wait -NoNewWindow
Start-Process -FilePath $NSSM_EXE -ArgumentList "start $SERVICE_NAME" -Wait -NoNewWindow

# 7. Finalize Cloudflare Tunnel Service
Write-Host ""
Write-Host "Cloudflare Tunnel Setup:"
$TOKEN = Read-Host "Enter your Tunnel Token"

if ($TOKEN) {
    if (!(Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        $msi_path = Join-Path -Path $BIN_DIR -ChildPath "cloudflared.msi"
        Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi" -OutFile "$msi_path" -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i", "`"$msi_path`"", "/quiet" -Wait
    }
    
    $cf_exe = "cloudflared"
    $cf_full_path = "C:\Program Files\cloudflared\cloudflared.exe"
    if (Test-Path $cf_full_path) { $cf_exe = $cf_full_path }

    Start-Process -FilePath $cf_exe -ArgumentList "service uninstall" -Wait -NoNewWindow -ErrorAction SilentlyContinue
    Start-Process -FilePath $cf_exe -ArgumentList "service install $TOKEN" -Wait -NoNewWindow
    Start-Service -Name "Cloudflared" -ErrorAction SilentlyContinue
    Write-Host "✅ Cloudflare Tunnel Bridge ACTIVE." -ForegroundColor Green
}

Write-Host ""
Write-Host "🎉 DEPLOYMENT COMPLETE." -ForegroundColor Green
Write-Host "Tip: Restart your frontend command 'npm run dev' to sync with the backend." -ForegroundColor Yellow
Start-Sleep -Seconds 5
