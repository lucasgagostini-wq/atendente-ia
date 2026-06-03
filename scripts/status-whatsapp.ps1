$ErrorActionPreference = "Continue"

Write-Output "== Atendente IA / WhatsApp status =="

$bridge = $null
try {
  $bridge = Invoke-RestMethod -Uri "http://127.0.0.1:8080/health" -TimeoutSec 6
  Write-Output "Bridge local: OK"
  Write-Output "WhatsApp: connected=$($bridge.connected) state=$($bridge.state) owner=$($bridge.ownerJid)"
  Write-Output "Webhook: hasWebhook=$($bridge.hasWebhook)"
} catch {
  Write-Output "Bridge local: OFFLINE ($($_.Exception.Message))"
}

try {
  Invoke-WebRequest -Uri "https://atendente-ia-eight.vercel.app" -TimeoutSec 10 -UseBasicParsing | Out-Null
  Write-Output "Vercel app: OK"
} catch {
  Write-Output "Vercel app: ERROR ($($_.Exception.Message))"
}

try {
  $processes = Get-Process | Where-Object { $_.ProcessName -like "*node*" -or $_.ProcessName -like "*cloudflared*" }
  Write-Output "Local processes:"
  $processes | Select-Object Id,ProcessName,StartTime | Format-Table -AutoSize
} catch {
  Write-Output "Could not list local processes."
}
