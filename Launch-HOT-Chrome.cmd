@echo off
setlocal
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
set "PROFILE=%~dp0..\hot-chrome-profile"
set "ANDROID_UA=Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
start "HOT Chrome" "%CHROME%" --user-data-dir="%PROFILE%" --user-agent="%ANDROID_UA%" --remote-debugging-port=9223 --remote-debugging-address=127.0.0.1 --app="https://androidplay.hot.net.il/bluesky_1_52/default.aspx" --enable-logging --log-file="%PROFILE%\hot-chrome.log" --log-level=3
start "" wscript.exe "%~dp0bootstrap.vbs"
exit /b 0
