$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath 'C:\maven\business_agent\business').Path
$dataRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'data'))
if (-not $dataRoot.StartsWith($projectRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Destination outside project' }
$moves = @()
$files = @()
foreach ($folderName in @('RAG', 'database')) {
    $sourcePath = (Resolve-Path -LiteralPath (Join-Path $projectRoot $folderName)).Path
    $destinationPath = [System.IO.Path]::GetFullPath((Join-Path $dataRoot $folderName))
    if (-not $sourcePath.StartsWith($projectRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Source outside project' }
    if (-not $destinationPath.StartsWith($dataRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Destination outside data folder' }
    if (Test-Path -LiteralPath $destinationPath) { throw "Destination already exists: $destinationPath" }
    $moves += [PSCustomObject]@{source=$sourcePath;destination=$destinationPath}
    foreach ($item in Get-ChildItem -LiteralPath $sourcePath -File -Recurse) {
        $oldRelative = $item.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        $files += [PSCustomObject]@{oldPath=$oldRelative;newPath=('data/' + $oldRelative);beforeHash=(Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash;afterMoveHash=$null;identicalBeforeEdits=$false}
    }
}
$manifest = [PSCustomObject]@{
    timestamp=(Get-Date).ToUniversalTime().ToString('o'); timezone='Asia/Kuala_Lumpur'
    projectRoot=$projectRoot; status='PREPARED'; movedFiles=$files
    runtimeDatabaseMoved=$false; schemaChanged=$false; activeImportsUpdated=$false
    scope='Move RAG and database source folders under business/data; preserve runtime and historical exports'
}
$manifestPath = Join-Path $projectRoot 'docs\verification\data-layout.json'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
foreach ($move in $moves) { Move-Item -LiteralPath $move.source -Destination $move.destination }
foreach ($file in $files) {
    $file.afterMoveHash = (Get-FileHash -LiteralPath (Join-Path $projectRoot $file.newPath) -Algorithm SHA256).Hash
    $file.identicalBeforeEdits = $file.beforeHash -eq $file.afterMoveHash
}
$manifest.status = 'MOVED_VERIFIED_BEFORE_IMPORT_EDITS'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
if (@($files | Where-Object { -not $_.identicalBeforeEdits }).Count -gt 0) { throw 'Relocation hash mismatch' }
Write-Output "Moved $($files.Count) source files; all SHA-256 hashes identical before import edits. Runtime database unchanged."
