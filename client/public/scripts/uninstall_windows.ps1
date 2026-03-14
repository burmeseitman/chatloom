# ==========================================
#   AI Swarm Network - Node Uninstall (v1.0)
# ==========================================

$SESSION_ID = if ($args[0]) { $args[0] } else { $env:CHATLOOM_SESSION }
$API_URL = if ($args[1]) { $args[1] } else { if ($env:CHATLOOM_API) { $env:CHATLOOM_API } else { "https://chatloom.online" } }
$BRIDGE_TOKEN = $env:CHATLOOM_BRIDGE_TOKEN

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host " Shutting down AI Swarm Node..." -ForegroundColor Cyan
Write-Host "------------------------------------------" -ForegroundColor Cyan

if ($SESSION_ID -and $BRIDGE_TOKEN) {
    try {
        Invoke-WebRequest `
            -Uri "$API_URL/api/bridge/disconnect" `
            -Method POST `
            -Headers @{
                "Content-Type" = "application/json"
                "X-Chatloom-Bridge-Token" = $BRIDGE_TOKEN
            } `
            -Body "{`"session_id`":`"$SESSION_ID`"}" `
            -UseBasicParsing *> $null
    } catch {}
}

Write-Host "Stopping bridge process..." -ForegroundColor Yellow
Get-CimInstance Win32_Process |
    Where-Object { $_.Name -match '^python(w)?\.exe$' -and $_.CommandLine -like '*chatloom_bridge.py*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$bridgeHome = Join-Path $env:LOCALAPPDATA "ChatLoomBridge"
$tempFiles = @(
    "$env:TEMP\chatloom_bridge.py",
    "$env:TEMP\bridge.log",
    "$env:TEMP\bridge-state.json",
    "$env:TEMP\chatloom_bridge_deps.log"
)

Write-Host "Removing bridge runtime files..." -ForegroundColor Gray
if (Test-Path $bridgeHome) {
    Remove-Item $bridgeHome -Recurse -Force -ErrorAction SilentlyContinue
}
foreach ($path in $tempFiles) {
    if (Test-Path $path) {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Neural Node is now offline." -ForegroundColor Green
Write-Host "Ollama and local models were left untouched." -ForegroundColor Gray
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host "Returning to your terminal in 2s..." -ForegroundColor Gray
Start-Sleep -Seconds 2
exit
