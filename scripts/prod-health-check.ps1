$projectDir = "C:\Users\jakew\Desktop\Claude Code Design\Pokemon App"
$logDir = Join-Path $projectDir "logs"
$logFile = Join-Path $logDir "prod-health.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Log($message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $message" | Out-File -FilePath $logFile -Append -Encoding utf8
}

function Notify($title, $message) {
    Add-Type -AssemblyName System.Windows.Forms
    $notify = New-Object System.Windows.Forms.NotifyIcon
    $notify.Icon = [System.Drawing.SystemIcons]::Warning
    $notify.Visible = $true
    $notify.ShowBalloonTip(15000, $title, $message, [System.Windows.Forms.ToolTipIcon]::Error)
    Start-Sleep -Seconds 1
    $notify.Dispose()
}

# Desktop (local) and mobile/remote (tailnet) both need to be reachable —
# a local-only check can't catch the tailnet cert/tunnel dying while the
# NSSM service itself stays up.
$targets = @(
    @{ Name = "Desktop (localhost:3000)"; Url = "http://localhost:3000" },
    @{ Name = "Mobile/remote (tailnet)"; Url = "https://jakepc.tail593b76.ts.net" }
)

$failures = @()

foreach ($target in $targets) {
    try {
        $response = Invoke-WebRequest -Uri $target.Url -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
            Log "OK   $($target.Name) -> $($response.StatusCode)"
        } else {
            Log "FAIL $($target.Name) -> unexpected status $($response.StatusCode)"
            $failures += $target.Name
        }
    } catch {
        Log "FAIL $($target.Name) -> $($_.Exception.Message)"
        $failures += $target.Name
    }
}

if ($failures.Count -gt 0) {
    $msg = "Prod unreachable: $($failures -join ', ')"
    Log "!!! $msg"
    Notify "PokemonTCGApp prod is down" $msg
    exit 1
} else {
    exit 0
}
