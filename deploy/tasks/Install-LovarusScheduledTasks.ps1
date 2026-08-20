#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$RepositoryRoot,
    [Parameter(Mandatory)]
    [string]$TaskUser,
    [PSCredential]$TaskCredential,
    [Parameter(Mandatory)]
    [string]$BackupDirectory,
    [Parameter(Mandatory)]
    [string]$OffHostBackupDirectory,
    [Parameter(Mandatory)]
    [string]$PgBin,
    [Parameter(Mandatory)]
    [string]$PgPassFile,
    [Parameter(Mandatory)]
    [Uri]$PublicSiteUrl,
    [string]$DatabaseName = "lovarus",
    [string]$DatabaseUser = "lovarus_app",
    [string]$DatabaseHostName = "127.0.0.1",
    [int]$DatabasePort = 5432,
    [datetime]$DailyBackupAt = ([DateTime]::Today.AddHours(2)),
    [ValidateRange(1, 60)]
    [int]$MonitoringIntervalMinutes = 5,
    [ValidateRange(2, 3650)]
    [int]$RetentionDays = 30,
    [ValidateRange(1, 168)]
    [int]$MaximumBackupAgeHours = 26,
    [ValidateRange(1, 1024)]
    [int]$MinimumFreeSpaceGb = 20,
    [ValidateRange(1, 99)]
    [int]$MinimumFreeSpacePercent = 20,
    [ValidateRange(1, 10080)]
    [int]$WorkerMaximumSilenceMinutes = 30,
    [switch]$RequireWorkerProgress
)

$ErrorActionPreference = "Stop"
$RepositoryRoot = [System.IO.Path]::GetFullPath($RepositoryRoot)
$BackupDirectory = [System.IO.Path]::GetFullPath($BackupDirectory)
$OffHostBackupDirectory = [System.IO.Path]::GetFullPath($OffHostBackupDirectory)
$PgBin = [System.IO.Path]::GetFullPath($PgBin)
$PgPassFile = [System.IO.Path]::GetFullPath($PgPassFile)
if ($TaskCredential -and $TaskCredential.UserName -cne $TaskUser) {
    throw "TaskCredential username must exactly match TaskUser."
}
if ($PublicSiteUrl.Scheme -ne "https") {
    throw "PublicSiteUrl must use HTTPS."
}

$backupScript = Join-Path $RepositoryRoot "deploy\postgresql\Backup-LovarusDatabase.ps1"
$monitorScript = Join-Path $RepositoryRoot "deploy\monitoring\Test-LovarusHealth.ps1"
$aclScript = Join-Path $RepositoryRoot "deploy\postgresql\Protect-LovarusBackupDirectory.ps1"
foreach ($requiredFile in @($backupScript, $monitorScript, $aclScript, $PgPassFile)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required task file is missing: $requiredFile"
    }
}

function Quote-TaskArgument {
    param([Parameter(Mandatory)][string]$Value)
    if ($Value.Contains('"')) {
        throw "Scheduled task arguments cannot contain a double quote: $Value"
    }
    return "`"$Value`""
}

& $aclScript -BackupDirectory $BackupDirectory -BackupPrincipal $TaskUser

$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$backupArguments = @(
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", (Quote-TaskArgument $backupScript),
    "-BackupDirectory", (Quote-TaskArgument $BackupDirectory),
    "-OffHostBackupDirectory", (Quote-TaskArgument $OffHostBackupDirectory),
    "-PgBin", (Quote-TaskArgument $PgBin),
    "-PgPassFile", (Quote-TaskArgument $PgPassFile),
    "-DatabaseName", (Quote-TaskArgument $DatabaseName),
    "-DatabaseUser", (Quote-TaskArgument $DatabaseUser),
    "-HostName", (Quote-TaskArgument $DatabaseHostName),
    "-Port", $DatabasePort,
    "-RetentionDays", $RetentionDays
) -join " "

$monitorArguments = @(
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", (Quote-TaskArgument $monitorScript),
    "-PublicSiteUrl", (Quote-TaskArgument $PublicSiteUrl.AbsoluteUri),
    "-BackupDirectory", (Quote-TaskArgument $BackupDirectory),
    "-OffHostBackupDirectory", (Quote-TaskArgument $OffHostBackupDirectory),
    "-PgBin", (Quote-TaskArgument $PgBin),
    "-PgPassFile", (Quote-TaskArgument $PgPassFile),
    "-DatabaseName", (Quote-TaskArgument $DatabaseName),
    "-DatabaseUser", (Quote-TaskArgument $DatabaseUser),
    "-DatabaseHostName", (Quote-TaskArgument $DatabaseHostName),
    "-DatabasePort", $DatabasePort,
    "-MaximumBackupAgeHours", $MaximumBackupAgeHours,
    "-MinimumFreeSpaceGb", $MinimumFreeSpaceGb,
    "-MinimumFreeSpacePercent", $MinimumFreeSpacePercent,
    "-WorkerMaximumSilenceMinutes", $WorkerMaximumSilenceMinutes
)
if ($RequireWorkerProgress) {
    $monitorArguments += "-RequireWorkerProgress"
}
$monitorArguments = $monitorArguments -join " "

$backupAction = New-ScheduledTaskAction `
    -Execute $powerShell `
    -Argument $backupArguments `
    -WorkingDirectory $RepositoryRoot
$monitorAction = New-ScheduledTaskAction `
    -Execute $powerShell `
    -Argument $monitorArguments `
    -WorkingDirectory $RepositoryRoot
$backupTrigger = New-ScheduledTaskTrigger -Daily -At $DailyBackupAt
$monitorTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $MonitoringIntervalMinutes)
$backupSettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$monitorSettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
$logonType = if ($TaskCredential) { "Password" } else { "ServiceAccount" }
$principal = New-ScheduledTaskPrincipal `
    -UserId $TaskUser `
    -LogonType $logonType `
    -RunLevel Highest

$backupTask = New-ScheduledTask `
    -Action $backupAction `
    -Trigger $backupTrigger `
    -Settings $backupSettings `
    -Principal $principal `
    -Description "Daily Lovarus PostgreSQL custom-format backup."
$monitorTask = New-ScheduledTask `
    -Action $monitorAction `
    -Trigger $monitorTrigger `
    -Settings $monitorSettings `
    -Principal $principal `
    -Description "Lovarus services, storage, backup and worker progress checks."

$bstr = [IntPtr]::Zero
try {
    if ($TaskCredential) {
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
            $TaskCredential.Password
        )
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        Register-ScheduledTask `
            -TaskName "Lovarus-DailyBackup" `
            -InputObject $backupTask `
            -User $TaskUser `
            -Password $plainPassword `
            -Force | Out-Null
        Register-ScheduledTask `
            -TaskName "Lovarus-Monitoring" `
            -InputObject $monitorTask `
            -User $TaskUser `
            -Password $plainPassword `
            -Force | Out-Null
    } else {
        Register-ScheduledTask -TaskName "Lovarus-DailyBackup" -InputObject $backupTask -Force | Out-Null
        Register-ScheduledTask -TaskName "Lovarus-Monitoring" -InputObject $monitorTask -Force | Out-Null
    }
}
finally {
    $plainPassword = $null
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

Get-ScheduledTask -TaskName "Lovarus-DailyBackup", "Lovarus-Monitoring" |
    Select-Object TaskName, State, @{Name = "UserId"; Expression = { $_.Principal.UserId } }
