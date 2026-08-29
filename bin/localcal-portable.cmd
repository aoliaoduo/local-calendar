@ECHO OFF
SETLOCAL
SET "LOCAL_CALENDAR_CLI_LOCAL=1"
SET "LOCAL_CALENDAR_DATA_DIR=%~dp0data"
SET "ELECTRON_RUN_AS_NODE=1"
"%~dp0Local Calendar.exe" "%~dp0resources\app.asar\out\main\cli.js" %*
EXIT /B %ERRORLEVEL%
