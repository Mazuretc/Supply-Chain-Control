#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$DatabaseName = "lovarus",
    [string]$HostName = "127.0.0.1",
    [int]$Port = 5432,
    [string]$DatabaseUser = "lovarus_app",
    [Parameter(Mandatory)]
    [string]$BackupDirectory,
    [Parameter(Mandatory)]
    [string]$OffHostBackupDirectory,
    [string]$PgBin = "",
    [string]$PgPassFile = "",
    [ValidateRange(2, 3650)]
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

function Resolve-PgTool {
    param([Parameter(Mandatory)][string]$Name)
    if ($PgBin) {
        $candidate = Join-Path $PgBin "$Name.exe"
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            throw "PostgreSQL tool not found: $candidate"
        }
        return $candidate
    }
    $command = Get-Command "$Name.exe" -ErrorAction Stop
    return $command.Source
}

$pgDump = Resolve-PgTool "pg_dump"
$pgRestore = Resolve-PgTool "pg_restore"
$BackupDirectory = [System.IO.Path]::GetFullPath($BackupDirectory)
$OffHostBackupDirectory = [System.IO.Path]::GetFullPath($OffHostBackupDirectory)
New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $OffHostBackupDirectory -Force | Out-Null
$backupAcl = Get-Acl -LiteralPath $BackupDirectory
if (-not $backupAcl.AreAccessRulesProtected) {
    throw "Backup directory inherits permissions. Run Protect-LovarusBackupDirectory.ps1 first."
}
$forbiddenSids = @("S-1-1-0", "S-1-5-11", "S-1-5-32-545")
foreach ($rule in $backupAcl.Access) {
    if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
        continue
    }
    try {
        $sid = $rule.IdentityReference.Translate(
            [System.Security.Principal.SecurityIdentifier]
        ).Value
    }
    catch {
        throw "Could not validate backup ACL identity '$($rule.IdentityReference)'."
    }
    if ($sid -in $forbiddenSids) {
        throw "Backup directory grants access to a broad identity ($sid). Harden its ACL first."
    }
}

$timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$finalPath = Join-Path $BackupDirectory "$DatabaseName-$timestamp.dump"
$partialPath = "$finalPath.partial"
$partialHashPath = "$finalPath.sha256.partial"
$offHostFinalPath = Join-Path $OffHostBackupDirectory ([System.IO.Path]::GetFileName($finalPath))
$offHostPartialPath = "$offHostFinalPath.partial"
$offHostPartialHashPath = "$offHostFinalPath.sha256.partial"
$previousPgPassFile = $env:PGPASSFILE

try {
    if ($PgPassFile) {
        $resolvedPgPassFile = [System.IO.Path]::GetFullPath($PgPassFile)
        if (-not (Test-Path -LiteralPath $resolvedPgPassFile -PathType Leaf)) {
            throw "PGPASSFILE does not exist: $resolvedPgPassFile"
        }
        $env:PGPASSFILE = $resolvedPgPassFile
    }

    $dumpArguments = @(
        "--host=$HostName",
        "--port=$Port",
        "--username=$DatabaseUser",
        "--dbname=$DatabaseName",
        "--format=custom",
        "--compress=6",
        "--no-owner",
        "--no-privileges",
        "--no-password",
        "--file=$partialPath"
    )
    & $pgDump @dumpArguments
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed (exit $LASTEXITCODE)."
    }

    & $pgRestore "--list" $partialPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore could not read the new archive (exit $LASTEXITCODE)."
    }

    $hash = (Get-FileHash -LiteralPath $partialPath -Algorithm SHA256).Hash.ToLowerInvariant()
    [System.IO.File]::WriteAllText(
        $partialHashPath,
        "$hash  $([System.IO.Path]::GetFileName($finalPath))`r`n",
        [System.Text.UTF8Encoding]::new($false)
    )
    Move-Item -LiteralPath $partialPath -Destination $finalPath
    Move-Item -LiteralPath $partialHashPath -Destination "$finalPath.sha256"

    Copy-Item -LiteralPath $finalPath -Destination $offHostPartialPath
    $offHostHash = (
        Get-FileHash -LiteralPath $offHostPartialPath -Algorithm SHA256
    ).Hash.ToLowerInvariant()
    if ($offHostHash -cne $hash) {
        throw "Off-host backup checksum does not match the local archive."
    }
    Copy-Item -LiteralPath "$finalPath.sha256" -Destination $offHostPartialHashPath
    Move-Item -LiteralPath $offHostPartialPath -Destination $offHostFinalPath
    Move-Item -LiteralPath $offHostPartialHashPath -Destination "$offHostFinalPath.sha256"

    $cutoff = [DateTime]::UtcNow.AddDays(-$RetentionDays)
    foreach ($directory in @($BackupDirectory, $OffHostBackupDirectory)) {
        Get-ChildItem -LiteralPath $directory -Filter "$DatabaseName-*.dump" -File |
            Where-Object LastWriteTimeUtc -lt $cutoff |
            ForEach-Object {
                Remove-Item -LiteralPath $_.FullName -Force
                Remove-Item -LiteralPath "$($_.FullName).sha256" -Force -ErrorAction SilentlyContinue
            }
    }
}
catch {
    Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $partialHashPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $offHostPartialPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $offHostPartialHashPath -Force -ErrorAction SilentlyContinue
    throw
}
finally {
    $env:PGPASSFILE = $previousPgPassFile
}

Write-Host "Backup verified locally and copied off-host: $finalPath"
