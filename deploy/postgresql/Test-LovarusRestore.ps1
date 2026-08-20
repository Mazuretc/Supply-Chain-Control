#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BackupFile,
    [string]$HostName = "127.0.0.1",
    [int]$Port = 5432,
    [string]$AdminUser = "postgres",
    [string]$RestoreOwner = "lovarus_app",
    [string]$PgBin = "",
    [string]$PgPassFile = "",
    [ValidateRange(1, 2147483647)]
    [int]$MinimumSupplierOrders = 1,
    [ValidateRange(1, 2147483647)]
    [int]$MinimumErpItems = 1
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
    return (Get-Command "$Name.exe" -ErrorAction Stop).Source
}

$BackupFile = [System.IO.Path]::GetFullPath($BackupFile)
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
    throw "Backup archive does not exist: $BackupFile"
}
$hashFile = "$BackupFile.sha256"
if (-not (Test-Path -LiteralPath $hashFile -PathType Leaf)) {
    throw "Mandatory SHA-256 sidecar is missing: $hashFile"
}
$hashLine = (Get-Content -LiteralPath $hashFile -Raw).Trim()
if ($hashLine -notmatch '^(?<Hash>[A-Fa-f0-9]{64})\s{2}\*?(?<FileName>[^\\/:*?"<>|]+)$') {
    throw "SHA-256 sidecar is malformed: $hashFile"
}
if ($Matches.FileName -cne [System.IO.Path]::GetFileName($BackupFile)) {
    throw "SHA-256 sidecar names a different archive: $($Matches.FileName)"
}
$expectedHash = $Matches.Hash.ToLowerInvariant()
$actualHash = (Get-FileHash -LiteralPath $BackupFile -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -cne $expectedHash) {
    throw "SHA-256 validation failed for $BackupFile."
}

$createdb = Resolve-PgTool "createdb"
$dropdb = Resolve-PgTool "dropdb"
$pgRestore = Resolve-PgTool "pg_restore"
$psql = Resolve-PgTool "psql"
$restoreDatabase = "lovarus_restore_$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$previousPgPassFile = $env:PGPASSFILE
$databaseCreated = $false

try {
    if ($PgPassFile) {
        $resolvedPgPassFile = [System.IO.Path]::GetFullPath($PgPassFile)
        if (-not (Test-Path -LiteralPath $resolvedPgPassFile -PathType Leaf)) {
            throw "PGPASSFILE does not exist: $resolvedPgPassFile"
        }
        $env:PGPASSFILE = $resolvedPgPassFile
    }

    & $pgRestore "--list" $BackupFile | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore could not read the archive index (exit $LASTEXITCODE)."
    }

    & $createdb `
        "--host=$HostName" "--port=$Port" "--username=$AdminUser" "--no-password" `
        "--maintenance-db=postgres" "--template=template0" "--owner=$RestoreOwner" `
        $restoreDatabase
    if ($LASTEXITCODE -ne 0) {
        throw "createdb failed (exit $LASTEXITCODE)."
    }
    $databaseCreated = $true

    & $pgRestore `
        "--host=$HostName" "--port=$Port" "--username=$AdminUser" "--no-password" `
        "--dbname=$restoreDatabase" "--role=$RestoreOwner" "--exit-on-error" `
        "--no-owner" "--no-privileges" $BackupFile
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore failed (exit $LASTEXITCODE)."
    }

    $verificationSql = @"
\set ON_ERROR_STOP on
DO `$lovarus`$
BEGIN
    IF to_regclass('public."SupplierOrder"') IS NULL
       OR to_regclass('public."ErpItem"') IS NULL
       OR to_regclass('public."AdminUser"') IS NULL
       OR to_regclass('public."Job"') IS NULL
       OR to_regclass('public."ProcessingError"') IS NULL
       OR to_regclass('public.session') IS NULL
       OR to_regclass('public._prisma_migrations') IS NULL THEN
        RAISE EXCEPTION 'Required Lovarus tables are missing after restore';
    END IF;
    IF (SELECT count(*) FROM "SupplierOrder") < $MinimumSupplierOrders THEN
        RAISE EXCEPTION 'SupplierOrder representative data is missing';
    END IF;
    IF (SELECT count(*) FROM "ErpItem") < $MinimumErpItems THEN
        RAISE EXCEPTION 'ErpItem representative data is missing';
    END IF;
    IF (SELECT count(*) FROM "AdminUser") <> 1 THEN
        RAISE EXCEPTION 'Exactly one bootstrap admin must exist';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM _prisma_migrations
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
    ) THEN
        RAISE EXCEPTION 'An incomplete Prisma migration exists';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "DeadlineValue"
        WHERE "isCurrent"
        GROUP BY "supplierOrderId", field
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Multiple current deadline values exist for one field';
    END IF;
END
`$lovarus`$;
SELECT
    (SELECT count(*) FROM "SupplierOrder") AS supplier_orders,
    (SELECT count(*) FROM "ErpItem") AS erp_items,
    (SELECT count(*) FROM "AdminUser") AS admin_users,
    (SELECT count(*) FROM "MailMessage") AS mail_messages,
    (SELECT count(*) FROM "Job") AS jobs,
    (SELECT count(*) FROM "ProcessingError") AS processing_errors;
"@
    $verificationSql | & $psql `
        "--no-psqlrc" "--set=ON_ERROR_STOP=1" `
        "--host=$HostName" "--port=$Port" "--username=$AdminUser" "--no-password" `
        "--dbname=$restoreDatabase"
    if ($LASTEXITCODE -ne 0) {
        throw "Post-restore schema verification failed (exit $LASTEXITCODE)."
    }

    Write-Host "Restore test passed for archive: $BackupFile"
}
finally {
    if ($databaseCreated) {
        & $dropdb `
            "--host=$HostName" "--port=$Port" "--username=$AdminUser" "--no-password" `
            "--maintenance-db=postgres" "--if-exists" $restoreDatabase
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not remove restore test database '$restoreDatabase'. Remove it manually."
        }
    }
    $env:PGPASSFILE = $previousPgPassFile
}
