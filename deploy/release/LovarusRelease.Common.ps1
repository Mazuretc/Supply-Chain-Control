Set-StrictMode -Version 2.0

function Get-LovarusJunctionTarget {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    $item = Get-Item -LiteralPath $resolvedPath -Force -ErrorAction Stop
    if ($item.LinkType -ne "Junction") {
        throw "Path is not a real junction: $resolvedPath"
    }
    $targets = @($item.Target)
    if ($targets.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$targets[0])) {
        throw "Junction has an invalid target: $resolvedPath"
    }
    return [System.IO.Path]::GetFullPath([string]$targets[0])
}

function Remove-LovarusJunction {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    Get-LovarusJunctionTarget -Path $resolvedPath | Out-Null
    & cmd.exe /d /c "rmdir `"$resolvedPath`""
    if ($LASTEXITCODE -ne 0 -or (Test-Path -LiteralPath $resolvedPath)) {
        throw "Failed to remove junction: $resolvedPath"
    }
}

function Set-LovarusReleaseJunctionTransactional {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$CurrentJunction,
        [Parameter(Mandatory)]
        [string]$NewTarget,
        [scriptblock]$BeforeCreate
    )

    $CurrentJunction = [System.IO.Path]::GetFullPath($CurrentJunction)
    $NewTarget = [System.IO.Path]::GetFullPath($NewTarget)
    if (-not (Test-Path -LiteralPath $NewTarget -PathType Container)) {
        throw "New release target does not exist: $NewTarget"
    }
    $previousTarget = Get-LovarusJunctionTarget -Path $CurrentJunction
    if ($previousTarget -eq $NewTarget) {
        throw "Current junction already targets the requested release."
    }

    $previousRemoved = $false
    try {
        Remove-LovarusJunction -Path $CurrentJunction
        $previousRemoved = $true
        if ($BeforeCreate) {
            & $BeforeCreate
        }
        New-Item -ItemType Junction -Path $CurrentJunction -Target $NewTarget | Out-Null
        $actualTarget = Get-LovarusJunctionTarget -Path $CurrentJunction
        if ($actualTarget -ne $NewTarget) {
            throw "Junction verification failed: expected $NewTarget, got $actualTarget"
        }
    }
    catch {
        $switchError = $_
        if ($previousRemoved) {
            $blockingItem = Get-Item -LiteralPath $CurrentJunction -Force -ErrorAction SilentlyContinue
            if ($blockingItem) {
                if ($blockingItem.LinkType -ne "Junction") {
                    throw "Junction switch failed and rollback is blocked by a non-junction path: $CurrentJunction"
                }
                Remove-LovarusJunction -Path $CurrentJunction
            }
            New-Item -ItemType Junction -Path $CurrentJunction -Target $previousTarget | Out-Null
            $restoredTarget = Get-LovarusJunctionTarget -Path $CurrentJunction
            if ($restoredTarget -ne $previousTarget) {
                throw "Junction switch failed and previous target verification also failed."
            }
        }
        throw $switchError
    }

    return [pscustomobject]@{
        PreviousTarget = $previousTarget
        CurrentTarget = $NewTarget
    }
}
