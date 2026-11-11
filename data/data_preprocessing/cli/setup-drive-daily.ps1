param(
    [string]$RootFolderId,
    [string]$ProducerId = 'grok-daily',
    [string]$At = '10:00',
    [int]$Keep = 30,
    [switch]$Remove
)
# Registers "Lydia Drive Daily": every day at $At, run drive-daily.ts as the current Windows user
# (the Drive credential is DPAPI-protected for this user). No credential is passed or stored here.
$ErrorActionPreference = 'Stop'
$taskName = 'Lydia Drive Daily'
if ($Remove) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    Write-Host 'Removed the daily Drive import. Manual drive-manual.ts still works.'
    return
}
if ($RootFolderId -notmatch '^[a-zA-Z0-9_-]{5,200}$') { throw 'Pass -RootFolderId (the Drive delivery root folder id).' }
if ($ProducerId -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$') { throw 'Invalid -ProducerId.' }
if ($Keep -lt 3) { throw '-Keep must be at least 3.' }
$dataDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$arguments = "--experimental-strip-types data_preprocessing/cli/drive-daily.ts --root-folder-id $RootFolderId --producer-id $ProducerId --keep $Keep"
$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $nodeExe -Argument $arguments -WorkingDirectory $dataDir
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
# StartWhenAvailable: if the computer was off or asleep at $At, run once when it is back.
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Daily Grok Drive import for Lydia: preview, backup, rehearsal, import and readback; conflicts are flagged, never overwritten.' -Force | Out-Null
$info = Get-ScheduledTaskInfo -TaskName $taskName
Write-Host ("Registered '$taskName'. Next run: " + $info.NextRunTime)
