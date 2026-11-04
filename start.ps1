Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Launching Hypervision Form Platform" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Start Backend in separate window
Write-Host "[1/2] Starting FastAPI Backend (http://localhost:8000)..." -ForegroundColor Yellow
$backendCmd = "cd '$rootDir\backend'; if (Test-Path '.\.venv\Scripts\Activate.ps1') { . '.\.venv\Scripts\Activate.ps1' }; uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 2

# 2. Start Frontend in separate window
Write-Host "[2/2] Starting Next.js Frontend (http://localhost:3000)..." -ForegroundColor Yellow
$frontendCmd = "cd '$rootDir\frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "Both services launched in separate windows!" -ForegroundColor Green
Write-Host " - Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host " - Backend:  http://localhost:8000" -ForegroundColor Green
Write-Host " - API Docs: http://localhost:8000/api/v1/docs" -ForegroundColor Green

Start-Sleep -Seconds 2
Start-Process "http://localhost:3000"

