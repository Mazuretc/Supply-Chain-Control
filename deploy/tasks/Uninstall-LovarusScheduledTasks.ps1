#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = "Stop"
foreach ($taskName in @("Lovarus-Monitoring", "Lovarus-DailyBackup")) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Warning "Scheduled task not found: $taskName"
        continue
    }
    if ($PSCmdlet.ShouldProcess($taskName, "Unregister scheduled task")) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
}

Write-Host "Lovarus scheduled tasks removed; backups and configuration were retained."
