# One-time migration record. Refuses to run when app is absent or targets collide.
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath('C:\maven\business_agent\business')
$sourceRoot = Join-Path $projectRoot 'app'
if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) { throw 'Legacy app directory does not exist; migration is not repeatable.' }
$mapping = [ordered]@{
  'src\retrieval.ts'='RAG\retrieval.ts'; 'src\query-expansion.ts'='RAG\query-expansion.ts'; 'src\rerank.ts'='RAG\rerank.ts'; 'src\sources.ts'='RAG\sources.ts'; 'src\budget.ts'='RAG\search.ts'; 'src\providers\embedding.ts'='RAG\providers\embedding.ts';
  'src\worker.ts'='agents\worker.ts'; 'src\research.ts'='agents\research.ts'; 'src\prompts.ts'='agents\prompts.ts'; 'src\skills.ts'='agents\skills.ts'; 'src\citations.ts'='agents\citations.ts'; 'src\providers\claude.ts'='agents\providers\claude.ts';
  'src\server.ts'='backend\server.ts'; 'src\auth.ts'='backend\auth.ts'; 'src\export.ts'='backend\export.ts'; 'src\store.ts'='database\store.ts'; 'src\schema.sql'='database\schema.sql'; 'src\config.ts'='shared\config.ts';
  'public'='frontend\research-pwa'; 'scripts'='scripts'; 'tests'='tests'; 'test-results'='test-results'; 'node_modules'='node_modules'; '.data'='.runtime\data'; '.cli-workspace'='.runtime\claude'; 'certs'='deployment\certs';
  'package.json'='package.json'; 'package-lock.json'='package-lock.json'; 'tsconfig.json'='tsconfig.json'; 'Start-Crew.cmd'='Start-Crew.cmd'; '.gitignore'='.gitignore'; '.env.example'='deployment\.env.example'; '.env.lan.example'='deployment\.env.lan.example'; 'README.md'='docs\RUNNING.md'
}
if (Test-Path -LiteralPath (Join-Path $sourceRoot '.env')) { $mapping['.env']='deployment\.env' }
function Assert-ProjectPath([string]$candidate) {
  $absolute = [IO.Path]::GetFullPath($candidate)
  if (-not $absolute.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Path outside intended project: $absolute" }
}
foreach ($entry in $mapping.GetEnumerator()) {
  $sourcePath = Join-Path $sourceRoot $entry.Key; $targetPath = Join-Path $projectRoot $entry.Value
  Assert-ProjectPath $sourcePath; Assert-ProjectPath $targetPath
  if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing source: $sourcePath" }
  if (Test-Path -LiteralPath $targetPath) { throw "Refusing to overwrite: $targetPath" }
}
$metadata = Get-Content -LiteralPath (Join-Path $sourceRoot '.data\server-process.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$serverProcess = Get-Process -Id $metadata.pid -ErrorAction SilentlyContinue
if ($serverProcess) {
  if ($serverProcess.ProcessName -ne 'node' -or [Math]::Abs(($serverProcess.StartTime.ToUniversalTime() - [DateTime]::Parse($metadata.startedAt).ToUniversalTime()).TotalSeconds) -gt 10) { throw 'Process identity differs from recorded project server.' }
  Stop-Process -Id $serverProcess.Id
  $serverProcess.WaitForExit(10000) | Out-Null
}
$files = @(Get-ChildItem -LiteralPath $sourceRoot -File -Recurse -Force)
$manifest = foreach ($file in $files) {
  $relative = $file.FullName.Substring($sourceRoot.Length + 1)
  $matched = @($mapping.Keys | Where-Object { $relative -eq $_ -or $relative.StartsWith($_ + '\', [StringComparison]::OrdinalIgnoreCase) })
  if ($matched.Count -ne 1) { throw "Unmapped or ambiguous file: $relative" }
  $key = $matched[0]; $destination = $mapping[$key] + $relative.Substring($key.Length)
  [PSCustomObject]@{before=$relative; after=$destination; sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}
}
$manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $projectRoot 'docs\verification\responsibility-layout-manifest.json') -Encoding UTF8
foreach ($entry in $mapping.GetEnumerator()) {
  $targetPath = Join-Path $projectRoot $entry.Value
  New-Item -ItemType Directory -Path (Split-Path -Parent $targetPath) -Force | Out-Null
  Move-Item -LiteralPath (Join-Path $sourceRoot $entry.Key) -Destination $targetPath
}
$mismatches = @($manifest | Where-Object { (Get-FileHash -LiteralPath (Join-Path $projectRoot $_.after) -Algorithm SHA256).Hash -ne $_.sha256 })
if ($mismatches.Count) { throw "Moved file hash mismatch count: $($mismatches.Count)" }
foreach ($directory in @((Join-Path $sourceRoot 'src\providers'), (Join-Path $sourceRoot 'src'), $sourceRoot)) {
  Assert-ProjectPath $directory
  if (Test-Path -LiteralPath $directory) {
    if (@(Get-ChildItem -LiteralPath $directory -Force).Count) { throw "Refusing to remove nonempty directory: $directory" }
    Remove-Item -LiteralPath $directory
  }
}
$report = [ordered]@{timestamp=[DateTime]::UtcNow.ToString('o'); projectRoot=$projectRoot; status='FILES_MOVED_HASH_VERIFIED'; filesVerified=$manifest.Count; mismatches=$mismatches.Count; scope='Immediately after native moves, before intentional import/config/document edits'; originalSkillsAndExpertTeam='Untouched'; originalFrontend='Untouched; new PWA added only in frontend/research-pwa'; behaviorTests='PENDING'; manifest='responsibility-layout-manifest.json'}
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $projectRoot 'docs\verification\responsibility-layout.json') -Encoding UTF8
$report | ConvertTo-Json -Compress
