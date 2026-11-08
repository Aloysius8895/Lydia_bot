param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$businessDir = Split-Path -Parent $PSScriptRoot
$taskName = 'Lydia Remote'
$ruleName = 'Lydia-Tailscale-HTTPS'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Open PowerShell as Administrator, using the same Windows account, then run this command again.'
}
if ($Remove) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $taskName
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Host 'Removed Lydia startup and its firewall rule. Workspace and Tailscale are preserved.'
    return
}
$tailscaleExe = Join-Path $env:ProgramFiles 'Tailscale/tailscale.exe'
if (-not (Test-Path -LiteralPath $tailscaleExe)) {
    throw 'Install Tailscale from https://tailscale.com/download/windows and sign in, then run this setup again.'
}
$statusText = & $tailscaleExe status --json
if ($LASTEXITCODE -ne 0) { throw 'Tailscale status failed. Open Tailscale and sign in first.' }
$status = $statusText | ConvertFrom-Json
if ($status.BackendState -ne 'Running') { throw 'Connect Tailscale on this computer first.' }
$tailscaleIP = @($status.Self.TailscaleIPs | Where-Object {
    $_ -match '^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$' -and [int]$Matches[1] -ge 64 -and [int]$Matches[1] -le 127
}) | Select-Object -First 1
$dnsName = ([string]$status.Self.DNSName).TrimEnd('.')
if (-not $tailscaleIP -or $dnsName -notmatch '^[a-z0-9][a-z0-9.-]*\.ts\.net$') { throw 'Enable MagicDNS in the Tailscale admin console first.' }
if (@(Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue).Count -gt 0) {
    throw 'Port 4318 is in use. Stop the current Lydia window with Ctrl+C, then run this setup again. Do not force-kill it.'
}
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$npmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
$remoteDir = Join-Path $businessDir '.runtime/remote'
New-Item -ItemType Directory -Force -Path $remoteDir | Out-Null
Push-Location $businessDir
try {
    & $npmExe run build:frontend
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed; startup was not installed.' }
    & $tailscaleExe cert --min-validity 336h --cert-file (Join-Path $remoteDir 'pending.crt') --key-file (Join-Path $remoteDir 'pending.key') $dnsName
    if ($LASTEXITCODE -ne 0) { throw 'Enable HTTPS Certificates at https://login.tailscale.com/admin/dns then retry.' }
} finally { Pop-Location }
# Restrict ingress to this virtual address and Tailscale IPv4 peers.
# No router forwarding or LAN/public listener is configured.
Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Name $ruleName -DisplayName 'Lydia private Tailscale HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $tailscaleIP -LocalPort 4318 -RemoteAddress '100.64.0.0/10' -Program $nodeExe -Profile Any | Out-Null
$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $nodeExe -Argument '--experimental-strip-types scripts/start-remote.ts' -WorkingDirectory $businessDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Description 'Private Lydia HTTPS after Windows sign-in, using the existing user workspace and Claude profile.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
$appURL = 'https://' + $dnsName + ':4318'
Write-Host ('Phone and computer: ' + $appURL)
Write-Host 'Keep Windows signed in, online and awake. Locking the screen is OK.'
Write-Host 'Phone: install Tailscale, sign into the same account, connect, then open the URL and use your existing Lydia password.'
Write-Host ('Logs: ' + $remoteDir)
Write-Host 'If the computer Tailscale IP changes, rerun setup to update the firewall scope.'
