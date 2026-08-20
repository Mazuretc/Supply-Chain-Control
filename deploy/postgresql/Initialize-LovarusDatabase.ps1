#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$DatabaseName = "lovarus",
    [string]$ApplicationRole = "lovarus_app",
    [string]$AdminDatabase = "postgres",
    [string]$HostName = "127.0.0.1",
    [int]$Port = 5432,
    [string]$AdminUser = "postgres",
    [string]$PsqlPath = "psql.exe",
    [SecureString]$ApplicationPassword
)

$ErrorActionPreference = "Stop"
foreach ($identifier in @{
    DatabaseName = $DatabaseName
    ApplicationRole = $ApplicationRole
}.GetEnumerator()) {
    if ($identifier.Value -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') {
        throw "$($identifier.Key) must be a simple PostgreSQL identifier (maximum 63 characters)."
    }
}
if (-not $ApplicationPassword) {
    $ApplicationPassword = Read-Host "Password for PostgreSQL role $ApplicationRole" -AsSecureString
}

$bstr = [IntPtr]::Zero
try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ApplicationPassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrWhiteSpace($plainPassword) -or $plainPassword.Length -lt 16) {
        throw "The application database password must contain at least 16 characters."
    }
    $sqlPassword = $plainPassword.Replace("'", "''")

    $sql = @"
\set ON_ERROR_STOP on
DO `$lovarus`$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ApplicationRole') THEN
        CREATE ROLE "$ApplicationRole" LOGIN PASSWORD '$sqlPassword'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    ELSE
        ALTER ROLE "$ApplicationRole" LOGIN PASSWORD '$sqlPassword'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END
`$lovarus`$;
SELECT 'CREATE DATABASE "$DatabaseName" OWNER "$ApplicationRole" TEMPLATE template0 ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$DatabaseName') \gexec
ALTER DATABASE "$DatabaseName" OWNER TO "$ApplicationRole";
REVOKE ALL ON DATABASE "$DatabaseName" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE "$DatabaseName" TO "$ApplicationRole";
"@

    $arguments = @(
        "--no-psqlrc",
        "--set=ON_ERROR_STOP=1",
        "--host=$HostName",
        "--port=$Port",
        "--username=$AdminUser",
        "--dbname=$AdminDatabase",
        "--no-password"
    )
    $sql | & $PsqlPath @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "psql failed to initialize Lovarus PostgreSQL objects (exit $LASTEXITCODE)."
    }
}
finally {
    $plainPassword = $null
    $sqlPassword = $null
    $sql = $null
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

Write-Host "Database '$DatabaseName' and role '$ApplicationRole' are ready."
Write-Host "Run Prisma migrations from the release server directory before starting services."
