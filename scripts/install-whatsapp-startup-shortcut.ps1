$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$StartupDir = [Environment]::GetFolderPath("Startup")
$StartupFile = Join-Path $StartupDir "AtendenteIA-WhatsApp.cmd"
$StartScript = Join-Path $Root "scripts\start-baileys-background.ps1"

$content = @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$StartScript"
"@

Set-Content -Path $StartupFile -Value $content -Encoding ASCII

Write-Output "Startup file installed: $StartupFile"
