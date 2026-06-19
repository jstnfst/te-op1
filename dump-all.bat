@echo off
setlocal
set COUNT=0
for %%f in (presets\*.aif) do (
    "%~dp0op1dump.exe" "%%f"
    set /a COUNT+=1
)
echo.
echo Processed %COUNT% file(s).
