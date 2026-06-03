$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root ".codex"
$OutLog = Join-Path $LogDir "baileys-bridge-out.log"
$ErrLog = Join-Path $LogDir "baileys-bridge-err.log"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

$existing = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Write-Output "Baileys bridge already listening on port 8080."
  exit 0
}

$env:BAILEYS_BRIDGE_PORT = "8080"
$env:BAILEYS_BRIDGE_API_KEY = "local-bridge-key"
$env:BAILEYS_BRIDGE_INSTANCE_NAME = "atendente-ia"
$env:BAILEYS_BRIDGE_WEBHOOK_URL = "https://atendente-ia-eight.vercel.app/api/webhooks/evolution"
$env:BAILEYS_BRIDGE_AUTOSTART = "true"
$env:BAILEYS_AUTO_RECONNECT = "true"

$process = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList "scripts/baileys-bridge.mjs" `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -PassThru

Start-Sleep -Seconds 8

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8080/health" -TimeoutSec 8
  Write-Output "Baileys bridge started. PID=$($process.Id) connected=$($health.connected) state=$($health.state)"
} catch {
  Write-Output "Baileys bridge started. PID=$($process.Id), but health check failed: $($_.Exception.Message)"
}
