@echo off
title Listicle to Instagram
cd /d "%~dp0"

REM First-run setup: install deps + Playwright Chromium if missing.
REM Subsequent launches skip this and start in ~1 second.
if not exist "node_modules" (
  echo First-time setup: installing dependencies...
  call npm install
  if errorlevel 1 goto :error
  echo.
  echo Installing Playwright Chromium ^(~150MB, one-time^)...
  call npx playwright install chromium
  if errorlevel 1 goto :error
)

if not exist ".next" (
  echo Building production app...
  call npm run build
  if errorlevel 1 goto :error
)

echo.
echo ============================================
echo  Listicle to Instagram is starting...
echo  Browser will open at http://localhost:3000
echo  Keep this window open while using the app.
echo  Close this window to shut down the server.
echo ============================================
echo.

REM Open the browser a few seconds after the server starts.
start /MIN powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3000'"

REM Run the server in the foreground so closing this window kills it.
call npm start
goto :eof

:error
echo.
echo Setup failed. Press any key to close.
pause >nul
exit /b 1