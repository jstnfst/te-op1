@echo off
setlocal
set COUNT=0
for %%f in (presets\*.aif) do (
    "%~dp0mondo.exe" dump "%%f"
    set /a COUNT+=1
)
echo.
echo Processed %COUNT% file(s).
