@echo off
REM ============================================================
REM  VENUS - Caja de la tienda
REM  Doble clic en este archivo para encender la caja.
REM ============================================================
setlocal enabledelayedexpansion
title Venus Caja - NO CERRAR ESTA VENTANA
cd /d "%~dp0"
set "PUERTO=3001"

echo.
echo   ==========================================
echo      VENUS - Caja de la tienda
echo   ==========================================
echo.

REM --- Revisa que Node este instalado -------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   [alto] Falta instalar Node.js en esta computadora.
  echo.
  echo   Descargalo gratis de:  https://nodejs.org
  echo   Elige la version "LTS", instala y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

REM --- Revisa que ya este instalada ---------------------------
if not exist ".env.local" (
  echo   [alto] La caja todavia no esta instalada en esta computadora.
  echo.
  echo   Cierra esta ventana, dale BOTON DERECHO a INSTALAR.bat
  echo   y elige "Ejecutar como administrador". Eso se hace una
  echo   sola vez y despues ya no vuelve a pedirse.
  echo.
  pause
  exit /b 1
)

REM --- Si ya esta encendida, no la encendemos dos veces -------
REM Al prender la computadora la caja se levanta sola por la tarea
REM programada. Si ademas alguien le da doble clic aqui, los dos se
REM pelearian por el puerto 3001 y el segundo se estaria reintentando
REM en balde. Mejor solo abrimos el navegador.
set "YA_ESTA=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":3001 .*LISTENING"') do set "YA_ESTA=1"
if "!YA_ESTA!"=="1" (
  echo   La caja YA estaba encendida. No hace falta encenderla otra vez.
  echo.
  echo   Te abro el navegador y ya. Puedes cerrar esta ventana:
  echo   la caja no se apaga, esa la maneja Windows solita.
  echo.
  start "" http://localhost:!PUERTO!
  echo.
  pause
  exit /b 0
)

REM --- Primera vez: instala lo que necesita -------------------
if not exist "node_modules" (
  echo   Preparando la caja por primera vez.
  echo   Esto tarda unos minutos, solo pasa una vez...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   [alto] No se pudo preparar. Revisa que haya internet
    echo          e intenta de nuevo.
    echo.
    pause
    exit /b 1
  )
)

REM --- Compila si hace falta ----------------------------------
if not exist ".next\BUILD_ID" (
  echo   Terminando de preparar...
  echo.
  call npm run build
  if errorlevel 1 (
    echo.
    echo   [alto] No se pudo preparar la caja.
    echo.
    pause
    exit /b 1
  )
)

REM --- Muestra las direcciones --------------------------------
echo.
echo   La caja esta encendiendo.
echo.
echo   En esta computadora:   http://localhost:!PUERTO!
echo.
echo   Desde otra computadora de la misma red, usa alguna de
echo   estas direcciones:
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo       http://%%a:!PUERTO!
echo.
echo   Desde la tienda se entra por la direccion del tunel de
echo   Cloudflare, la que ya tienen guardada en el navegador.
echo.
echo   ------------------------------------------------
echo    NO CIERRES ESTA VENTANA mientras usen la caja.
echo    Si la cierras, la tienda deja de poder cobrar.
echo    Para apagarla al final del dia, cierra esta ventana.
echo   ------------------------------------------------
echo.
echo   Tarda unos 10 segundos en abrir. Si el navegador dice que
echo   no se puede conectar, espera tantito y dale F5.
echo.

REM --- Abre el navegador y arranca ----------------------------
start "" http://localhost:!PUERTO!

REM servidor.bat es el que se queda dando vueltas: si la caja se cae
REM sola, la vuelve a levantar sin que nadie tenga que hacer nada.
call "%~dp0scripts\servidor.bat"

echo.
echo   La caja se detuvo.
pause
