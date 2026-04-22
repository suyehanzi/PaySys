param(
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogDir = Join-Path $Root "logs"
$LogPath = Join-Path $LogDir "backup.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-BackupLog {
  param([string]$Message)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$stamp] $Message" | Tee-Object -FilePath $LogPath -Append
}

try {
  Write-BackupLog "PaySys database backup started"
  $node = (Get-Command node -ErrorAction Stop).Source
  $args = @((Join-Path $Root "scripts\backup-paysys.js"))
  if ($NoPush) {
    $args += "--no-push"
  }

  Push-Location $Root
  try {
    & $node @args 2>&1 | Tee-Object -FilePath $LogPath -Append
    if ($LASTEXITCODE -ne 0) {
      throw "backup-paysys.js exited with code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  Write-BackupLog "PaySys database backup finished"
} catch {
  Write-BackupLog "PaySys database backup failed: $($_.Exception.Message)"
  exit 1
}
