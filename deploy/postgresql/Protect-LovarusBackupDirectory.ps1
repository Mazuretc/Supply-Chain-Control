#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BackupDirectory,

    [Parameter(Mandatory)]
    [string]$BackupPrincipal
)

$ErrorActionPreference = "Stop"
$BackupDirectory = [System.IO.Path]::GetFullPath($BackupDirectory)
New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null

$systemSid = [System.Security.Principal.SecurityIdentifier]::new("S-1-5-18")
$administratorsSid = [System.Security.Principal.SecurityIdentifier]::new("S-1-5-32-544")
$principalSid = ([System.Security.Principal.NTAccount]::new($BackupPrincipal)).Translate(
    [System.Security.Principal.SecurityIdentifier]
)

$inheritance = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
$propagation = [System.Security.AccessControl.PropagationFlags]::None
$allow = [System.Security.AccessControl.AccessControlType]::Allow
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($administratorsSid)

foreach ($rule in @(
    [System.Security.AccessControl.FileSystemAccessRule]::new(
        $systemSid,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        $inheritance,
        $propagation,
        $allow
    ),
    [System.Security.AccessControl.FileSystemAccessRule]::new(
        $administratorsSid,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        $inheritance,
        $propagation,
        $allow
    ),
    [System.Security.AccessControl.FileSystemAccessRule]::new(
        $principalSid,
        [System.Security.AccessControl.FileSystemRights]::Modify,
        $inheritance,
        $propagation,
        $allow
    )
)) {
    [void]$acl.AddAccessRule($rule)
}

Set-Acl -LiteralPath $BackupDirectory -AclObject $acl
$verifiedAcl = Get-Acl -LiteralPath $BackupDirectory
if (-not $verifiedAcl.AreAccessRulesProtected) {
    throw "Backup directory still inherits permissions: $BackupDirectory"
}

Write-Host "Backup ACL hardened for SYSTEM, Administrators and $BackupPrincipal."
