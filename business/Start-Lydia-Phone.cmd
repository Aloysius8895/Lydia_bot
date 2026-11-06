@echo off
cd /d "%~dp0"
node --experimental-strip-types scripts/start-phone.ts
pause
