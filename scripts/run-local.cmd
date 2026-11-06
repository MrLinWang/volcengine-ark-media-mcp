@echo off
setlocal
set "ROOT=%~dp0.."

if not exist "%ROOT%\dist\index.js" (
  echo [volcengine-ark-media-mcp] dist\index.js not found. Run: npm run build
  exit /b 1
)

if exist "%ROOT%\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%\.env") do (
    if not "%%A"=="" if not "%%A:~0,1"=="#" set "%%A=%%B"
  )
)

node "%ROOT%\dist\index.js"
