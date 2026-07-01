@echo off
setlocal
cd /d "%~dp0"

cl mondo.c cJSON.c /Fe:mondo.exe /W3 /D_CRT_SECURE_NO_WARNINGS
if errorlevel 1 goto fail

del *.obj *.exp *.lib >nul 2>&1
echo.
echo Build OK
goto end

:fail
echo.
echo Build FAILED
exit /b 1

:end
