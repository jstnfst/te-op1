@echo off
setlocal

cl op1dump.c  /Fe:op1dump.exe  /W3 /D_CRT_SECURE_NO_WARNINGS
if errorlevel 1 goto fail

cl json2aif.c /Fe:json2aif.exe /W3 /D_CRT_SECURE_NO_WARNINGS
if errorlevel 1 goto fail

cl test_aif.c /Fe:test_aif.exe /W3 /D_CRT_SECURE_NO_WARNINGS
if errorlevel 1 goto fail

cl diff-patches.c cJSON.c /Fe:diff-patches.exe /W3 /D_CRT_SECURE_NO_WARNINGS
if errorlevel 1 goto fail

cl explore-aif.c /Fe:explore-aif.exe /W3 /D_CRT_SECURE_NO_WARNINGS
if errorlevel 1 goto fail

cl summarize.c cJSON.c /Fe:summarize.exe /W3 /D_CRT_SECURE_NO_WARNINGS
if errorlevel 1 goto fail

del *.obj >nul 2>&1
echo.
echo Build OK
goto end

:fail
echo.
echo Build FAILED
exit /b 1

:end
