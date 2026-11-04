@echo off
echo ========================================================
echo Starting Hypervision Form Platform
echo ========================================================

echo [1/2] Starting Backend API (FastAPI) on port 8000...
start "Hypervision Form Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn app.main:app --app-dir %~dp0backend --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Starting Frontend (Next.js) on port 3000...
start "Hypervision Form Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================================
echo Servers launched in separate windows!
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:8000/docs
echo ========================================================
