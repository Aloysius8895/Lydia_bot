param([string]$CredentialFile,[switch]$Replace)
$ErrorActionPreference = 'Stop'
try {
    if (-not $CredentialFile) { $CredentialFile = Read-Host 'Local service-account JSON path (do not paste JSON content)' }
    $workspaceDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
    $sourceFile = [IO.Path]::GetFullPath($CredentialFile)
    # Raw credential downloads should be outside the workspace, never under source/data delivery folders.
    if ($sourceFile.StartsWith($workspaceDir + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'unsafe-path' }
    $json = [IO.File]::ReadAllText($sourceFile)
    $account = $json | ConvertFrom-Json
    if ($account.type -ne 'service_account' -or $account.client_email -notmatch '@[^\s@]+\.iam\.gserviceaccount\.com$' -or $account.private_key -notmatch '^-----BEGIN PRIVATE KEY-----') { throw 'invalid-credential' }
    if ($account.token_uri -and $account.token_uri -ne 'https://oauth2.googleapis.com/token') { throw 'invalid-endpoint' }
    Add-Type -AssemblyName System.Security
    $targetDir = Join-Path $workspaceDir 'business/deployment/.runtime/credentials'
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    $accountSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $rights = [Security.AccessControl.FileSystemRights]::FullControl
    $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($accountSid,$rights,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
    Set-Acl -LiteralPath $targetDir -AclObject $acl
    $target = Join-Path $targetDir 'google-drive-reader.dpapi'
    if ((Test-Path -LiteralPath $target) -and -not $Replace) { throw 'existing-store' }
    $plain = [Text.Encoding]::UTF8.GetBytes($json)
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $pending = $target + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    $stream = [IO.File]::Open($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $stream.Write($encrypted,0,$encrypted.Length) } finally { $stream.Dispose() }
    if (Test-Path -LiteralPath $target) { [IO.File]::Replace($pending,$target,$null) } else { [IO.File]::Move($pending,$target) }
    [Array]::Clear($plain,0,$plain.Length)
    $json = $null; $account = $null
    Write-Host 'Credential encrypted for the current Windows user. No Drive connection was made.'
    Write-Host 'Secure the original downloaded JSON separately; this command did not delete it.'
} catch {
    # Never print caught exceptions: JSON parser/crypto errors can contain credential material.
    Write-Error 'Credential setup failed. Check input path/type, existing protected store and current-user permissions. No credential content is printed.' -ErrorAction Continue
    exit 1
}
