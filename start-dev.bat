@echo off
setlocal

REM ---------------------------------------------------------------------------
REM TaskFlow - start the API and the UI for local development.
REM
REM Opens two terminal windows so each server's output stays readable and
REM either can be stopped on its own. Close a window, or press Ctrl+C in it,
REM to stop that server.
REM
REM This is project tooling. It is NOT start-claude.bat, which launches Claude
REM Code against a LiteLLM proxy and is unrelated to the application.
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

set "API_HOST=127.0.0.1"
set "API_PORT=8000"
set "UI_PORT=5173"

echo.
echo  TaskFlow - starting development servers
echo  ---------------------------------------

REM --- Guard: are we somewhere sensible? -------------------------------------
if not exist "backend\pyproject.toml" goto :no_backend
if not exist "frontend\package.json" goto :no_frontend
if not exist "frontend\node_modules"  goto :no_modules

REM --- Guard: are the ports already taken? -----------------------------------
REM A stale server is the single most confusing failure here: the UI loads but
REM every request fails, or Vite silently picks a different port and the API's
REM CORS allowlist no longer matches the origin.
netstat -ano | findstr "LISTENING" | findstr ":%API_PORT% " >nul 2>&1
if not errorlevel 1 goto :api_port_busy

netstat -ano | findstr "LISTENING" | findstr ":%UI_PORT% " >nul 2>&1
if not errorlevel 1 goto :ui_port_busy

REM --- Apply migrations before anything serves -------------------------------
REM Alembic is the only permitted route to a schema (see the constitution).
REM Running it here means a fresh clone works on the first try instead of
REM failing with "no such table: tasks" on the first request.
echo.
echo  [1/3] Applying database migrations...
pushd backend
python -m alembic upgrade head
if errorlevel 1 (
    popd
    goto :migration_failed
)
popd

REM --- Launch ----------------------------------------------------------------
echo  [2/3] Starting API      ^(http://%API_HOST%:%API_PORT%^)
start "TaskFlow API" cmd /k "cd /d "%~dp0backend" && python -m uvicorn taskflow.main:app --reload --host %API_HOST% --port %API_PORT%"

echo  [3/3] Starting UI       ^(http://%API_HOST%:%UI_PORT%^)
start "TaskFlow UI" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo  ---------------------------------------
echo   UI       http://%API_HOST%:%UI_PORT%
echo   API      http://%API_HOST%:%API_PORT%
echo   Schema   http://%API_HOST%:%API_PORT%/docs
echo   Record   backend\telemetry.jsonl  ^(local only, never transmitted^)
echo.
echo   Two windows have opened. Close one, or press Ctrl+C in it,
echo   to stop that server.
echo.
echo   Note: do not leave these running before `npm run test:e2e`.
echo   Playwright starts its own servers and will fail if the ports
echo   are taken.
echo  ---------------------------------------
echo.
goto :eof

REM --- Failure paths ---------------------------------------------------------
:no_backend
echo.
echo  ERROR: backend\pyproject.toml not found.
echo  Run this script from the repository root.
goto :fail

:no_frontend
echo.
echo  ERROR: frontend\package.json not found.
echo  Run this script from the repository root.
goto :fail

:no_modules
echo.
echo  ERROR: frontend dependencies are not installed.
echo  Run:  cd frontend ^&^& npm install
goto :fail

:api_port_busy
echo.
echo  ERROR: port %API_PORT% is already in use ^(the API port^).
echo  Something is already listening - possibly a server from an
echo  earlier run, or a Playwright run that did not shut down.
echo.
echo  Find it with:   netstat -ano ^| findstr ":%API_PORT%"
echo  Stop it with:   taskkill /F /PID ^<pid^>
goto :fail

:ui_port_busy
echo.
echo  ERROR: port %UI_PORT% is already in use ^(the UI port^).
echo  Vite is configured with strictPort, so it will not fall back
echo  to another port.
echo.
echo  Find it with:   netstat -ano ^| findstr ":%UI_PORT%"
echo  Stop it with:   taskkill /F /PID ^<pid^>
goto :fail

:migration_failed
echo.
echo  ERROR: `alembic upgrade head` failed. Nothing was started.
echo  The API would only have failed on its first request, so this
echo  stops here instead.
goto :fail

:fail
echo.
pause
exit /b 1
