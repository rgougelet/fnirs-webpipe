@echo off
REM archive-repo.bat
setlocal
set "REPO_DIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$repoPath = '%REPO_DIR%';" ^
  "$archiveDir = Join-Path $repoPath 'legacy';" ^
  "$stageDir = Join-Path $env:TEMP ('repo_snapshot_' + [guid]::NewGuid().ToString());" ^
  "try {" ^
  "  if (-not (Test-Path $archiveDir)) { New-Item -Path $archiveDir -ItemType Directory | Out-Null }" ^
  "  New-Item -ItemType Directory -Path $stageDir | Out-Null;" ^
  "  Set-Location $repoPath;" ^
  "  $tracked = git ls-files;" ^
  "  foreach ($relativePath in $tracked) {" ^
  "    $sourcePath = Join-Path $repoPath $relativePath;" ^
  "    $destPath = Join-Path $stageDir $relativePath;" ^
  "    $destFolder = Split-Path $destPath -Parent;" ^
  "    if (-not (Test-Path $destFolder)) { New-Item -ItemType Directory -Path $destFolder -Force | Out-Null }" ^
  "    Copy-Item -LiteralPath $sourcePath -Destination $destPath -Force -ErrorAction Stop" ^
  "  }" ^
  "  $zipName = ('repo-archive_{0:yyyy-MM-dd_HH-mm-ss}.zip' -f (Get-Date));" ^
  "  $zipPath = Join-Path $archiveDir $zipName;" ^
  "  for ($i = 0; $i -lt 10; $i++) {" ^
  "    try {" ^
  "      Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -Force -ErrorAction Stop;" ^
  "      Write-Host ('Zipped to ' + $zipPath + ' (structure preserved)');" ^
  "      break" ^
  "    } catch {" ^
  "      if ($i -eq 9) { throw }" ^
  "      Start-Sleep -Milliseconds 400" ^
  "    }" ^
  "  }" ^
  "  Start-Process explorer.exe $archiveDir;" ^
  "} finally {" ^
  "  if (Test-Path $stageDir) {" ^
  "    for ($j = 0; $j -lt 10; $j++) {" ^
  "      try { Remove-Item $stageDir -Recurse -Force -ErrorAction Stop; break }" ^
  "      catch { Start-Sleep -Milliseconds 400 }" ^
  "    }" ^
  "  }" ^
  "}"

endlocal
pause
