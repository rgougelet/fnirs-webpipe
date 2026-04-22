param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Name,

  [switch]$Remote
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($Name)) {
  throw "Branch name must not be empty."
}

if ($Name -eq "main" -or $Name -eq "origin/main") {
  throw "Refusing to delete main."
}

if ($Name -match "^\s|[\r\n]|;$|&&|\|\|") {
  throw "Branch name contains unsupported shell control characters."
}

git branch -D $Name

if ($Remote) {
  git push origin --delete $Name
}
