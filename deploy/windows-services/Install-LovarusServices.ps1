#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$InstallRoot,

    [Parameter(Mandatory)]
    [string]$WinSwPath,

    [string]$NodePath = "C:\Program Files\nodejs\node.exe",

    [string]$PostgresServiceName = "",

    [string]$ServiceRoot = ""
)

$ErrorActionPreference = "Stop"
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$ServerRoot = Join-Path $InstallRoot "server"
if ($ServiceRoot) {
    $ServiceRoot = [System.IO.Path]::GetFullPath($ServiceRoot)
} else {
    $ServiceRoot = Join-Path (Split-Path -Parent $InstallRoot) "service"
}

foreach ($requiredFile in @(
    $WinSwPath,
    $NodePath,
    (Join-Path $ServerRoot ".env"),
    (Join-Path $ServerRoot "dist\main.js"),
    (Join-Path $ServerRoot "dist\worker.js")
)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required deployment file is missing: $requiredFile"
    }
}

New-Item -ItemType Directory -Path $ServiceRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $ServiceRoot "logs") -Force | Out-Null

function ConvertTo-XmlText {
    param([Parameter(Mandatory)][string]$Value)
    return [System.Security.SecurityElement]::Escape($Value)
}

function Write-ServiceDefinition {
    param(
        [Parameter(Mandatory)][string]$ServiceId,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][string]$EntryPoint
    )

    $wrapperPath = Join-Path $ServiceRoot "$ServiceId.exe"
    $xmlPath = Join-Path $ServiceRoot "$ServiceId.xml"
    $logPath = Join-Path $ServiceRoot "logs\$ServiceId"
    New-Item -ItemType Directory -Path $logPath -Force | Out-Null
    Copy-Item -LiteralPath $WinSwPath -Destination $wrapperPath -Force

    $dependency = if ($PostgresServiceName) {
        "  <depend>$(ConvertTo-XmlText $PostgresServiceName)</depend>`r`n"
    } else {
        ""
    }
    $xml = @"
<service>
  <id>$(ConvertTo-XmlText $ServiceId)</id>
  <name>$(ConvertTo-XmlText $DisplayName)</name>
  <description>Lovarus internal backend service.</description>
  <executable>$(ConvertTo-XmlText $NodePath)</executable>
  <arguments>$(ConvertTo-XmlText $EntryPoint)</arguments>
  <workingdirectory>$(ConvertTo-XmlText $ServerRoot)</workingdirectory>
  <env name="NODE_ENV" value="production" />
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
$dependency  <stoptimeout>30 sec</stoptimeout>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <onfailure action="restart" delay="60 sec" />
  <resetfailure>1 hour</resetfailure>
  <logpath>$(ConvertTo-XmlText $logPath)</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>10</keepFiles>
  </log>
</service>
"@
    [System.IO.File]::WriteAllText(
        $xmlPath,
        $xml,
        [System.Text.UTF8Encoding]::new($false)
    )
}

Write-ServiceDefinition -ServiceId "LovarusApi" -DisplayName "Lovarus API" -EntryPoint "dist/main.js"
Write-ServiceDefinition -ServiceId "LovarusWorker" -DisplayName "Lovarus Mail Worker" -EntryPoint "dist/worker.js"

foreach ($serviceId in @("LovarusApi", "LovarusWorker")) {
    $wrapperPath = Join-Path $ServiceRoot "$serviceId.exe"
    & $wrapperPath install
    if ($LASTEXITCODE -ne 0) {
        throw "WinSW failed to install $serviceId (exit $LASTEXITCODE)."
    }

    $virtualAccount = "NT SERVICE\$serviceId"
    & sc.exe config $serviceId obj= $virtualAccount
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to configure the virtual service account for $serviceId."
    }

    & icacls.exe $ServerRoot /grant "${virtualAccount}:(OI)(CI)RX" /T /C | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to grant read access to $virtualAccount."
    }
    & icacls.exe (Join-Path $ServiceRoot "logs\$serviceId") /grant "${virtualAccount}:(OI)(CI)M" /T /C | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to grant log access to $virtualAccount."
    }
}

foreach ($serviceId in @("LovarusApi", "LovarusWorker")) {
    $wrapperPath = Join-Path $ServiceRoot "$serviceId.exe"
    & $wrapperPath start
    if ($LASTEXITCODE -ne 0) {
        throw "WinSW failed to start $serviceId (exit $LASTEXITCODE)."
    }
}

Get-Service -Name "LovarusApi", "LovarusWorker"
