#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string]$NewRelease,
    [string]$CurrentJunction = "C:\Lovarus\current",
    [string]$AppPoolName = "Lovarus",
    [string]$ApiServiceName = "LovarusApi",
    [string]$WorkerServiceName = "LovarusWorker",
    [string]$ApiHostName = "127.0.0.1",
    [int]$ApiPort = 3000,
    [string]$ReadinessPath = "/api/health/ready",
    [string]$RepresentativeReadPath = "/api/orders?limit=1",
    [ValidateRange(10, 300)]
    [int]$ReadinessDeadlineSeconds = 60,
    [ValidateRange(1, 30)]
    [int]$MaximumProbeSeconds = 2
)

$ErrorActionPreference = "Stop"
$NewRelease = [System.IO.Path]::GetFullPath($NewRelease)
$CurrentJunction = [System.IO.Path]::GetFullPath($CurrentJunction)
$appCmd = Join-Path $env:SystemRoot "System32\inetsrv\appcmd.exe"
$releaseCommon = Join-Path $PSScriptRoot "LovarusRelease.Common.ps1"

foreach ($requiredFile in @(
    $appCmd,
    $releaseCommon,
    (Join-Path $NewRelease "dist\index.html"),
    (Join-Path $NewRelease "dist\web.config"),
    (Join-Path $NewRelease "server\.env"),
    (Join-Path $NewRelease "server\dist\main.js"),
    (Join-Path $NewRelease "server\dist\worker.js")
)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Release artifact is missing: $requiredFile"
    }
}
. $releaseCommon
if (Select-String -LiteralPath (Join-Path $NewRelease "server\.env") `
        -Pattern '^\s*ADMIN_PASSWORD\s*=' -Quiet) {
    throw "Release server/.env must not retain ADMIN_PASSWORD."
}
if (Select-String -LiteralPath (Join-Path $NewRelease "server\.env") `
        -Pattern '<[^>]+>' -Quiet) {
    throw "Release server/.env still contains an angle-bracket placeholder."
}

$previousRelease = Get-LovarusJunctionTarget -Path $CurrentJunction
if ($previousRelease -eq $NewRelease) {
    throw "Current junction already targets the requested release."
}

function Invoke-AppCmd {
    param([Parameter(Mandatory)][string]$Verb)
    & $appCmd $Verb "apppool" "/apppool.name:$AppPoolName" | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "appcmd $Verb failed for application pool $AppPoolName."
    }
}

function Stop-Lovarus {
    Invoke-AppCmd "stop"
    Stop-Service -Name $WorkerServiceName -Force -ErrorAction Stop
    Stop-Service -Name $ApiServiceName -Force -ErrorAction Stop
    (Get-Service -Name $WorkerServiceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
    (Get-Service -Name $ApiServiceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
}

function Invoke-LovarusJsonProbe {
    param(
        [Parameter(Mandatory)][string]$Path
    )
    if (-not $Path.StartsWith("/")) {
        throw "Probe path must start with '/': $Path"
    }
    $uri = "http://${ApiHostName}:$ApiPort$Path"
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest `
            -Method Get `
            -Uri $uri `
            -UseBasicParsing `
            -TimeoutSec $MaximumProbeSeconds
    }
    finally {
        $timer.Stop()
    }
    if ($response.StatusCode -ne 200) {
        throw "Probe returned HTTP $($response.StatusCode): $uri"
    }
    if ($timer.Elapsed.TotalSeconds -gt $MaximumProbeSeconds) {
        throw "Probe exceeded $MaximumProbeSeconds seconds: $uri"
    }
    try {
        return $response.Content | ConvertFrom-Json
    }
    catch {
        throw "Probe did not return valid JSON: $uri"
    }
}

function Wait-LovarusApplicationReady {
    $deadline = [DateTime]::UtcNow.AddSeconds($ReadinessDeadlineSeconds)
    $lastFailure = "readiness was not attempted"
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $ready = Invoke-LovarusJsonProbe -Path $ReadinessPath
            if ($ready.status -ne "ready" -or $ready.checks.database -ne "up") {
                throw "Readiness JSON must report status=ready and checks.database=up."
            }
            $representative = Invoke-LovarusJsonProbe -Path $RepresentativeReadPath
            $items = @($representative.items)
            if ($items.Count -lt 1 -or
                [string]::IsNullOrWhiteSpace([string]$items[0].id) -or
                [string]::IsNullOrWhiteSpace([string]$items[0].supplierOrderNumber)) {
                throw "Representative read must return items[0].id and supplierOrderNumber."
            }
            return
        }
        catch {
            $lastFailure = $_.Exception.Message
            Start-Sleep -Seconds 2
        }
    }
    throw "Application readiness failed for $ReadinessDeadlineSeconds seconds: $lastFailure"
}

function Start-Lovarus {
    Start-Service -Name $ApiServiceName
    (Get-Service -Name $ApiServiceName).WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
    Wait-LovarusApplicationReady
    Start-Service -Name $WorkerServiceName
    (Get-Service -Name $WorkerServiceName).WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
    Invoke-AppCmd "start"
}

if (-not $PSCmdlet.ShouldProcess(
        "$CurrentJunction -> $NewRelease",
        "Stop Lovarus, switch release junction, and restart"
    )) {
    return
}

$junctionChanged = $false
try {
    Stop-Lovarus
    Set-LovarusReleaseJunctionTransactional `
        -CurrentJunction $CurrentJunction `
        -NewTarget $NewRelease | Out-Null
    $junctionChanged = $true
    Start-Lovarus
}
catch {
    $deploymentError = $_
    Write-Error "Release activation failed: $($deploymentError.Exception.Message)" -ErrorAction Continue
    if ($junctionChanged) {
        try {
            & $appCmd stop "apppool" "/apppool.name:$AppPoolName" | Out-Null
            Get-Service -Name $WorkerServiceName, $ApiServiceName -ErrorAction SilentlyContinue |
                Stop-Service -Force -ErrorAction SilentlyContinue
            Set-LovarusReleaseJunctionTransactional `
                -CurrentJunction $CurrentJunction `
                -NewTarget $previousRelease | Out-Null
            Start-Lovarus
            Write-Warning "Automatically rolled back to $previousRelease."
        }
        catch {
            throw "Activation failed and automatic rollback also failed: $($_.Exception.Message)"
        }
    } else {
        try {
            Start-Lovarus
            Write-Warning "Restarted the unchanged release after a pre-switch failure."
        }
        catch {
            throw "Activation stopped before switching, and service recovery failed: $($_.Exception.Message)"
        }
    }
    throw $deploymentError
}

Write-Host "Activated release: $NewRelease"
Write-Host "Previous release for explicit rollback: $previousRelease"
