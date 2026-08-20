@echo off
REM ============================================================
REM  VENUS CAJA - el servidor
REM  Este es el que enciende la caja de verdad y la mantiene
REM  encendida. Lo llama la tarea programada de Windows cuando
REM  prenden la computadora, y tambien INICIAR.bat.
REM
REM  No es para doble clic: para encender a mano usa INICIAR.bat.
REM ============================================================
setlocal enabledelayedexpansion
title Venus Caja - servidor (NO CERRAR)

REM La tarea programada arranca parada en C:\Windows\system32, asi que hay
REM que venirse a la carpeta del proyecto a fuerza. Este archivo vive en
REM scripts\, o sea que el proyecto es la carpeta de arriba.
cd /d "%~dp0.."

if not exist "logs" mkdir "logs"

where node >nul 2>nul
if errorlevel 1 (
  echo   [alto] Falta instalar Node.js. Descargalo de https://nodejs.org
  exit /b 1
)

if not exist ".next\BUILD_ID" (
  echo   [alto] El programa no esta preparado todavia.
  echo          Abre INSTALAR.bat una vez y vuelve a intentar.
  exit /b 1
)

REM Los registros de hace mas de un mes no le sirven a nadie y con el
REM tiempo llenan el disco.
forfiles /p "logs" /m "caja-*.log" /d -30 /c "cmd /c del @path" >nul 2>nul

set "INTENTOS=0"

:bucle

REM La fecha se saca con node y no con la variable DATE de Windows, porque
REM esa cambia de forma segun como este configurado el idioma y los
REM archivos de registro saldrian con nombres distintos en cada maquina.
for /f "usebackq delims=" %%F in (`node -e "const d=new Date(),p=n=>String(n).padStart(2,'0');console.log(d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()))"`) do set "HOY=%%F"
for /f "usebackq delims=" %%H in (`node -e "const d=new Date(),p=n=>String(n).padStart(2,'0');console.log(p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()))"`) do set "AHORA=%%H"
set "REGISTRO=logs\caja-!HOY!.log"

echo.
echo   [!AHORA!] Encendiendo la caja...
echo   Lo que pase queda anotado en:  !REGISTRO!
echo.
>>"!REGISTRO!" echo(
>>"!REGISTRO!" echo ===== !HOY! !AHORA! - encendiendo la caja =====

REM Aqui se queda parado todo el dia. Solo sigue de largo si el
REM servidor se cayo o alguien lo apago.
call npm start >>"!REGISTRO!" 2>&1

set /a INTENTOS+=1
for /f "usebackq delims=" %%H in (`node -e "const d=new Date(),p=n=>String(n).padStart(2,'0');console.log(p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()))"`) do set "AHORA=%%H"

echo.
echo   [!AHORA!] La caja se apago. Volviendola a encender (intento !INTENTOS!)
>>"!REGISTRO!" echo ===== !AHORA! - se apago, volviendo a encender (intento !INTENTOS!) =====

REM Sin esta espera, si algo esta mal de raiz se reintentaria miles de
REM veces por minuto y llenaria el disco de registros. Despues de cinco
REM intentos seguidos se espera un minuto en vez de cinco segundos.
REM Se usa ping y no timeout porque timeout truena cuando la tarea
REM programada corre sin ventana.
set "ESPERA=6"
if !INTENTOS! GEQ 5 set "ESPERA=61"
ping -n !ESPERA! 127.0.0.1 >nul

goto :bucle
