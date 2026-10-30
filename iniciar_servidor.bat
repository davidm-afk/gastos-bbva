@echo off
title BBVA LiveTracker - Servidor Local
echo ========================================================
echo   INICIANDO BBVA LIVETRACKER (DASHBOARD FINANCIERO)
echo ========================================================
cd /d "%~dp0"

echo [1/2] Activando entorno virtual...
call .\venv\Scripts\activate.bat

echo [2/2] Abriendo el panel en tu navegador...
start http://localhost:8000

echo Servidor escuchando en http://localhost:8000
echo Presiona Ctrl+C para detener el servidor.
echo.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause

