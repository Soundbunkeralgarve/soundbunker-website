@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 24.13 or newer once before using the TicketBunker Hub.
 pause
 exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<24||(a===24&&b<13))process.exit(1)"
if errorlevel 1 (
 echo Update Node.js to version 24.13 or newer before starting this hub.
 pause
 exit /b 1
)
if not exist node_modules call npm ci --no-audit --no-fund
if errorlevel 1 exit /b 1
node start.js
pause
