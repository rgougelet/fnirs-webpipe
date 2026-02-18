@echo off
REM archive-repo.bat
REM This gets the folder the BAT is in, works even if run from elsewhere:
setlocal
set "REPO_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$repoPath = '%REPO_DIR%';" ^
  "$archiveDir = Join-Path $repoPath 'legacy';" ^
  "$stageDir = Join-Path $repoPath '.snapshot_staging';" ^
  "if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force };" ^
  "New-Item -ItemType Directory -Path $stageDir | Out-Null;" ^
  "Set-Location $repoPath;" ^
  "$tracked = git ls-files;" ^
  "foreach ($relativePath in $tracked) {" ^
    "  $sourcePath = Join-Path $repoPath $relativePath;" ^
    "  $destPath = Join-Path $stageDir $relativePath;" ^
    "  $destFolder = Split-Path $destPath -Parent;" ^
    "  if (-not (Test-Path $destFolder)) { New-Item -ItemType Directory -Path $destFolder -Force | Out-Null }" ^
    "  Copy-Item $sourcePath $destPath" ^
  "};" ^
  "if (-not (Test-Path $archiveDir)) { New-Item -Path $archiveDir -ItemType Directory | Out-Null };" ^
  "$zipName = \"repo-archive_{0:yyyy-MM-dd_HH-mm-ss}.zip\" -f (Get-Date);" ^
  "$zipPath = Join-Path $archiveDir $zipName;" ^
  "Compress-Archive -Path \"$stageDir\\*\" -DestinationPath $zipPath -Force;" ^
  "Remove-Item $stageDir -Recurse -Force;" ^
  "Write-Host \"Zipped to $zipPath (structure preserved)\";" ^
  "Start-Process explorer.exe $archiveDir"
endlocal
pause
