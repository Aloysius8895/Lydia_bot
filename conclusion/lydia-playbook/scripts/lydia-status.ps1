# Lydia read-only health check. Changes nothing, prints no secrets (no email, keys or .env values).
# Run from any directory:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\maven\business_agent\conclusion\lydia-playbook\scripts\lydia-status.ps1
# ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 .ps1 files without a BOM.
param([string]$Repo = 'C:\maven\business_agent')

$ErrorActionPreference = 'SilentlyContinue'
function Section($t) { Write-Output ''; Write-Output "== $t" }
function Newest($dirs) {
  $all = foreach ($d in $dirs) { Get-ChildItem $d -Directory | ForEach-Object { Join-Path $_.FullName 'manifest.json' } | Where-Object { Test-Path $_ } | Get-Item }
  $all | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

Section 'Scheduled tasks'
foreach ($t in Get-ScheduledTask -TaskName 'Lydia*') {
  $i = $t | Get-ScheduledTaskInfo
  Write-Output ("{0,-18} state={1,-8} lastRun={2} lastResult=0x{3:X} nextRun={4}" -f $t.TaskName, $t.State, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime)
}

Section 'Listening ports (4317 guard, 4318 app, 4319 LAN phone guide)'
$listen = Get-NetTCPConnection -State Listen -LocalPort 4317,4318,4319
if (-not $listen) { Write-Output 'nothing is listening -> service is down' }
foreach ($c in $listen) {
  $p = Get-Process -Id $c.OwningProcess
  Write-Output ("{0}:{1} pid={2} started={3} cpuSeconds={4:N1}" -f $c.LocalAddress, $c.LocalPort, $c.OwningProcess, $p.StartTime, $p.CPU)
}
$app = @($listen | Where-Object LocalPort -eq 4318)
if ($app.Count -gt 1) { Write-Output 'WARNING: more than one process on 4318 -> two Lydia instances share one PGlite DB; stop the extra one' }
if (Get-NetTCPConnection -State Listen -LocalPort 4319 -ErrorAction SilentlyContinue) { Write-Output 'NOTE: LAN phone mode is running; it must not run next to Lydia Remote' }
$busy = $app | ForEach-Object { $p1 = (Get-Process -Id $_.OwningProcess).CPU; Start-Sleep -Seconds 3; $p2 = (Get-Process -Id $_.OwningProcess).CPU; if (($p2 - $p1) -gt 2.5) { $_.OwningProcess } }
if ($busy) { Write-Output "WARNING: pid $busy used >2.5s CPU in 3s -> backend may be stuck (kill it; the launcher restarts it within 30s)" }

Section 'Tailscale'
$ts = 'C:\Program Files\Tailscale\tailscale.exe'
if (Test-Path $ts) {
  $j = & $ts status --json | ConvertFrom-Json
  $peers = @($j.Peer.PSObject.Properties.Value)
  Write-Output ("backend={0} selfOnline={1} peers={2} peersOnline={3}" -f $j.BackendState, $j.Self.Online, $peers.Count, @($peers | Where-Object Online).Count)
} else { Write-Output 'tailscale.exe not found' }

Section 'Live page'
$addrFile = Join-Path $Repo 'business\.runtime\remote\address.txt'
if (Test-Path $addrFile) {
  $url = (Get-Content $addrFile -Raw).Trim()
  $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 15 $url
  Write-Output "remote address (from address.txt): HTTP $code   (503 in the first ~10s after start is normal)"
  $live = [regex]::Match((& curl.exe -s --max-time 15 $url) -join "`n", 'assets/index-[^"]+\.js').Value
  $dist = [regex]::Match((Get-Content (Join-Path $Repo 'business\frontend\dist\index.html') -Raw), 'assets/index-[^"]+\.js').Value
  Write-Output "live bundle=$live  dist bundle=$dist  match=$($live -eq $dist -and $live -ne '')"
  if ($live -and $dist -and $live -ne $dist) { Write-Output 'dist was rebuilt but the service was not restarted -> restart Lydia Remote' }
} else { Write-Output 'no address.txt (remote mode never started?)' }

Section 'Claude CLI'
Write-Output ("version: " + (& claude --version))
$a = & claude auth status 2>$null | ConvertFrom-Json
if ($a) { Write-Output ("loggedIn={0} subscriptionType={1} authMethod={2}" -f $a.loggedIn, $a.subscriptionType, $a.authMethod) } else { Write-Output 'auth status unavailable' }
$appPids = @($app | ForEach-Object OwningProcess)
$cl = @(Get-CimInstance Win32_Process -Filter "Name='claude.exe'")
$fromLydia = @($cl | Where-Object { $appPids -contains $_.ParentProcessId })
Write-Output ("claude.exe processes: total={0}, started by the Lydia backend={1} (wait for these to finish before a restart)" -f $cl.Count, $fromLydia.Count)

Section 'Latest verified backup'
$b = Join-Path $Repo 'data\data_storage\backups\database'
$m = Newest @($b, (Join-Path $b 'daily'))
if ($m) { $mj = Get-Content $m.FullName -Raw | ConvertFrom-Json; Write-Output ("{0}  verified={1} restore_verified={2} at={3}" -f (Split-Path $m.DirectoryName -Leaf), $mj.verified, $mj.restore_verified, $m.LastWriteTime) } else { Write-Output 'no backup manifest found' }

Section 'Daily Drive import (reports/sync/daily/latest.json)'
$d = Join-Path $Repo 'data\data_storage\reports\sync\daily\latest.json'
if (Test-Path $d) { $dj = Get-Content $d -Raw -Encoding UTF8 | ConvertFrom-Json; Write-Output ("at={0} status={1} imported={2} flagged={3} pending={4} notReady={5}" -f $dj.at, $dj.status, @($dj.imported).Count, @($dj.flagged).Count, @($dj.pending).Count, @($dj.not_ready).Count); Write-Output '(if "at" is older than today 10:00 although the task ran, the run was killed before writing; 0xC000013A = console closed)' } else { Write-Output 'no daily report yet' }

Section 'Retention (reports/retention/latest.json)'
$r = Join-Path $Repo 'data\data_storage\reports\retention\latest.json'
function Num($v) { if ($null -eq $v) { 0 } elseif ($v -is [array]) { $v.Count } else { $v } }
if (Test-Path $r) { $rj = Get-Content $r -Raw -Encoding UTF8 | ConvertFrom-Json; Write-Output ("at={0} status={1} deleted projects/news/events={2}/{3}/{4}" -f $rj.at, $rj.status, (Num $rj.deleted.projects), (Num $rj.deleted.news), (Num $rj.deleted.events)) } else { Write-Output 'no retention report yet' }

Section 'Git'
$dirty = @(& git -C $Repo status --porcelain).Count
$ahead = & git -C $Repo rev-list --count '@{u}..HEAD' 2>$null
Write-Output ("uncommitted entries={0}  local commits not pushed={1}  (commit/push only when the user asks)" -f $dirty, $ahead)
