@echo off
REM ---------------------------------------------------------------------------
REM Open TaskFlow in Chrome with the accessibility tree forced on.
REM
REM NVDA was logging "Chrome Legacy Window" and reading nothing from the page -
REM not even a text field's label on focus - which means Chrome never switched
REM its accessibility engine on. --force-renderer-accessibility removes the
REM guesswork.
REM
REM A separate --user-data-dir is used on purpose: Chrome reuses an existing
REM process for an existing profile and would silently ignore the flag. This
REM starts a genuinely separate instance and leaves your normal browser and
REM tabs untouched.
REM ---------------------------------------------------------------------------

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
    echo ERROR: Chrome not found.
    pause
    exit /b 1
)

if not exist "C:\Temp\a11y-profile" mkdir "C:\Temp\a11y-profile"

echo Opening TaskFlow with accessibility forced on...
start "" "%CHROME%" --force-renderer-accessibility --user-data-dir="C:\Temp\a11y-profile" --no-first-run --no-default-browser-check "http://127.0.0.1:5173"
