# Kills any process on 8001 and restarts uvicorn from the venv.
$port = 8001
$pid = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force; Start-Sleep -Seconds 1 }
$uvicorn = "$PSScriptRoot\.venv\Scripts\uvicorn.exe"
Start-Process -FilePath $uvicorn -ArgumentList "app:app","--reload","--port","8001" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Start-Sleep -Seconds 4
(Invoke-WebRequest -Uri "http://localhost:$port/healthz" -UseBasicParsing).Content
