#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string]$InstallRoot,

    [string]$ServiceRoot = ""
)

$ErrorActionPreference = "Stop"
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
if ($ServiceRoot) {
    $ServiceRoot = [System.IO.Path]::GetFullPath($ServiceRoot)
} else {
    $ServiceRoot = Join-Path (Split-Path -Parent $InstallRoot) "service"
}

foreach ($serviceId in @("LovarusWorker", "LovarusApi")) {
    $wrapperPath = Join-Path $ServiceRoot "$serviceId.exe"
    if (-not (Test-Path -LiteralPath $wrapperPath -PathType Leaf)) {
        Write-Warning "Wrapper not found for $serviceId; skipping."
        continue
    }
    if (-not $PSCmdlet.ShouldProcess($serviceId, "Stop and uninstall Windows service")) {
        continue
    }

    $service = Get-Service -Name $serviceId -ErrorAction SilentlyContinue
    if ($service -and $service.Status -ne "Stopped") {
        & $wrapperPath stop
        if ($LASTEXITCODE -ne 0) {
            throw "WinSW failed to stop $serviceId (exit $LASTEXITCODE)."
        }
    }
    & $wrapperPath uninstall
    if ($LASTEXITCODE -ne 0) {
        throw "WinSW failed to uninstall $serviceId (exit $LASTEXITCODE)."
    }
}

Write-Host "Services removed. Release files, configuration, logs, and database were retained."
