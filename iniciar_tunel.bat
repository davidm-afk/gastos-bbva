@echo off
title BBVA LiveTracker - Tunel Remoto Cloudflare (4G/5G)
echo ========================================================
echo   INICIANDO TUNEL SEGURO PARA ACCESO DESDE CUALQUIER LUGAR
echo ========================================================
cd /d "%~dp0"

if not exist ".\cloudflared.exe" (
    echo [AVISO] Descargando cloudflared.exe oficial...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '.\cloudflared.exe'"
)

echo.
echo Generando conexion HTTPS cifrada...
echo Copia el enlace 'https://xxxx.trycloudflare.com' que aparecera a continuacion
echo y pegalo en MacroDroid en tu Samsung A56 con '/api/webhook/bbva' al final.
echo.
.\cloudflared.exe tunnel --url http://localhost:8000
pause

