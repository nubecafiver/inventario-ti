@echo off
chcp 65001 >nul
cd /d "%~dp0"
title CAFIVER Firma Digital - PRUEBAS
where python >nul 2>nul
if errorlevel 1 (
  echo No se encontro Python. Intentando instalarlo...
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
  echo.
  echo Cierra esta ventana y vuelve a hacer doble clic en INICIAR-PRUEBAS.bat
  pause
  exit /b
)
if not exist v\Scripts\python.exe (
  echo Preparando por primera vez, tarda 2 o 3 minutos...
  python -m venv v || goto error
  v\Scripts\python -m pip install --quiet pyHanko requests fastapi uvicorn python-multipart || goto error
)
start "" cmd /c "timeout /t 8 >nul & start http://localhost:8000"
echo.
echo Si no se abre el navegador, entra a http://localhost:8000
echo Para detener: cierra esta ventana.
v\Scripts\python iniciar_pruebas.py
pause
exit /b
:error
echo.
echo Ocurrio un error. Toma una captura de esta ventana y enviala.
pause
