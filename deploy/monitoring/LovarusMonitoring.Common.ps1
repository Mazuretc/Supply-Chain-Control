Set-StrictMode -Version 2.0

function Update-LovarusMonitoringState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$StatePath,
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [string[]]$FailureMessages,
        [ValidateRange(1, 100)]
        [int]$AlertAfterConsecutiveFailures = 2,
        [datetime]$NowUtc = [DateTime]::UtcNow
    )

    $StatePath = [System.IO.Path]::GetFullPath($StatePath)
    $stateDirectory = Split-Path -Parent $StatePath
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $state = [pscustomobject]@{
        ConsecutiveFailures = 0
        LastRunUtc = $null
        LastSuccessUtc = $null
        LastFailures = @()
    }
    if (Test-Path -LiteralPath $StatePath -PathType Leaf) {
        try {
            $saved = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
            $state.ConsecutiveFailures = [int]$saved.ConsecutiveFailures
            $state.LastRunUtc = $saved.LastRunUtc
            $state.LastSuccessUtc = $saved.LastSuccessUtc
            $state.LastFailures = @($saved.LastFailures)
        }
        catch {
            throw "Monitoring state is corrupt and cannot be trusted: $StatePath"
        }
    }

    $hasFailures = $FailureMessages.Count -gt 0
    if ($hasFailures) {
        $state.ConsecutiveFailures++
        $state.LastFailures = @($FailureMessages)
    } else {
        $state.ConsecutiveFailures = 0
        $state.LastSuccessUtc = $NowUtc.ToString("o")
        $state.LastFailures = @()
    }
    $state.LastRunUtc = $NowUtc.ToString("o")
    $temporaryPath = "$StatePath.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        $state | ConvertTo-Json -Depth 4 |
            Set-Content -LiteralPath $temporaryPath -Encoding UTF8
        Move-Item -LiteralPath $temporaryPath -Destination $StatePath -Force
    }
    finally {
        Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
    }

    return [pscustomobject]@{
        ConsecutiveFailures = $state.ConsecutiveFailures
        ShouldAlert = $hasFailures -and (
            $state.ConsecutiveFailures -ge $AlertAfterConsecutiveFailures
        )
        LastRunUtc = $state.LastRunUtc
        LastSuccessUtc = $state.LastSuccessUtc
        Failures = @($state.LastFailures)
    }
}
