param(
  [string]$TaskName = "PaySys Auto Start",
  [string]$TaskPath = "\PaySys\",
  [int]$DelaySeconds = 30,
  [switch]$NoStartNow
)

$ErrorActionPreference = "Stop"

$AppDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$MonitorScript = Join-Path $AppDir "scripts\paysys-monitor.ps1"

if (-not (Test-Path -LiteralPath $MonitorScript)) {
  throw "Missing monitor script: $MonitorScript"
}

$userId = "$env:USERDOMAIN\$env:USERNAME"
$delay = "PT$($DelaySeconds)S"
$arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -NoNotify' -f $MonitorScript

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $arguments `
  -WorkingDirectory $AppDir

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$trigger.Delay = $delay

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal `
  -UserId $userId `
  -LogonType Interactive `
  -RunLevel Highest

$description = "Starts or recovers PaySys on Windows login by running scripts\paysys-monitor.ps1 -NoNotify."

Register-ScheduledTask `
  -TaskPath $TaskPath `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description $description `
  -Force | Out-Null

if (-not $NoStartNow) {
  Start-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName
}

Get-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName |
  Select-Object TaskPath, TaskName, State

