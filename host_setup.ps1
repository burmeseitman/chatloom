# ========================================================
#   ChatLoom Server - High Performance Host Setup (Win)
# ========================================================
# This script automates the deployment of ChatLoom as a 
# Windows Service for 24/7 VPS-like hosting.

# 1. Elevate to Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "🛡️  Elevating to Administrator..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$BASE_DIR = Get-Location
$VENV_DIR = "$BASE_DIR\.venv"
$PYTHON_DIR = "C:\Python312" # Default guess, check first

Write-Host "------------------------------------------------" -ForegroundColor Blue
Write-Host "  🐉 ChatLoom Server - One-Click Host Setup" -ForegroundColor Blue
Write-Host "------------------------------------------------" -ForegroundColor Blue

# 2. Check for Python
Write-Host "🔎 Checking Python environment..." -ForegroundColor Gray
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python 3 not found. Please install it from python.org" -ForegroundColor Red
    exit
}

# 3. Setup Virtual Environment
if (!(Test-Path $VENV_DIR)) {
    Write-Host "📦 Creating Virtual Environment..." -ForegroundColor Gray
    python -m venv $VENV_DIR
}
$APP_PYTHON = "$VENV_DIR\Scripts\python.exe"

# 4. Install Dependencies
Write-Host "⬇️  Installing server dependencies..." -ForegroundColor Gray
& $APP_PYTHON -m pip install --upgrade pip
& $APP_PYTHON -m pip install -r "$BASE_DIR\server\requirements.txt"

# 5. Initialize Database
Write-Host "🗄️  Initializing database..." -ForegroundColor Gray
& $APP_PYTHON "$BASE_DIR\server\init_db.py"

# 6. Handle NSSM (Service Manager)
$BIN_DIR = "$BASE_DIR\.bin"
$NSSM_EXE = "$BIN_DIR\nssm.exe"
if (!(Test-Path $NSSM_EXE)) {
    Write-Host "🎨 Setting up Service Manager (NSSM)..." -ForegroundColor Gray
    New-Item -ItemType Directory -Path $BIN_DIR -Force
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "$BIN_DIR\nssm.zip"
    Expand-Archive -Path "$BIN_DIR\nssm.zip" -DestinationPath "$BIN_DIR\nssm_temp" -Force
    # Pick the 64-bit version
    Copy-Item "$BIN_DIR\nssm_temp\nssm-2.24\win64\nssm.exe" -Destination $NSSM_EXE
    Remove-Item "$BIN_DIR\nssm_temp" -Recurse -Force
    Remove-Item "$BIN_DIR\nssm.zip" -Force
}

# 7. Setup ChatLoom Server Service
Write-Host "⚙️  Configuring ChatLoom Windows Service..." -ForegroundColor Gray
& $NSSM_EXE stop ChatLoomServer 2>$null
& $NSSM_EXE remove ChatLoomServer confirm 2>$null

& $NSSM_EXE install ChatLoomServer "$APP_PYTHON"
& $NSSM_EXE set ChatLoomServer AppDirectory "$BASE_DIR"
& $NSSM_EXE set ChatLoomServer AppParameters "server/app.py"
& $NSSM_EXE set ChatLoomServer DisplayName "ChatLoom Swarm Server"
& $NSSM_EXE set ChatLoomServer Description "High-performance AI Swarm Backend"
& $NSSM_EXE set ChatLoomServer Start SERVICE_AUTO_START
& $NSSM_EXE set ChatLoomServer AppStdout "$BASE_DIR\server_out.log"
& $NSSM_EXE set ChatLoomServer AppStderr "$BASE_DIR\server_err.log"

& $NSSM_EXE start ChatLoomServer
Write-Host "✅ ChatLoom Server is now running as a background service!" -ForegroundColor Green

# 8. Setup Cloudflare Tunnel
Write-Host ""
Write-Host "------------------------------------------------" -ForegroundColor Cyan
Write-Host "  ☁️  Cloudflare Tunnel Automation" -ForegroundColor Cyan
Write-Host "------------------------------------------------" -ForegroundColor Gray
Write-Host "To link your server to the internet, please provide your Tunnel Token."
Write-Host "(Get it from: zero-trust > Networks > Tunnels)"
$TOKEN = Read-Host "Token (Enter to skip if already running)"

if ($TOKEN) {
    if (!(Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        Write-Host "⬇️  Installing Cloudflare Tunnel Agent..." -ForegroundColor Gray
        Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi" -OutFile "$BIN_DIR\cloudflared.msi"
        Start-Process msiexec.exe -ArgumentList "/i `"$BIN_DIR\cloudflared.msi`" /quiet" -Wait
    }
    
    Write-Host "🚀 Registering Tunnel Service..." -ForegroundColor Green
    cloudflared service uninstall 2>$null
    cloudflared service install $TOKEN
    Write-Host "✅ Cloudflare Tunnel is now running as a service!" -ForegroundColor Green
}

Write-Host ""
Write-Host "------------------------------------------------" -ForegroundColor Blue
Write-Host " 🎉 SUCCESS! Your Home VPS is fully operational." -ForegroundColor Green
Write-Host " Use 'nssm edit ChatLoomServer' to tweak settings." -ForegroundColor Gray
Write-Host " Logs: server_out.log / server_err.log" -ForegroundColor Gray
Write-Host "------------------------------------------------"
Start-Sleep -Seconds 5
