#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$deployRoot = Split-Path -Parent $PSScriptRoot
$releaseCommon = Join-Path $deployRoot "release\LovarusRelease.Common.ps1"
$monitorCommon = Join-Path $deployRoot "monitoring\LovarusMonitoring.Common.ps1"
foreach ($requiredFile in @($releaseCommon, $monitorCommon)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Regression dependency is missing: $requiredFile"
    }
}
. $releaseCommon
. $monitorCommon

function Assert-Equal {
    param(
        [Parameter(Mandatory)]$Actual,
        [Parameter(Mandatory)]$Expected,
        [Parameter(Mandatory)][string]$Message
    )
    if ($Actual -ne $Expected) {
        throw "$Message Expected '$Expected', got '$Actual'."
    }
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) "lovarus-ops-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $previous = Join-Path $testRoot "previous"
    $next = Join-Path $testRoot "next"
    $current = Join-Path $testRoot "current"
    New-Item -ItemType Directory -Path $previous, $next | Out-Null
    New-Item -ItemType Junction -Path $current -Target $previous | Out-Null

    $failedAsExpected = $false
    try {
        Set-LovarusReleaseJunctionTransactional `
            -CurrentJunction $current `
            -NewTarget $next `
            -BeforeCreate { throw "simulated junction creation failure" }
    }
    catch {
        if ($_.Exception.Message -notlike "*simulated junction creation failure*") {
            throw
        }
        $failedAsExpected = $true
    }
    Assert-Equal $failedAsExpected $true "Injected junction failure was not observed."
    $restored = Get-LovarusJunctionTarget -Path $current
    Assert-Equal $restored ([System.IO.Path]::GetFullPath($previous)) `
        "Previous junction was not restored after pre-switch failure."

    $ordinaryPath = Join-Path $testRoot "ordinary"
    New-Item -ItemType Directory -Path $ordinaryPath | Out-Null
    try {
        Get-LovarusJunctionTarget -Path $ordinaryPath | Out-Null
        throw "Ordinary directory was incorrectly accepted as a junction."
    }
    catch {
        if ($_.Exception.Message -like "*incorrectly accepted*") {
            throw
        }
    }

    $statePath = Join-Path $testRoot "monitor-state.json"
    $first = Update-LovarusMonitoringState `
        -StatePath $statePath `
        -FailureMessages @("first failure") `
        -AlertAfterConsecutiveFailures 2
    Assert-Equal $first.ConsecutiveFailures 1 "First monitoring failure count is wrong."
    Assert-Equal $first.ShouldAlert $false "First monitoring failure alerted too early."

    $second = Update-LovarusMonitoringState `
        -StatePath $statePath `
        -FailureMessages @("second failure") `
        -AlertAfterConsecutiveFailures 2
    Assert-Equal $second.ConsecutiveFailures 2 "Second monitoring failure count is wrong."
    Assert-Equal $second.ShouldAlert $true "Second monitoring failure did not alert."

    $recovered = Update-LovarusMonitoringState `
        -StatePath $statePath `
        -FailureMessages @() `
        -AlertAfterConsecutiveFailures 2
    Assert-Equal $recovered.ConsecutiveFailures 0 "Monitoring recovery did not reset state."
    Assert-Equal $recovered.ShouldAlert $false "Monitoring recovery remained alerting."
}
finally {
    if (Test-Path -LiteralPath $testRoot) {
        & cmd.exe /d /c "rmdir /s /q `"$testRoot`""
    }
}

Write-Host "Operations regression checks passed."
