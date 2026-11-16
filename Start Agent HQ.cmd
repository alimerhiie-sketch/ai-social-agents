@echo off
rem Starts Agent HQ in production mode (no auto-reloading) and opens it in your browser.
rem Keep this window open while the agents work; close it to stop the dashboard.
title Agent HQ
cd /d "%~dp0"

if not exist ".next\BUILD_ID" (
  echo Building Agent HQ for the first time, about a minute...
  call npm run hq:build || goto :error
)

start "" http://localhost:3210
call npm run hq
goto :eof

:error
echo.
echo The build failed. Scroll up to see why.
pause
