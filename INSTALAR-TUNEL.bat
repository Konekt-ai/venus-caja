@echo off
REM ============================================================
REM  VENUS CAJA - Instalacion del tunel de Cloudflare
REM  Se corre UNA vez, en la computadora de la BODEGA, como
REM  administrador, DESPUES de crear el tunel en Cloudflare.
REM
REM  El tunel publica la caja en https://caja.tudominio.com sin
REM  abrir puertos en el modem: se conecta de adentro hacia
REM  afuera, como cuando uno abre una pagina. Los pasos previos
REM  (cuenta, dominio, crear el tunel) vienen en docs\INSTALACION.md
REM  seccion 3; este archivo automatiza lo que toca hacer en esta
REM  computadora: bajar cloudflared.exe e instalarlo como servicio
REM  de Windows con el token que da Cloudflare, para que arranque
REM  solo al prender, igual que la caja.
REM
REM  Uso:  INSTALAR-TUNEL.bat            (pide el token)
REM        INSTALAR-TUNEL.bat  eyJ...    (ya con el token)
REM ============================================================
setlocal
title Venus Caja - Tunel de Cloudflare
cd /d "%~dp0"

set "CARPETA_TUNEL=C:\Venus"
set "EXE_TUNEL=C:\Venus\cloudflared.exe"
set "DESCARGA=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

echo.
echo   ============================================
echo      VENUS CAJA - Tunel de Cloudflare
echo   ============================================
echo.

REM --- Permisos ------------------------------------------------
REM Instalar un servicio de Windows los necesita si o si.
net session >nul 2>nul
if errorlevel 1 (
  echo   [alto] Esto necesita permisos de administrador.
  echo.
  echo   Cierra esta ventana, dale BOTON DERECHO al archivo
  echo   INSTALAR-TUNEL.bat y elige "Ejecutar como administrador".
  echo.
  pause
  exit /b 1
)

REM --- Si ya estaba instalado ----------------------------------
sc query Cloudflared >nul 2>nul
if not errorlevel 1 (
  echo   [aviso] El servicio del tunel YA esta instalado en esta
  echo           computadora. Si lo que quieres es cambiarlo de
  echo           cuenta o de token, primero quitalo con:
  echo.
  echo             "%EXE_TUNEL%" service uninstall
  echo.
  echo           y vuelve a correr este archivo.
  echo.
  pause
  exit /b 1
)

REM --- El token ------------------------------------------------
REM Es la tira larguisima que Cloudflare ensena al crear el tunel:
REM Zero Trust ^> Networks ^> Tunnels ^> venus-caja ^> Install connector.
REM Del comando que muestra, el token es la ultima palabra (empieza
REM con eyJ). Aqui se puede pegar solo, sin el resto del comando.
REM Se toma con %* y no con %~1 porque cmd parte los argumentos en los
REM signos de igual, y un token base64 puede terminar en == que se
REM perderia sin que nadie se de cuenta.
set "TOKEN=%*"
if defined TOKEN goto :con_token

echo   Falta pegar el token del tunel. Esta en la pagina de
echo   Cloudflare donde creaste el tunel venus-caja: es la tira
echo   larguisima de letras al final del comando que te ensena
echo   (empieza con eyJ). Copiala y pegala aqui con clic derecho.
echo.
set /p "TOKEN=  Token: "

:con_token
if not defined TOKEN (
  echo.
  echo   [alto] No llego ningun token. Vuelve a correr este archivo.
  echo.
  pause
  exit /b 1
)
REM Al copiar del navegador a veces se pegan comillas o espacios de mas,
REM y una comilla suelta tumba el batch sin decir nada. Un token base64
REM no trae ni lo uno ni lo otro, asi que quitarlos siempre es seguro.
set "TOKEN=%TOKEN:"=%"
if defined TOKEN set "TOKEN=%TOKEN: =%"
if not defined TOKEN (
  echo.
  echo   [alto] El token quedo vacio. Vuelve a correr este archivo.
  echo.
  pause
  exit /b 1
)
if not "%TOKEN:~0,3%"=="eyJ" (
  echo.
  echo   [aviso] Un token de Cloudflare empieza con eyJ y este no.
  echo           Puede que se haya pegado el comando completo en vez
  echo           de solo el token. Se intenta de todos modos.
  echo.
)

REM --- 1. Bajar cloudflared ------------------------------------
echo.
echo   ------------------------------------------------
echo    Paso 1 de 3: bajando el programa del tunel
echo   ------------------------------------------------
echo.
if not exist "%CARPETA_TUNEL%" mkdir "%CARPETA_TUNEL%"

if exist "%EXE_TUNEL%" (
  echo   [ok] Ya estaba bajado en %EXE_TUNEL%, se usa ese.
  echo        Para forzar una version nueva, borralo y corre esto
  echo        otra vez.
  goto :ya_bajado
)

REM curl viene incluido en Windows 10 y 11, que es lo que pide la
REM computadora de la bodega. El -L es porque GitHub redirige la
REM descarga; --fail es para que un error de la pagina no deje un
REM archivo de mentiras.
curl -L --fail -o "%EXE_TUNEL%" "%DESCARGA%"
if errorlevel 1 (
  REM Una descarga cortada a la mitad deja un archivo incompleto que en
  REM la siguiente corrida pasaria por bueno; mejor que no quede nada.
  if exist "%EXE_TUNEL%" del "%EXE_TUNEL%" >nul 2>nul
  echo.
  echo   [alto] No se pudo bajar. Revisa que haya internet y vuelve
  echo          a intentar. Tambien se puede bajar a mano de:
  echo          %DESCARGA%
  echo          y guardarlo como %EXE_TUNEL%
  echo.
  pause
  exit /b 1
)
echo   [ok] Bajado en %EXE_TUNEL%

:ya_bajado

REM --- 2. Instalarlo como servicio -----------------------------
echo.
echo   ------------------------------------------------
echo    Paso 2 de 3: dejandolo como servicio de Windows
echo   ------------------------------------------------
echo.
"%EXE_TUNEL%" service install "%TOKEN%"
if errorlevel 1 (
  echo.
  echo   [alto] No se pudo instalar el servicio. Casi siempre es que
  echo          el token quedo incompleto al copiarlo: vuelve a la
  echo          pagina de Cloudflare, copia el token otra vez y corre
  echo          este archivo de nuevo.
  echo.
  pause
  exit /b 1
)

REM --- 3. Comprobar que quedo corriendo ------------------------
echo.
echo   ------------------------------------------------
echo    Paso 3 de 3: comprobando que el tunel este vivo
echo   ------------------------------------------------
echo.
REM El servicio arranca solo al instalarse, pero tarda unos
REM segundos en levantar y conectarse.
ping -n 6 127.0.0.1 >nul
sc query Cloudflared | findstr /i "RUNNING" >nul
if errorlevel 1 (
  net start Cloudflared >nul 2>nul
  ping -n 6 127.0.0.1 >nul
)
sc query Cloudflared | findstr /i "RUNNING" >nul
if errorlevel 1 (
  echo   [aviso] El servicio quedo instalado pero no se ve corriendo.
  echo           Reinicia la computadora y revisa en Cloudflare si el
  echo           tunel aparece como HEALTHY. Si no, toma una foto de lo
  echo           que dice arriba y mandala.
) else (
  echo   [ok] El tunel esta corriendo y arranca solo con Windows.
)

echo.
echo   ============================================
echo      Ya casi. Faltan dos cosas EN LA PAGINA
echo   ============================================
echo.
echo   1. En Cloudflare, en el mismo tunel, llenar la ruta publica:
echo        Subdomain: caja      Domain: tu dominio
echo        Type: HTTP           URL: localhost:3001
echo      OJO: 3001 es la caja. El 3000 es la bodega y ese NO se
echo      publica.
echo.
echo   2. Probar desde un celular SIN el WiFi de la bodega que abra
echo        https://caja.tudominio.com
echo.
echo   Los pasos con mas detalle: docs\INSTALACION.md, seccion 3.
echo.
pause
exit /b 0
