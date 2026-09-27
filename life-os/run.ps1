# Starts Life OS on this computer and opens it in the browser.
# Usage (PowerShell, inside the life-os folder):   .\run.ps1
# Rebuild the screens after changing frontend code: .\run.ps1 -Build
param([switch]$Build)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 1. Python environment (created once)
$py = if (Get-Command py -ErrorAction SilentlyContinue) { "py" } else { "python" }
if (-not (Test-Path "backend\.venv")) {
    Write-Host "First run: setting up Python (takes a minute)..."
    & $py -m venv backend\.venv
}
$venvPy = "backend\.venv\Scripts\python.exe"
$req = Get-FileHash backend\requirements.txt
$stamp = "backend\.venv\requirements.hash"
if (-not (Test-Path $stamp) -or (Get-Content $stamp) -ne $req.Hash) {
    & $venvPy -m pip install -q -r backend\requirements.txt
    Set-Content $stamp $req.Hash
}

# 2. Frontend (already built and included; rebuild only when asked or missing)
if ($Build -or -not (Test-Path "frontend\dist\index.html")) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Node.js is needed to build the frontend: https://nodejs.org" }
    Push-Location frontend
    npm install
    npm run build
    Pop-Location
}

# 3. Run. The browser opens once the server answers.
$url = "http://127.0.0.1:8765"
Start-Job -ScriptBlock {
    param($u)
    for ($i = 0; $i -lt 30; $i++) {
        try { Invoke-WebRequest "$u/api/healthz" -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process $u; return } catch { Start-Sleep -Milliseconds 500 }
    }
} -ArgumentList $url | Out-Null
Write-Host "Life OS is running at $url  (keep this window open; Ctrl+C to stop)"
Set-Location backend
& ".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8765
