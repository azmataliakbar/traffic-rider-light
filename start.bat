@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

echo Starting Neon Traffic Rider at http://localhost:8080
echo Keep this window open while you play. Close it to stop the game.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8080"
node scripts\serve.mjs
pause
