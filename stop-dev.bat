@echo off
setlocal enabledelayedexpansion

REM ---------------------------------------------------------------------------
REM TaskFlow - stop the development servers.
REM
REM Kills whatever is listening on the API and UI ports, and nothing else.
REM Deliberately targets ports rather than image names: `taskkill /IM node.exe`
REM would take down every Node process on the machine, including work that has
REM nothing to do with this project.
REM
REM Run this before `npm run test:e2e` - Playwright starts its own servers and
REM refuses to run if these ports are occupied.
REM ---------------------------------------------------------------------------

set "API_PORT=8000"
set "UI_PORT=5173"
set "FOUND=0"

echo.
echo  TaskFlow - stopping development servers
echo  ---------------------------------------

call :kill_port %API_PORT% "API"
call :kill_port %UI_PORT% "UI"

echo.
if "%FOUND%"=="0" (
    echo  Nothing was running on ports %API_PORT% or %UI_PORT%.
) else (
    echo  Done. Ports %API_PORT% and %UI_PORT% are free.
)

echo.
echo  Note: the two terminal windows may stay open at a prompt -
echo  `cmd /k` keeps the shell alive after the server inside it exits.
echo  Close them whenever; they are idle.
echo.
echo  NVDA is not touched by this script. To stop it: Insert+Q, then Enter.
echo.
exit /b 0

REM ---------------------------------------------------------------------------
:kill_port
set "PORT=%~1"
set "LABEL=%~2"

REM Match LISTENING rows only, so an outbound connection to the same port
REM number elsewhere is never mistaken for our server.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    if not "%%P"=="0" (
        echo  Stopping %LABEL% on port %PORT% ^(PID %%P^)...
        taskkill /F /T /PID %%P >nul 2>&1
        if errorlevel 1 (
            echo    could not stop PID %%P - it may need an elevated prompt
        ) else (
            echo    stopped
        )
        set "FOUND=1"
    )
)
exit /b 0
