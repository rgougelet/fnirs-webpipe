param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Message,

  [switch]$All
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($Message)) {
  throw "Commit message must not be empty."
}

if ($All) {
  git add -A
}

$staged = git diff --cached --name-only
if (-not $staged) {
  throw "No staged changes to commit. Use -All to stage all changes first."
}

git -c user.name=rgougelet -c user.email=rgougelet@gmail.com commit -m $Message
