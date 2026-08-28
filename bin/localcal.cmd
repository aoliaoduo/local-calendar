@ECHO OFF
SETLOCAL
node "%~dp0..\out\main\cli.js" %*
EXIT /B %ERRORLEVEL%
