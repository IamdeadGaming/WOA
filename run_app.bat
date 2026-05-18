@echo off
setlocal
set "BUNDLED_PY=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if exist "%BUNDLED_PY%" (
  "%BUNDLED_PY%" "%~dp0main.py"
) else (
  python "%~dp0main.py"
)

endlocal
