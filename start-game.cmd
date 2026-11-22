@echo off
setlocal
cd /d "%~dp0"
where.exe node.exe >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 22 or later, then run this launcher again.
  pause
  exit /b 1
)
node.exe server.mjs --open
if errorlevel 1 pause
