@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo.
echo   Copilot Model Manager - Build
echo   =============================
echo.

echo   [1/3] 清理旧文件...
if exist "CopilotModelManager.exe" (
    del /f "CopilotModelManager.exe" 2>nul
    if exist "CopilotModelManager.exe" (
        echo   [!] 旧 exe 无法删除（可能正在运行），请先关闭后重试
        pause
        exit /b 1
    )
    echo         已删除旧 exe
)
if exist "CopilotModelManager.tmp" del /f "CopilotModelManager.tmp" 2>nul

echo.
echo   [2/3] 打包中 (node20-win-x64 + Brotli)...
echo         这可能需要 1-2 分钟...
echo.
call npx @yao-pkg/pkg . --targets node20-win-x64 --output CopilotModelManager.exe --compress Brotli
if errorlevel 1 (
    echo.
    echo   [!] 打包失败
    pause
    exit /b 1
)

echo.
echo   [3/3] 修补 PE 子系统 (Console -^> GUI)...
node -e "const fs=require('fs');const s='CopilotModelManager.exe',t='CopilotModelManager.tmp';const f=fs.readFileSync(s);const pe=f.readInt32LE(0x3C);f[pe+24+68]=2;fs.writeFileSync(t,f);fs.renameSync(t,s);console.log('         Done: subsystem -> GUI (no CMD window)')"

echo.
echo   ========================================
for %%F in (CopilotModelManager.exe) do echo   输出: %%~nxF (%%~zF bytes)
echo   ========================================
echo.
pause
