#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [Uri]$PublicSiteUrl,
    [Parameter(Mandatory)]
    [string]$BackupDirectory,
    [Parameter(Mandatory)]
    [string]$OffHostBackupDirectory,
    [string]$ApiServiceName = "LovarusApi",
    [string]$WorkerServiceName = "LovarusWorker",
    [string]$ApiHostName = "127.0.0.1",
    [int]$ApiPort = 3000,
    [string]$DatabaseName = "lovarus",
    [string]$DatabaseHostName = "127.0.0.1",
    [int]$DatabasePort = 5432,
    [string]$DatabaseUser = "lovarus_app",
    [string]$PgBin = "",
    [string]$PgPassFile = "",
    [string]$StatePath = "C:\ProgramData\Lovarus\monitoring\state.json",
    [string]$RestoreSuccessMarkerPath = "C:\ProgramData\Lovarus\restore\last-success.json",
    [string]$ServiceLogRoot = "C:\Lovarus\service\logs",
    [string]$ReadinessPath = "/api/health/ready",
    [string]$WorkerHealthPath = "/api/health/worker",
    [string]$RepresentativeReadPath = "/api/orders?limit=1",
    [ValidateRange(1, 30)]
    [int]$MaximumHttpSeconds = 2,
    [ValidateRange(1, 10)]
    [int]$AlertAfterConsecutiveFailures = 2,
    [ValidateRange(1, 168)]
    [int]$MaximumBackupAgeHours = 26,
    [ValidateRange(1, 30)]
    [int]$MaximumRestoreTestAgeDays = 8,
    [ValidateRange(1, 1024)]
    [int]$MinimumFreeSpaceGb = 20,
    [ValidateRange(1, 99)]
    [int]$MinimumFreeSpacePercent = 20,
    [ValidateRange(1, 10080)]
    [int]$WorkerMaximumSilenceMinutes = 30,
    [ValidateRange(1, 1440)]
    [int]$StaleRunningJobMinutes = 30,
    [ValidateRange(1, 168)]
    [int]$RecentFailedJobHours = 24,
    [ValidateRange(1, 60)]
    [int]$RestartLoopWindowMinutes = 15,
    [ValidateRange(2, 20)]
    [int]$RestartLoopEventCount = 3,
    [ValidateRange(1, 1440)]
    [int]$LogErrorLookbackMinutes = 15,
    [switch]$RequireWorkerProgress
)

$ErrorActionPreference = "Stop"
$failures = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$monitorCommon = Join-Path $PSScriptRoot "LovarusMonitoring.Common.ps1"
if (-not (Test-Path -LiteralPath $monitorCommon -PathType Leaf)) {
    throw "Monitoring helper is missing: $monitorCommon"
}
. $monitorCommon

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

function Read-Checksum {
    param(
        [Parameter(Mandatory)][string]$ArchivePath,
        [Parameter(Mandatory)][string]$SidecarPath
    )
    if (-not (Test-Path -LiteralPath $SidecarPath -PathType Leaf)) {
        throw "Checksum sidecar is missing: $SidecarPath"
    }
    $line = (Get-Content -LiteralPath $SidecarPath -Raw).Trim()
    if ($line -notmatch '^(?<Hash>[A-Fa-f0-9]{64})\s{2}\*?(?<FileName>[^\\/:*?"<>|]+)$') {
        throw "Checksum sidecar is malformed: $SidecarPath"
    }
    if ($Matches.FileName -cne [System.IO.Path]::GetFileName($ArchivePath)) {
        throw "Checksum sidecar names a different archive: $($Matches.FileName)"
    }
    return $Matches.Hash.ToLowerInvariant()
}

function Invoke-LovarusHttpJson {
    param(
        [Parameter(Mandatory)][string]$Path
    )
    if (-not $Path.StartsWith("/")) {
        throw "HTTP probe path must start with '/': $Path"
    }
    $uri = [Uri]::new($PublicSiteUrl, $Path.TrimStart("/"))
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest `
            -Method Get `
            -Uri $uri `
            -UseBasicParsing `
            -TimeoutSec $MaximumHttpSeconds
    }
    finally {
        $timer.Stop()
    }
    if ($response.StatusCode -ne 200) {
        throw "HTTP probe returned $($response.StatusCode): $uri"
    }
    if ($timer.Elapsed.TotalSeconds -gt $MaximumHttpSeconds) {
        throw "HTTP probe took $([Math]::Round($timer.Elapsed.TotalSeconds, 2)) seconds: $uri"
    }
    try {
        return $response.Content | ConvertFrom-Json
    }
    catch {
        throw "HTTP probe returned invalid JSON: $uri"
    }
}

foreach ($serviceName in @($ApiServiceName, $WorkerServiceName)) {
    try {
        $service = Get-Service -Name $serviceName -ErrorAction Stop
        if ($service.Status -ne "Running") {
            $failures.Add("Service $serviceName is $($service.Status).")
        }
    }
    catch {
        $failures.Add("Service $serviceName was not found.")
    }
}

try {
    $restartEvents = @(
        Get-WinEvent -FilterHashtable @{
            LogName = "System"
            Id = 7031, 7034
            StartTime = (Get-Date).AddMinutes(-$RestartLoopWindowMinutes)
        } -ErrorAction SilentlyContinue |
            Where-Object Message -Match "($([regex]::Escape($ApiServiceName))|$([regex]::Escape($WorkerServiceName)))"
    )
    if ($restartEvents.Count -ge $RestartLoopEventCount) {
        $failures.Add(
            "$($restartEvents.Count) service termination events occurred in " +
            "$RestartLoopWindowMinutes minutes."
        )
    }
}
catch {
    $failures.Add("Windows service restart-loop check failed: $($_.Exception.Message)")
}

try {
    if ($PublicSiteUrl.Scheme -ne "https") {
        throw "PublicSiteUrl must use HTTPS."
    }
    if ($PublicSiteUrl.AbsolutePath -ne "/") {
        throw "PublicSiteUrl must point to the site root and end with '/'."
    }
    $ready = Invoke-LovarusHttpJson -Path $ReadinessPath
    if ($ready.status -ne "ready" -or $ready.checks.database -ne "up") {
        throw "Readiness contract requires status=ready and checks.database=up."
    }
    $workerHealth = Invoke-LovarusHttpJson -Path $WorkerHealthPath
    if ($workerHealth.status -ne "ok" -or -not $workerHealth.lastPollAt) {
        throw "Worker contract requires status=ok and lastPollAt."
    }
    $workerPollAge = [DateTime]::UtcNow - [DateTime]::Parse(
        [string]$workerHealth.lastPollAt
    ).ToUniversalTime()
    if ($workerPollAge.TotalMinutes -gt $WorkerMaximumSilenceMinutes) {
        $failures.Add(
            "Worker endpoint lastPollAt is $([Math]::Round($workerPollAge.TotalMinutes, 1)) minutes old."
        )
    }
    $representative = Invoke-LovarusHttpJson -Path $RepresentativeReadPath
    $items = @($representative.items)
    if ($items.Count -lt 1 -or
        [string]::IsNullOrWhiteSpace([string]$items[0].id) -or
        [string]::IsNullOrWhiteSpace([string]$items[0].supplierOrderNumber)) {
        throw "Representative read requires items[0].id and supplierOrderNumber."
    }
}
catch {
    $failures.Add("Application HTTP readiness check failed: $($_.Exception.Message)")
}

try {
    $logCutoff = [DateTime]::UtcNow.AddMinutes(-$LogErrorLookbackMinutes)
    $recentLogFiles = @(
        Get-ChildItem -LiteralPath $ServiceLogRoot -File -Recurse -ErrorAction Stop |
            Where-Object LastWriteTimeUtc -ge $logCutoff
    )
    foreach ($logFile in $recentLogFiles) {
        $matches = Get-Content -LiteralPath $logFile.FullName -Tail 200 |
            Select-String -Pattern '(?i)(fatal|unhandled|EADDRINUSE|out of memory|panic)'
        if ($matches) {
            $failures.Add("Critical pattern found in recent service log: $($logFile.FullName)")
        }
    }
}
catch {
    $failures.Add("Service log check failed: $($_.Exception.Message)")
}

try {
    $BackupDirectory = [System.IO.Path]::GetFullPath($BackupDirectory)
    $latestBackup = Get-ChildItem -LiteralPath $BackupDirectory -Filter "*.dump" -File |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $latestBackup) {
        throw "No database dump exists in $BackupDirectory."
    }

    $backupAge = [DateTime]::UtcNow - $latestBackup.LastWriteTimeUtc
    if ($backupAge.TotalHours -gt $MaximumBackupAgeHours) {
        $failures.Add(
            "Latest backup is $([Math]::Round($backupAge.TotalHours, 1)) hours old; limit is $MaximumBackupAgeHours."
        )
    }
    $localChecksum = Read-Checksum $latestBackup.FullName "$($latestBackup.FullName).sha256"

    $offHostBackup = Join-Path $OffHostBackupDirectory $latestBackup.Name
    $offHostSidecar = "$offHostBackup.sha256"
    if (-not (Test-Path -LiteralPath $offHostBackup -PathType Leaf)) {
        $failures.Add("Latest backup has no off-host archive copy: $offHostBackup")
    } else {
        $offHostChecksum = Read-Checksum $offHostBackup $offHostSidecar
        $offHostLength = (Get-Item -LiteralPath $offHostBackup).Length
        if ($offHostChecksum -cne $localChecksum -or $offHostLength -ne $latestBackup.Length) {
            $failures.Add("Off-host backup metadata does not match the latest local archive.")
        }
    }

    $driveRoot = [System.IO.Path]::GetPathRoot($BackupDirectory)
    if ($driveRoot -notmatch '^[A-Za-z]:\\$') {
        throw "BackupDirectory must be on a local Windows volume for disk checks."
    }
    $deviceId = $driveRoot.Substring(0, 2)
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$deviceId'"
    if (-not $disk -or $disk.Size -le 0) {
        throw "Could not read free space for $deviceId."
    }
    $freeGb = $disk.FreeSpace / 1GB
    $freePercent = 100 * $disk.FreeSpace / $disk.Size
    if ($freeGb -lt $MinimumFreeSpaceGb -or $freePercent -lt $MinimumFreeSpacePercent) {
        $failures.Add(
            "Backup volume $deviceId has $([Math]::Round($freeGb, 1)) GB " +
            "($([Math]::Round($freePercent, 1))%) free."
        )
    }
}
catch {
    $failures.Add("Backup/off-host/disk check failed: $($_.Exception.Message)")
}

$previousPgPassFile = $env:PGPASSFILE
try {
    if ($PgPassFile) {
        $resolvedPgPassFile = [System.IO.Path]::GetFullPath($PgPassFile)
        if (-not (Test-Path -LiteralPath $resolvedPgPassFile -PathType Leaf)) {
            throw "PGPASSFILE does not exist: $resolvedPgPassFile"
        }
        $env:PGPASSFILE = $resolvedPgPassFile
    }
    $psql = Resolve-PgTool "psql"
    $progressSql = @"
\set ON_ERROR_STOP on
SELECT COALESCE(
    floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - max(activity_at))) / 60),
    -1
)::bigint
FROM (
    SELECT "ingestedAt" AS activity_at FROM "MailMessage"
    UNION ALL
    SELECT "updatedAt" FROM "Job"
    WHERE type ~* '(mail|imap|ingest)'
) AS worker_activity;
"@
    $progressOutput = $progressSql | & $psql `
        "--no-psqlrc" "--set=ON_ERROR_STOP=1" "--tuples-only" "--no-align" "--quiet" `
        "--host=$DatabaseHostName" "--port=$DatabasePort" "--username=$DatabaseUser" `
        "--dbname=$DatabaseName" "--no-password"
    if ($LASTEXITCODE -ne 0) {
        throw "psql worker-progress query failed (exit $LASTEXITCODE)."
    }
    $progressLine = [string]($progressOutput | Select-Object -Last 1)
    if ($progressLine.Trim() -notmatch '^-?\d+$') {
        throw "Worker-progress query returned an invalid value: $progressLine"
    }
    $minutesSinceProgress = [long]::Parse($progressLine.Trim())
    if ($minutesSinceProgress -lt 0) {
        $message = "No mail ingestion or worker job activity exists yet."
        if ($RequireWorkerProgress) {
            $failures.Add($message)
        } else {
            $warnings.Add($message)
        }
    } elseif ($minutesSinceProgress -gt $WorkerMaximumSilenceMinutes) {
        $failures.Add(
            "Worker activity is $minutesSinceProgress minutes old; limit is $WorkerMaximumSilenceMinutes."
        )
    }
}
catch {
    $failures.Add("Database/worker-progress check failed: $($_.Exception.Message)")
}
finally {
    $env:PGPASSFILE = $previousPgPassFile
}

foreach ($warning in $warnings) {
    Write-Warning $warning
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ -ErrorAction Continue }
    throw "Lovarus health check failed with $($failures.Count) problem(s)."
}

Write-Host "Lovarus services, API port, IIS, backups, disk, database, and worker progress passed."
