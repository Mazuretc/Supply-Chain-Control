#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$ServerRoot,

    [SecureString]$BootstrapPassword
)

$ErrorActionPreference = "Stop"
$ServerRoot = [System.IO.Path]::GetFullPath($ServerRoot)
$environmentFile = Join-Path $ServerRoot ".env"
if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf)) {
    throw "Server environment file is missing: $environmentFile"
}
if (Select-String -LiteralPath $environmentFile -Pattern '^\s*ADMIN_PASSWORD\s*=' -Quiet) {
    throw "Remove ADMIN_PASSWORD from server/.env before bootstrapping the admin."
}
if (Test-Path Env:\ADMIN_PASSWORD) {
    throw "ADMIN_PASSWORD is already present in the parent process environment."
}
if (-not $BootstrapPassword) {
    $BootstrapPassword = Read-Host "One-time bootstrap password for Lovarus admin" -AsSecureString
}

$bstr = [IntPtr]::Zero
$locationPushed = $false
try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($BootstrapPassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrWhiteSpace($plainPassword) -or $plainPassword.Length -lt 16) {
        throw "Bootstrap password must contain at least 16 characters."
    }

    $env:ADMIN_PASSWORD = $plainPassword
    Push-Location $ServerRoot
    $locationPushed = $true
    & npm.cmd run prisma:seed
    if ($LASTEXITCODE -ne 0) {
        throw "Admin seed failed (exit $LASTEXITCODE)."
    }
}
finally {
    Remove-Item Env:\ADMIN_PASSWORD -ErrorAction SilentlyContinue
    $plainPassword = $null
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ($locationPushed) {
        Pop-Location
    }
}

Write-Host "Admin seed succeeded; ADMIN_PASSWORD was removed from the process environment."
