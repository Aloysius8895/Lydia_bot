@echo off
setlocal
cd /d "%~dp0..\business"
echo Lydia App - Settings - Crawl: http://127.0.0.1:4318/?settings=crawl
call npm.cmd start
pause
