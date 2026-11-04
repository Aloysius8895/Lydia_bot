$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path -LiteralPath 'C:\maven\business_agent').Path
$sourceRoot = (Resolve-Path -LiteralPath 'C:\maven\business_agent\business\data').Path
$targetRoot = [IO.Path]::GetFullPath('C:\maven\business_agent\data')
if ($sourceRoot -ne (Join-Path $workspaceRoot 'business\data')) { throw 'Unexpected source' }
if ($targetRoot -ne (Join-Path $workspaceRoot 'data')) { throw 'Unexpected destination' }
$children = @(Get-ChildItem -LiteralPath $sourceRoot -Force)
foreach ($child in $children) {
    if (Test-Path -LiteralPath (Join-Path $targetRoot $child.Name)) { throw "Destination collision: $($child.Name)" }
}
$files = @(Get-ChildItem -LiteralPath $sourceRoot -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($sourceRoot.Length + 1).Replace('\','/')
    [PSCustomObject]@{oldPath=('business/data/'+$relative);newPath=('data/'+$relative);beforeHash=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash;afterMoveHash=$null;identicalBeforeEdits=$false}
})
$manifest = [PSCustomObject]@{timestamp=(Get-Date).ToUniversalTime().ToString('o');workspaceRoot=$workspaceRoot;source=$sourceRoot;destination=$targetRoot;status='PREPARED';movedFiles=$files;runtimeDatabaseMoved=$false}
$manifestPath = Join-Path $workspaceRoot 'business\docs\verification\workspace-data-layout.json'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
foreach ($child in $children) { Move-Item -LiteralPath $child.FullName -Destination (Join-Path $targetRoot $child.Name) }
if (@(Get-ChildItem -LiteralPath $sourceRoot -Force).Count -ne 0) { throw 'Source is not empty' }
Remove-Item -LiteralPath $sourceRoot
foreach ($file in $files) {
    $file.afterMoveHash = (Get-FileHash -LiteralPath (Join-Path $workspaceRoot $file.newPath) -Algorithm SHA256).Hash
    $file.identicalBeforeEdits = $file.beforeHash -eq $file.afterMoveHash
}
if (@($files | Where-Object { -not $_.identicalBeforeEdits }).Count -gt 0) { throw 'Hash mismatch' }
$manifest.status = 'MOVED_VERIFIED_BEFORE_IMPORT_EDITS'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Output "Moved $($files.Count) files to $targetRoot; original hashes verified."
