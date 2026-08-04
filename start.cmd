@echo off
TITLE Stellar Care UI

echo.
echo =================================================================
echo  Starting Stellar Care UI Project (Frontend and Backend)
echo =================================================================
echo.
echo This script will start both the frontend and backend servers together
echo in this window using the pre-configured "dev:all" script.
echo.
echo Press any key to start...
pause > nul
echo.
echo Starting servers...

call npm run dev:all