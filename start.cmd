@echo off
TITLE Dr. Rana Dental Clinic
cd /d "%~dp0"

echo.
echo =================================================================
echo  Starting Dr. Rana Dental Clinic (backend API + frontend website)
echo =================================================================
echo.
echo   Website:  http://localhost:8080
echo   API:      http://localhost:5000
echo.

if not exist "node_modules" goto install
if not exist "backend\node_modules" goto install
if not exist "frontend\node_modules" goto install
goto run

:install
echo Installing dependencies (first run only)...
call npm run setup || goto failed

:run
if not exist "env\backend.env" (
  echo NOTE: env\backend.env not found -- email/WhatsApp will be disabled.
  echo       Copy env\backend.env.example to env\backend.env and fill it in.
  echo.
)
call npm run dev
goto :eof

:failed
echo.
echo Dependency install failed. See the errors above.
pause
