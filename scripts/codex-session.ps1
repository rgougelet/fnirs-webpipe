param(
  [switch]$New,
  [switch]$Picker,
  [string]$Prompt
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$transcriptDir = Join-Path $repoRoot "agents\chat-history"

New-Item -ItemType Directory -Force -Path $transcriptDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$transcriptPath = Join-Path $transcriptDir "codex-$stamp.txt"
Start-Transcript -Path $transcriptPath -Append | Out-Null
Write-Host "Transcript: $transcriptPath"

try {
  Set-Location $repoRoot

  $commonArgs = @("--no-alt-screen", "--cd", $repoRoot)

  if ($New) {
    $cmdArgs = $commonArgs
    if ($Prompt) { $cmdArgs += $Prompt }
  } elseif ($Picker) {
    $cmdArgs = @("resume") + $commonArgs
    if ($Prompt) { $cmdArgs += $Prompt }
  } else {
    $cmdArgs = @("resume", "--last") + $commonArgs
    if ($Prompt) { $cmdArgs += $Prompt }
  }

  Write-Host ("Running: codex " + ($cmdArgs -join " "))
  & codex @cmdArgs
  $exitCode = $LASTEXITCODE

  if ((-not $New) -and (-not $Picker) -and $exitCode -ne 0) {
    Write-Host "Resume failed; starting a new Codex session."
    $cmdArgs = $commonArgs
    if ($Prompt) { $cmdArgs += $Prompt }
    Write-Host ("Running: codex " + ($cmdArgs -join " "))
    & codex @cmdArgs
    $exitCode = $LASTEXITCODE
  }

  exit $exitCode
} finally {
  Stop-Transcript | Out-Null
}
