@echo off
REM Despliega los arreglos de TI Connect paso a paso, preguntando antes de cada uno.
REM Ejecutalo DENTRO de la carpeta de tu proyecto TI_Connect_Firebase, despues de copiar aqui los archivos de esta entrega.
setlocal
set PROYECTO=ti-connect-3d3a7

where firebase >nul 2>nul || (echo Falta firebase-tools. Instalalo con:  npm install -g firebase-tools & exit /b 1)
if not exist firebase.json (echo Aqui no hay firebase.json: ejecuta este archivo dentro de la carpeta TI_Connect_Firebase. & exit /b 1)

echo Proyecto: %PROYECTO%
call firebase use %PROYECTO% || exit /b 1

set COPIA=respaldo-antes-del-arreglo-%DATE:~-4%%DATE:~3,2%%DATE:~0,2%-%TIME:~0,2%%TIME:~3,2%
set COPIA=%COPIA: =0%
mkdir "%COPIA%"
xcopy /E /I /Q web "%COPIA%\web" >nul
copy /Y firestore.rules "%COPIA%\" >nul
copy /Y storage.rules "%COPIA%\" >nul
echo Copia local de lo que hay ahora en: %COPIA%

set /p R="1/3  Desplegar el SITIO (corrige el XSS)? [s/N] "
if /I "%R%"=="s" call firebase deploy --only hosting

echo.
echo Antes del paso 2, prueba la app: crea un ticket de prueba con el titulo  ^<img src=x onerror=alert(1)^>  y revisa que no salga ninguna alerta.
set /p R="2/3  Desplegar las REGLAS DE FIRESTORE? (prueba antes en el Simulador de reglas) [s/N] "
if /I "%R%"=="s" call firebase deploy --only firestore:rules

set /p R="3/3  Desplegar las REGLAS DE STORAGE? [s/N] "
if /I "%R%"=="s" call firebase deploy --only storage

echo Listo. Revisa LEEME.md, seccion "Pruebas despues de desplegar".
endlocal
