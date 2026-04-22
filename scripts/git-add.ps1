param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
  [string[]]$Path,

  [switch]$All
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

if ($All) {
  git add -A
  exit $LASTEXITCODE
}

if (-not $Path -or $Path.Count -eq 0) {
  throw "Provide one or more paths to stage, or pass -All to stage all changes."
}

foreach ($item in $Path) {
  if ([string]::IsNullOrWhiteSpace($item)) {
    throw "Path arguments must not be empty."
  }
}

git add -- @Path
