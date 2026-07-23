$projectDir = "C:\Users\jakew\Desktop\Claude Code Design\Pokemon App"
$logDir = Join-Path $projectDir "logs"
$logFile = Join-Path $logDir "price-sync.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Log($message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $message" | Out-File -FilePath $logFile -Append -Encoding utf8
}

# Native commands (docker, npm) write routine status to stderr even on success;
# run them under Continue so that doesn't get treated as a terminating error.
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Set-Location $projectDir
Log "=== daily price sync starting ==="

function Run-Step($label, $scriptBlock) {
    Log "$label..."
    & $scriptBlock *>> $logFile
    if ($LASTEXITCODE -ne 0) {
        Log "!!! $label FAILED (exit code $LASTEXITCODE)"
        return $false
    }
    return $true
}

$ok = Run-Step "Ensuring Postgres container is up" { docker compose up -d }
if ($ok) { Start-Sleep -Seconds 5 }
if ($ok) { $ok = Run-Step "Running ingest:cards:pricecharting" { npm run ingest:cards:pricecharting } }
if ($ok) { $ok = Run-Step "Running ingest:sealed:pricecharting" { npm run ingest:sealed:pricecharting } }

if ($ok) {
    Log "=== daily price sync completed successfully ==="
    exit 0
} else {
    Log "=== daily price sync FAILED ==="
    exit 1
}
