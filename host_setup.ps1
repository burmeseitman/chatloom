# ========================================================
#   ChatLoom Server - High Performance Host Setup (Win)
# ========================================================
# This script automates the deployment of ChatLoom as a 
# Windows Service for 24/7 VPS-like hosting.

# 1. Elevate to Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Elevating to Administrator..." -ForegroundColor Cyan
    $currentScript = $MyInvocation.MyCommand.Definition
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$currentScript`"" -Verb RunAs
    exit
}

$BASE_DIR = (Get-Location).Path
$VENV_DIR = Join-Path -Path $BASE_DIR -ChildPath ".venv"
$REQUIREMENTS_PATH = Join-Path -Path $BASE_DIR -ChildPath "server\requirements.txt"
$INIT_DB_PATH = Join-Path -Path $BASE_DIR -ChildPath "server\init_db.py"
$APP_PY_PATH = Join-Path -Path $BASE_DIR -ChildPath "server\app.py"

Write-Host "------------------------------------------------" -ForegroundColor Blue
Write-Host "  ChatLoom Server - One-Click Host Setup" -ForegroundColor Blue
Write-Host "------------------------------------------------" -ForegroundColor Blue

# 2. Check for Python
Write-Host "Checking Python environment..." -ForegroundColor Gray
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python 3 not found. Please install it from python.org" -ForegroundColor Red
    exit
}

# 3. Setup Virtual Environment
if (!(Test-Path -Path "$VENV_DIR")) {
    Write-Host "Creating Virtual Environment..." -ForegroundColor Gray
    python -m venv "$VENV_DIR"
}
$APP_PYTHON = Join-Path -Path $VENV_DIR -ChildPath "Scripts\python.exe"

# 4. Install Dependencies
Write-Host "Installing server dependencies..." -ForegroundColor Gray
& "$APP_PYTHON" -m pip install --upgrade pip
& "$APP_PYTHON" -m pip install -r "$REQUIREMENTS_PATH"

# 5. Initialize Database
Write-Host "Initializing database..." -ForegroundColor Gray
& "$APP_PYTHON" "$INIT_DB_PATH"

# 6. Handle NSSM (Service Manager)
$BIN_DIR = Join-Path -Path $BASE_DIR -ChildPath ".bin"
$NSSM_EXE = Join-Path -Path $BIN_DIR -ChildPath "nssm.exe"
if (!(Test-Path -Path "$NSSM_EXE")) {
    Write-Host "Setting up Service Manager (NSSM)..." -ForegroundColor Gray
    if (!(Test-Path -Path "$BIN_DIR")) { New-Item -ItemType Directory -Path "$BIN_DIR" -Force }
    $nssm_zip = Join-Path -Path $BIN_DIR -ChildPath "nssm.zip"
    $nssm_temp = Join-Path -Path $BIN_DIR -ChildPath "nssm_temp"
    
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "$nssm_zip" -UseBasicParsing
    Expand-Archive -Path "$nssm_zip" -DestinationPath "$nssm_temp" -Force
    # Pick the 64-bit version
    $nssm_src = Join-Path -Path $nssm_temp -ChildPath "nssm-2.24\win64\nssm.exe"
    Copy-Item -Path "$nssm_src" -Destination "$NSSM_EXE"
    Remove-Item -Path "$nssm_temp" -Recurse -Force
    Remove-Item -Path "$nssm_zip" -Force
}

# 7. Setup ChatLoom Server Service
Write-Host "Configuring ChatLoom Windows Service..." -ForegroundColor Gray
& "$NSSM_EXE" stop ChatLoomServer 2>$null
& "$NSSM_EXE" remove ChatLoomServer confirm 2>$null

& "$NSSM_EXE" install ChatLoomServer "$APP_PYTHON"
& "$NSSM_EXE" set ChatLoomServer AppDirectory "$BASE_DIR"
& "$NSSM_EXE" set ChatLoomServer AppParameters "`"$APP_PY_PATH`""
& "$NSSM_EXE" set ChatLoomServer DisplayName "ChatLoom Swarm Server"
& "$NSSM_EXE" set ChatLoomServer Description "High-performance AI Swarm Backend"
& "$NSSM_EXE" set ChatLoomServer Start SERVICE_AUTO_START

$STDOUT_PATH = Join-Path -Path $BASE_DIR -ChildPath "server_out.log"
$STDERR_PATH = Join-Path -Path $BASE_DIR -ChildPath "server_err.log"
& "$NSSM_EXE" set ChatLoomServer AppStdout "$STDOUT_PATH"
& "$NSSM_EXE" set ChatLoomServer AppStderr "$STDERR_PATH"

& "$NSSM_EXE" start ChatLoomServer
Write-Host "ChatLoom Server is now running as a background service!" -ForegroundColor Green

# 8. Setup Cloudflare Tunnel
Write-Host ""
Write-Host "------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Cloudflare Tunnel Automation" -ForegroundColor Cyan
Write-Host "------------------------------------------------" -ForegroundColor Gray
Write-Host "To link your server to the internet, please provide your Tunnel Token."
Write-Host "(Get it from: zero-trust > Networks > Tunnels)"
$TOKEN = Read-Host "Token (Enter to skip if already running)"

if ($TOKEN) {
    $cf_cmd = "cloudflared"
    if (!(Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        Write-Host "Installing Cloudflare Tunnel Agent..." -ForegroundColor Gray
        $msi_path = Join-Path -Path $BIN_DIR -ChildPath "cloudflared.msi"
        Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi" -OutFile "$msi_path" -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i", "`"$msi_path`"", "/quiet" -Wait
        
        # MSI install path - refresh current session to find it
        $cf_path = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
        if (Test-Path $cf_path) { $cf_cmd = $cf_path }
    }
    
    Write-Host "Registering Tunnel Service..." -ForegroundColor Green
    & $cf_cmd service uninstall 2>$null
    & $cf_cmd service install $TOKEN
    Write-Host "Cloudflare Tunnel is now running as a service!" -ForegroundColor Green
}

Write-Host ""
Write-Host "------------------------------------------------" -ForegroundColor Blue
Write-Host " SUCCESS! Your Home VPS is fully operational." -ForegroundColor Green
Write-Host " Use 'nssm edit ChatLoomServer' to tweak settings." -ForegroundColor Gray
Write-Host " Logs: server_out.log / server_err.log" -ForegroundColor Gray
Write-Host "------------------------------------------------"
Start-Sleep -Seconds 5
