param(
  [switch]$NoNotify,
  [switch]$ForceNotify
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$AppDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$Port = 3000
$LocalPortalUrl = "http://127.0.0.1:$Port/portal"
$LogDir = Join-Path $AppDir "logs"
$ToolsDir = Join-Path $AppDir "tools"
$TunnelExe = Join-Path $ToolsDir "cloudflared.exe"
$CloudflaredConfigPath = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
$StatePath = Join-Path $LogDir "monitor-state.json"
$MonitorLogPath = Join-Path $LogDir "monitor.log"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Read-KeyValueFile {
  param([string]$Path)

  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $index = $trimmed.IndexOf("=")
    if ($index -le 0) {
      continue
    }

    $key = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }

  return $values
}

function Normalize-BarkBaseUrl {
  param([string]$Value)

  if (-not $Value) {
    return $null
  }

  $candidate = $Value.Trim().TrimEnd("/")
  try {
    $uri = [Uri]$candidate
    $segments = $uri.AbsolutePath.Trim("/").Split("/", [System.StringSplitOptions]::RemoveEmptyEntries)
    if ($segments.Count -ge 1) {
      return "$($uri.Scheme)://$($uri.Host)/$($segments[0])"
    }
  } catch {
    return $candidate
  }

  return $candidate
}

function Normalize-PublicBaseUrl {
  param([string]$Value)

  if (-not $Value) {
    return $null
  }

  $candidate = $Value.Trim().TrimEnd("/")
  if (-not $candidate) {
    return $null
  }

  return $candidate
}

function Send-Bark {
  param(
    [string]$Title,
    [string]$Body
  )

  if ($NoNotify -or -not $script:BarkBaseUrl) {
    return
  }

  $encodedTitle = [Uri]::EscapeDataString($Title)
  $encodedBody = [Uri]::EscapeDataString($Body)
  $url = "{0}/{1}/{2}?group=PaySys&isArchive=1" -f $script:BarkBaseUrl, $encodedTitle, $encodedBody

  try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20 | Out-Null
  } catch {
    Add-Content -LiteralPath $MonitorLogPath -Value "$(Get-Date -Format o) bark_send_failed=$($_.Exception.Message)"
  }
}

function Invoke-UrlCheck {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 25 -MaximumRedirection 3
    return [pscustomobject]@{
      Ok = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
      Detail = "HTTP $($response.StatusCode)"
    }
  } catch {
    return [pscustomobject]@{
      Ok = $false
      Detail = $_.Exception.Message
    }
  }
}

function Get-PaySysListener {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -ne 0 } |
    Select-Object -First 1
}

function Stop-PaySysListener {
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -ne 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($listenerPid in $listeners) {
    try {
      Stop-Process -Id $listenerPid -Force -ErrorAction Stop
    } catch {
      Add-Content -LiteralPath $MonitorLogPath -Value "$(Get-Date -Format o) paysys_stop_failed pid=$listenerPid error=$($_.Exception.Message)"
    }
  }
}

function Start-PaySys {
  $outLog = Join-Path $LogDir "paysys-start.out.log"
  $errLog = Join-Path $LogDir "paysys-start.err.log"

  Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run start -- -H 0.0.0.0 -p $Port" `
    -WorkingDirectory $AppDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden | Out-Null
}

function Get-CloudflaredProcess {
  Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue |
    Where-Object { -not $_.Path -or $_.Path -eq $TunnelExe } |
    Select-Object -First 1
}

function Stop-Cloudflared {
  Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue |
    Where-Object { -not $_.Path -or $_.Path -eq $TunnelExe } |
    ForEach-Object {
      try {
        Stop-Process -Id $_.Id -Force -ErrorAction Stop
      } catch {
        Add-Content -LiteralPath $MonitorLogPath -Value "$(Get-Date -Format o) cloudflared_stop_failed pid=$($_.Id) error=$($_.Exception.Message)"
      }
    }
}

function Start-Cloudflared {
  if (-not (Test-Path -LiteralPath $TunnelExe)) {
    return $false
  }

  $outLog = Join-Path $LogDir "cloudflared.out.log"
  $errLog = Join-Path $LogDir "cloudflared.err.log"

  Start-Process `
    -FilePath $TunnelExe `
    -ArgumentList "tunnel", "--url", "http://localhost:$Port", "--no-autoupdate" `
    -WorkingDirectory $AppDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden | Out-Null

  return $true
}

function Start-NamedCloudflared {
  if (-not (Test-Path -LiteralPath $TunnelExe)) {
    return $false
  }

  $outLog = Join-Path $LogDir "cloudflared.out.log"
  $errLog = Join-Path $LogDir "cloudflared.err.log"
  $arguments = @("--config", $CloudflaredConfigPath, "tunnel", "run")
  if ($script:CloudflaredTunnelName) {
    $arguments += $script:CloudflaredTunnelName
  }

  Start-Process `
    -FilePath $TunnelExe `
    -ArgumentList $arguments `
    -WorkingDirectory $AppDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden | Out-Null

  return $true
}

function Get-CloudflaredService {
  if ($script:CloudflaredServiceName) {
    $service = Get-Service -Name $script:CloudflaredServiceName -ErrorAction SilentlyContinue
    if ($service) {
      return $service
    }
  }

  Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*cloudflared*" -or $_.DisplayName -like "*cloudflared*" } |
    Select-Object -First 1
}

function Start-CloudflaredService {
  $service = Get-CloudflaredService
  if (-not $service) {
    return $false
  }

  if ($service.Status -ne "Running") {
    Start-Service -Name $service.Name -ErrorAction Stop
  }

  return $true
}

function Restart-CloudflaredService {
  $service = Get-CloudflaredService
  if (-not $service) {
    return $false
  }

  Restart-Service -Name $service.Name -Force -ErrorAction Stop
  return $true
}

function Get-TunnelUrl {
  $matches = @()
  foreach ($file in @((Join-Path $LogDir "cloudflared.err.log"), (Join-Path $LogDir "cloudflared.out.log"))) {
    if (-not (Test-Path -LiteralPath $file)) {
      continue
    }

    $text = Get-Content -LiteralPath $file -Raw
    if (-not $text) {
      continue
    }
    foreach ($match in [regex]::Matches($text, "https://[a-z0-9-]+\.trycloudflare\.com")) {
      $matches += $match.Value
    }
  }

  if ($matches.Count -eq 0) {
    return $null
  }

  return $matches[$matches.Count - 1]
}

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath)) {
    return [pscustomobject]@{}
  }

  try {
    return Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
  } catch {
    return [pscustomobject]@{}
  }
}

function Save-State {
  param([object]$State)

  $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

$monitorConfig = Read-KeyValueFile (Join-Path $AppDir ".monitor.env")
$script:BarkBaseUrl = Normalize-BarkBaseUrl $monitorConfig["BARK_BASE_URL"]
$script:PublicBaseUrl = Normalize-PublicBaseUrl $monitorConfig["PUBLIC_BASE_URL"]
$script:CloudflaredServiceName = $monitorConfig["CLOUDFLARED_SERVICE_NAME"]
$script:CloudflaredTunnelName = if ($monitorConfig["CLOUDFLARED_TUNNEL_NAME"]) { $monitorConfig["CLOUDFLARED_TUNNEL_NAME"] } else { "paysys" }

$state = Read-State
$actions = New-Object System.Collections.Generic.List[string]

$localCheck = Invoke-UrlCheck $LocalPortalUrl
if (-not $localCheck.Ok) {
  Stop-PaySysListener
  Start-Sleep -Seconds 2
  Start-PaySys
  $actions.Add("PaySys restarted") | Out-Null
  Start-Sleep -Seconds 8
  $localCheck = Invoke-UrlCheck $LocalPortalUrl
}

$tunnelUrl = $null
$tunnelProcessOk = $false

if ($script:PublicBaseUrl) {
  $tunnelUrl = $script:PublicBaseUrl
  $cloudflaredService = Get-CloudflaredService

  if ($cloudflaredService -and $cloudflaredService.Status -ne "Running") {
    try {
      Start-CloudflaredService | Out-Null
      $actions.Add("Cloudflare tunnel service started") | Out-Null
      Start-Sleep -Seconds 8
    } catch {
      Add-Content -LiteralPath $MonitorLogPath -Value "$(Get-Date -Format o) cloudflared_service_start_failed error=$($_.Exception.Message)"
    }
  } elseif (-not $cloudflaredService -and -not (Get-CloudflaredProcess)) {
    Start-NamedCloudflared | Out-Null
    $actions.Add("Cloudflare named tunnel started") | Out-Null
    Start-Sleep -Seconds 12
  }

  $externalCheck = Invoke-UrlCheck "$tunnelUrl/portal"

  if ($localCheck.Ok -and -not $externalCheck.Ok) {
    $cloudflaredService = Get-CloudflaredService
    if ($cloudflaredService) {
      try {
        Restart-CloudflaredService | Out-Null
        $actions.Add("Cloudflare tunnel service restarted") | Out-Null
      } catch {
        Add-Content -LiteralPath $MonitorLogPath -Value "$(Get-Date -Format o) cloudflared_service_restart_failed error=$($_.Exception.Message)"
      }
    } else {
      Stop-Cloudflared
      Start-Sleep -Seconds 2
      Start-NamedCloudflared | Out-Null
      $actions.Add("Cloudflare named tunnel restarted") | Out-Null
    }

    Start-Sleep -Seconds 18
    $externalCheck = Invoke-UrlCheck "$tunnelUrl/portal"
  }

  $cloudflaredService = Get-CloudflaredService
  $tunnelProcess = Get-CloudflaredProcess
  $tunnelProcessOk = (($cloudflaredService -and $cloudflaredService.Status -eq "Running") -or [bool]$tunnelProcess)
} else {
  $tunnelProcess = Get-CloudflaredProcess
  if (-not $tunnelProcess) {
    Start-Cloudflared | Out-Null
    $actions.Add("Cloudflare tunnel started") | Out-Null
    Start-Sleep -Seconds 15
  }

  $tunnelUrl = Get-TunnelUrl
  $externalCheck = if ($tunnelUrl) {
    Invoke-UrlCheck "$tunnelUrl/portal"
  } else {
    [pscustomobject]@{ Ok = $false; Detail = "No tunnel URL found" }
  }

  if ($localCheck.Ok -and -not $externalCheck.Ok) {
    Stop-Cloudflared
    Start-Sleep -Seconds 2
    Start-Cloudflared | Out-Null
    $actions.Add("Cloudflare tunnel restarted") | Out-Null
    Start-Sleep -Seconds 18
    $tunnelUrl = Get-TunnelUrl
    $externalCheck = if ($tunnelUrl) {
      Invoke-UrlCheck "$tunnelUrl/portal"
    } else {
      [pscustomobject]@{ Ok = $false; Detail = "No tunnel URL found after restart" }
    }
  }

  $tunnelProcess = Get-CloudflaredProcess
  $tunnelProcessOk = [bool]$tunnelProcess
}

$healthy = $localCheck.Ok -and $tunnelProcessOk -and $externalCheck.Ok
$portalUrl = if ($tunnelUrl) { "$tunnelUrl/portal" } else { "(none)" }
$adminUrl = if ($tunnelUrl) { "$tunnelUrl/admin" } else { "(none)" }

$bodyLines = @(
  "Local: $(if ($localCheck.Ok) { 'OK' } else { 'FAIL' }) - $($localCheck.Detail)",
  "Tunnel process: $(if ($tunnelProcessOk) { 'OK' } else { 'FAIL' })",
  "Public: $(if ($externalCheck.Ok) { 'OK' } else { 'FAIL' }) - $($externalCheck.Detail)",
  "Portal: $portalUrl",
  "Admin: $adminUrl",
  "Actions: $(if ($actions.Count -gt 0) { $actions -join ', ' } else { 'none' })",
  "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)
$body = $bodyLines -join "`n"

$nowUtc = (Get-Date).ToUniversalTime()
$previousHealthy = $state.Healthy
$previousTunnelUrl = $state.TunnelUrl
$lastAlertAt = [datetime]::MinValue
if ($state.LastAlertAt) {
  try {
    $lastAlertAt = [datetime]$state.LastAlertAt
  } catch {
    $lastAlertAt = [datetime]::MinValue
  }
}

$title = $null
if ($ForceNotify) {
  $title = if ($healthy) { "PaySys monitor test" } else { "PaySys monitor test failed" }
} elseif ($healthy) {
  if (-not $state.Initialized) {
    $title = "PaySys monitor online"
  } elseif ($previousHealthy -eq $false) {
    $title = "PaySys recovered"
  } elseif ($previousTunnelUrl -and $tunnelUrl -and $previousTunnelUrl -ne $tunnelUrl) {
    $title = "PaySys tunnel URL changed"
  } elseif ($actions.Count -gt 0) {
    $title = "PaySys auto action completed"
  }
} else {
  $minutesSinceLastAlert = ($nowUtc - $lastAlertAt.ToUniversalTime()).TotalMinutes
  if ($previousHealthy -ne $false -or $minutesSinceLastAlert -ge 60) {
    $title = "PaySys needs attention"
  }
}

if ($title) {
  Send-Bark -Title $title -Body $body
  $lastAlertAt = $nowUtc
}

$nextState = [ordered]@{
  Initialized = $true
  Healthy = $healthy
  TunnelUrl = $tunnelUrl
  LastAlertAt = $lastAlertAt.ToString("o")
  LastRunAt = $nowUtc.ToString("o")
  LocalDetail = $localCheck.Detail
  ExternalDetail = $externalCheck.Detail
}
Save-State $nextState

Add-Content -LiteralPath $MonitorLogPath -Value "$(Get-Date -Format o) healthy=$healthy local=$($localCheck.Ok) tunnelProcess=$tunnelProcessOk external=$($externalCheck.Ok) url=$portalUrl actions=$($actions -join ',')"

if (-not $healthy) {
  exit 1
}
