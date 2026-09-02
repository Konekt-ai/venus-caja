@echo off
REM ============================================================
REM  VENUS CAJA - Instalacion
REM  Se corre UNA sola vez, en la computadora de la BODEGA.
REM  Boton derecho sobre este archivo > Ejecutar como administrador.
REM ============================================================
setlocal enabledelayedexpansion
title Venus Caja - Instalacion
cd /d "%~dp0"
set "CARPETA=%~dp0"
set "PUERTO=3001"

echo.
echo   ============================================
echo      VENUS CAJA - Instalacion
echo   ============================================
echo.
echo   Esto se hace una sola vez y tarda unos minutos.
echo   No cierres la ventana hasta que diga que termino.
echo.

REM --- Permisos ------------------------------------------------
REM Se necesitan para dejar programado que la caja encienda sola
REM cuando prenden la computadora.
net session >nul 2>nul
if errorlevel 1 (
  echo   [alto] Esta instalacion necesita permisos de administrador.
  echo.
  echo   Cierra esta ventana, dale BOTON DERECHO al archivo INSTALAR.bat
  echo   y elige "Ejecutar como administrador".
  echo.
  pause
  exit /b 1
)

REM --- Node.js -------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   [alto] Falta instalar Node.js en esta computadora.
  echo.
  echo   Descargalo gratis de:  https://nodejs.org
  echo   Elige la version "LTS", instalalo, y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)
set "VERSION_NODE="
for /f "usebackq delims=" %%V in (`node -v`) do set "VERSION_NODE=%%V"
echo   [ok] Node.js !VERSION_NODE! instalado.
echo.

REM --- 1. Dependencias -----------------------------------------
echo   ------------------------------------------------
echo    Paso 1 de 5: instalando lo que necesita el programa
echo   ------------------------------------------------
echo   Este es el paso mas tardado. Ten paciencia.
echo.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo   [alto] No se pudo instalar. Revisa que haya internet
  echo          y vuelve a abrir INSTALAR.bat.
  echo.
  pause
  exit /b 1
)

REM --- 2. Configuracion ----------------------------------------
echo.
echo   ------------------------------------------------
echo    Paso 2 de 5: configuracion de esta computadora
echo   ------------------------------------------------
echo.

if exist ".env.local" (
  echo   Ya existe el archivo .env.local con la configuracion de esta
  echo   computadora, asi que no se toca. Si hay que cambiar algo,
  echo   se abre con el Bloc de notas.
  goto :ya_configurado
)

if not exist ".env.ejemplo" (
  echo   [alto] Falta el archivo .env.ejemplo. La copia del repositorio
  echo          quedo incompleta. Vuelve a hacer el git clone.
  echo.
  pause
  exit /b 1
)

REM Se propone la carpeta hermana porque asi quedan los dos proyectos
REM cuando se clonan uno al lado del otro.
set "SUGERIDA="
for %%I in ("!CARPETA!..\venus-gestion\data\venus.db") do set "SUGERIDA=%%~fI"
if not exist "!SUGERIDA!" set "SUGERIDA="

echo   Dime donde esta la base de datos del sistema de bodega.
echo   Es el archivo  venus.db  del sistema que ya usan alla.
echo   La caja no tiene base propia: escribe en la misma, y por eso
echo   al cobrar baja el inventario de verdad.
echo.
if defined SUGERIDA (
  echo   La encontre aqui:
  echo     !SUGERIDA!
  echo.
  echo   Dale ENTER para usar esa, o escribe otra ruta completa.
) else (
  echo   No la encontre sola. Escribe la ruta completa del archivo,
  echo   por ejemplo:  C:\Venus\venus-gestion\data\venus.db
)
echo.
set "RUTA_BASE="
set /p "RUTA_BASE=  Ruta: "
if not defined RUTA_BASE set "RUTA_BASE=!SUGERIDA!"
if not defined RUTA_BASE (
  echo.
  echo   [alto] No escribiste ninguna ruta. Vuelve a abrir INSTALAR.bat.
  echo.
  pause
  exit /b 1
)

REM Si arrastraron el archivo a la ventana, la ruta viene entre comillas.
for /f "delims=" %%A in ("!RUTA_BASE!") do set "RUTA_BASE=%%~A"

if not exist "!RUTA_BASE!" (
  echo.
  echo   [aviso] No hay ningun archivo en:
  echo           !RUTA_BASE!
  echo.
  echo   Se va a guardar de todos modos, pero la caja no va a encender
  echo   hasta que la ruta sea la correcta. Se corrige abriendo el
  echo   archivo .env.local con el Bloc de notas.
  echo.
  pause
)

echo.
echo   Ahora la contrasena del duenio. Es la que abre Reportes,
echo   Productos y Ajustes. Las vendedoras entran con su PIN, esta
echo   es aparte. Dale ENTER para dejar la de fabrica (1234), pero
echo   mejor cambiala.
echo.
set "PIN_DUENIO="
set /p "PIN_DUENIO=  Contrasena del duenio: "
if not defined PIN_DUENIO set "PIN_DUENIO=1234"

REM En el archivo .env la ruta va con diagonales normales, aunque
REM Windows las escriba al reves.
set "RUTA_ENV=!RUTA_BASE:\=/!"

set "LLAVE="
for /f "usebackq delims=" %%K in (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) do set "LLAVE=%%K"
if not defined LLAVE (
  echo   [alto] No se pudo generar la llave de seguridad.
  echo.
  pause
  exit /b 1
)

REM Se copia el .env.ejemplo linea por linea cambiando solo tres valores,
REM para que los comentarios que explican cada cosa lleguen tambien al
REM archivo de verdad. findstr /n numera las lineas porque el for /f se
REM brinca las vacias y el archivo quedaria todo apelmazado.
> ".env.local" (
  for /f "usebackq delims=" %%L in (`findstr /n "^" ".env.ejemplo"`) do (
    set "LINEA=%%L"
    set "LINEA=!LINEA:*:=!"
    if "!LINEA:~0,9!"=="VENUS_DB=" (
      echo VENUS_DB=!RUTA_ENV!
    ) else if "!LINEA:~0,19!"=="VENUS_LLAVE_SESION=" (
      echo VENUS_LLAVE_SESION=!LLAVE!
    ) else if "!LINEA:~0,17!"=="VENUS_PIN_DUENIO=" (
      echo VENUS_PIN_DUENIO=!PIN_DUENIO!
    ) else (
      echo(!LINEA!
    )
  )
)

echo   [ok] Se creo el archivo .env.local con:
echo        Base de datos:      !RUTA_ENV!
echo        Llave de sesion:    una llave nueva al azar
echo        Contrasena duenio:  la que acabas de escribir

:ya_configurado

REM --- 3. Compilar ---------------------------------------------
echo.
echo   ------------------------------------------------
echo    Paso 3 de 5: preparando el programa
echo   ------------------------------------------------
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo   [alto] No se pudo preparar el programa.
  echo          Toma una foto de lo que dice arriba y mandala.
  echo.
  pause
  exit /b 1
)
echo.
echo   [ok] El programa quedo listo.

REM --- 4. Tareas programadas -----------------------------------
echo.
echo   ------------------------------------------------
echo    Paso 4 de 5: dejarlo funcionando solo
echo   ------------------------------------------------
echo.

if not exist "logs" mkdir "logs"
if not exist "respaldos" mkdir "respaldos"

schtasks /create /tn "Venus Caja" /tr "\"!CARPETA!scripts\servidor.bat\"" /sc onstart /ru SYSTEM /rl HIGHEST /f >nul 2>nul
if errorlevel 1 (
  echo   [aviso] No se pudo programar el encendido automatico.
  echo           La caja va a funcionar igual, pero cada vez que
  echo           prendan la computadora hay que abrir INICIAR.bat.
) else (
  echo   [ok] Encendido automatico: cuando prendan esta computadora,
  echo        la caja se levanta sola, sin que nadie abra nada.
)

schtasks /create /tn "Venus Caja respaldo" /tr "node \"!CARPETA!scripts\respaldo.mjs\"" /sc daily /st 22:30 /ru SYSTEM /rl HIGHEST /f >nul 2>nul
if errorlevel 1 (
  echo   [aviso] No se pudo programar el respaldo diario.
  echo           Se puede sacar a mano cuando quieras abriendo una
  echo           ventana aqui y escribiendo:  npm run respaldo
) else (
  echo   [ok] Respaldo diario: todas las noches a las 22:30 se guarda
  echo        una copia de la base en la carpeta respaldos\.
  echo        Se guardan los ultimos 30 dias, los mas viejos se borran.
)

REM schtasks no sabe fijar ni el limite de ejecucion ni los reintentos.
REM El limite de fabrica es de 72 horas y Windows MATA la tarea al
REM cumplirlo: la caja se apagaria sola al tercer dia de prendida.
call "!CARPETA!scripts\afinar-tareas.bat"
if errorlevel 1 (
  echo   [aviso] Las tareas quedaron con el limite de 72 horas que trae
  echo           Windows. Cuando puedas, corre como administrador:
  echo           scripts\afinar-tareas.bat
) else (
  echo   [ok] Sin limite de tiempo y con reintentos: la caja no se
  echo        apaga sola aunque la computadora dure semanas prendida.
)

REM --- 5. Probar el respaldo y mostrar direcciones --------------
echo.
echo   ------------------------------------------------
echo    Paso 5 de 5: probando el respaldo
echo   ------------------------------------------------
echo.
REM Se saca un respaldo aqui mismo para comprobar, antes de irse, que la
REM ruta de la base quedo bien. Si esta mal, se ve ahorita y no en la
REM primera venta.
node scripts\respaldo.mjs
if errorlevel 1 (
  echo.
  echo   [aviso] El respaldo no se pudo hacer. Casi siempre es porque
  echo           la ruta de la base quedo mal. Abre el archivo .env.local
  echo           con el Bloc de notas y revisa la linea VENUS_DB.
)

echo.
echo   ============================================
echo      Listo. La caja quedo instalada.
echo   ============================================
echo.
echo   En esta computadora se entra en:
echo       http://localhost:!PUERTO!
echo.
echo   Desde otra computadora de la misma red, con alguna de estas:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo       http://%%a:!PUERTO!
echo.
echo   Para que la tienda entre por internet falta el tunel de
echo   Cloudflare. Viene explicado paso a paso en:
echo       docs\INSTALACION.md
echo.
echo   Para encender la caja ahora mismo sin reiniciar, cierra esta
echo   ventana y abre INICIAR.bat.
echo.
pause
exit /b 0
