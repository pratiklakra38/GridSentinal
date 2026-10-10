param([switch]$Backend)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if ($Backend) {
    $taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
    if (!(Test-Path -LiteralPath $taskPython)) { $taskPython = 'python' }
    Start-Process -FilePath $taskPython -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000' -WorkingDirectory (Join-Path $taskRoot 'backend') -WindowStyle Hidden
    $env:VITE_API_MODE = 'backend'
}
Set-Location (Join-Path $taskRoot 'frontend')
if (!(Test-Path -LiteralPath 'node_modules')) { npm.cmd ci }
npm.cmd run dev
