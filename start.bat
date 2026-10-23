@echo off
rem ============================================================================
rem  IPA TTS - Windows one-click launcher
rem
rem  Double-click this file: it installs dependencies on first run, starts the
rem  local web service and opens your browser.
rem
rem  Options (optional):  --port 9000   --no-open   --install   --help
rem
rem  This file stays plain ASCII on purpose: cmd.exe decodes .bat files with the
rem  active console code page, so non-ASCII text here would garble on some
rem  systems. Every user-facing message comes from tools\start-web.mjs, which
rem  Node writes to the console as Unicode.
rem ============================================================================

setlocal EnableExtensions
cd /d "%~dp0"

rem ---- locate node.exe -------------------------------------------------------
set "NODE_EXE="
for %%P in (node.exe) do if not defined NODE_EXE if exist "%%~$PATH:P" set "NODE_EXE=%%~$PATH:P"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"

if not defined NODE_EXE goto :no_node

rem ---- require Node.js 18+ ---------------------------------------------------
for /f "tokens=1 delims=." %%V in ('"%NODE_EXE%" -v 2^>nul') do set "NODE_MAJOR=%%V"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if not defined NODE_MAJOR goto :no_node
if not "%NODE_MAJOR%"=="" if %NODE_MAJOR% LSS 18 goto :old_node

rem ---- the real launcher -----------------------------------------------------
if not exist "%~dp0tools\start-web.mjs" goto :no_script

"%NODE_EXE%" "%~dp0tools\start-web.mjs" %*
set "RC=%ERRORLEVEL%"

rem The launcher reports its own failures (and pauses for them), so only an
rem unexpected exit code needs to keep this window open.
if "%RC%"=="0" goto :done
if "%RC%"=="1" goto :done
echo.
echo   [!] Launcher exited with code %RC%.
pause

:done
endlocal & exit /b %RC%


rem ============================================================================
rem  Error paths (ASCII only, so they survive any console code page)
rem ============================================================================

:no_node
echo.
echo   [!] Node.js was not found on this computer.
echo.
echo       This project needs Node.js 18 or newer, and it includes npm.
echo       Download the LTS installer here:
echo.
echo         https://nodejs.org/en/download
echo.
echo       Install it with the default options, then double-click start.bat again.
echo.
start "" "https://nodejs.org/en/download"
pause
endlocal & exit /b 1

:old_node
echo.
echo   [!] Node.js %NODE_MAJOR% is too old - version 18 or newer is required.
echo.
echo       Found: "%NODE_EXE%"
echo       Get the current LTS from: https://nodejs.org/en/download
echo.
start "" "https://nodejs.org/en/download"
pause
endlocal & exit /b 1

:no_script
echo.
echo   [!] tools\start-web.mjs is missing.
echo.
echo       Keep start.bat in the project root, next to package.json and the
echo       tools folder, then try again.
echo.
pause
endlocal & exit /b 1
