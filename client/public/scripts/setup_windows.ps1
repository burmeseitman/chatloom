# ==========================================
#   ChatLoom - Secure Node Onboarding (Win)
# ==========================================
# PowerShell version for Windows.
# irm https://www.chatloom.online/scripts/setup_windows.ps1 | iex

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " 🐉 Initializing ChatLoom Secure Bridge..." -ForegroundColor Cyan
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host ""

# Define Secure Origins (Official production + local nodes)
$SECURE_ORIGINS = "https://www.chatloom.online, http://localhost:*, http://127.0.0.1:*"

Write-Host "Configuring security layers for your local node..." -ForegroundColor White

# Use Environment variable for the Current User (equivalent to setx, but inside PS session)
# [Environment]::SetEnvironmentVariable(Name, Value, Scope)
Try {
    [Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0", "User")
    [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "$SECURE_ORIGINS", "User")
    
    Write-Host ""
    Write-Host " ✅ Security configuration successfully injected!" -ForegroundColor Green
    Write-Host "------------------------------------------" -ForegroundColor Yellow
    Write-Host " 🚀 NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "  1. Close and RESTART your PowerShell window." -ForegroundColor White
    Write-Host "  2. Fully RESTART your Ollama application." -ForegroundColor White
    Write-Host "  3. Refresh https://www.chatloom.online" -ForegroundColor White
    Write-Host "------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
} Catch {
    Write-Host " ❌ Error setting environment variables. Please run as Administrator." -ForegroundColor Red
}

Pause
