$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$branch = (git branch --show-current).Trim()
if ($branch -ne "main") {
  throw "Refusing to push: current branch is '$branch', expected 'main'."
}

git push origin main
