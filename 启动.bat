@echo off
if not "%~1"==":inner" goto :launch
:inner
echo.
echo   Copilot Model Manager
echo   ====================
echo.
cd /d "%~dp0"

if not exist "node_modules" (
    echo   [!] node_modules 未找到，正在安装依赖...
    echo.
    call npm install
    echo.
)

node server.js
pause
exit

:launch
start /min "" cmd /c "%~f0" :inner
