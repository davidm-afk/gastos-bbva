@echo off
title BBVA LiveTracker - Lanzador Completo
echo ========================================================
echo   INICIANDO TODO: SERVIDOR LOCAL + TUNEL 4G/5G
echo ========================================================
cd /d "%~dp0"

echo [1/2] Abriendo Servidor Local en ventana nueva...
start "Servidor BBVA" cmd /k ".\iniciar_servidor.bat"

timeout /t 3 /nobreak >nul

echo [2/2] Abriendo Tunel Cloudflare en ventana nueva...
start "Tunel Remoto BBVA" cmd /k ".\iniciar_tunel.bat"

echo.
echo Todo listo! Puedes ver las dos ventanas abiertas.
pause

