@echo off
title Hypervision Form - Startup Launcher
echo ========================================================
echo   Launching Hypervision Form Platform
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Starting FastAPI Backend on http://localhost:8000 ...
start "Hypervision Form - Backend (Port 8000)" cmd /k "cd /d "%~dp0backend" && if exist .venv\Scripts\activate.bat (call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000) else (python -m uvicorn app.main:app --reload --port 8000)"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Next.js Frontend on http://localhost:3000 ...
start "Hypervision Form - Frontend (Port 3000)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ========================================================
echo   Both services are launching in separate windows!
echo   - Frontend: http://localhost:3000
echo   - Backend:  http://localhost:8000
echo   - API Docs: http://localhost:8000/api/v1/docs
echo ========================================================
echo.
timeout /t 3 /nobreak >nul
start http://localhost:3000

