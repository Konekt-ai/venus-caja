@echo off
REM ============================================================
REM  VENUS CAJA - Actualizacion
REM  Trae la version nueva y la deja funcionando. Si la version
REM  nueva no sirve, se regresa sola a la de antes: la tienda
REM  NUNCA se queda sin poder cobrar.
REM
REM  Doble clic:                 actualiza y espera a que leas el resultado.
REM  ACTUALIZAR.bat --silencioso: no pregunta ni espera nada. Asi la
REM                               llama el boton de actualizar desde casa.
REM ============================================================
setlocal enabledelayedexpansion
title Venus Caja - Actualizacion
cd /d "%~dp0"

set "SILENCIOSO=0"
if /i "%~1"=="--silencioso" set "SILENCIOSO=1"
set "CODIGO=0"

echo.
echo   ==========================================
echo      VENUS CAJA - Actualizacion
echo   ==========================================
echo.

REM --- Que este todo lo que hace falta -------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   [alto] Falta Node.js. No se actualizo nada.
  set "CODIGO=1"
  goto :fin
)
where git >nul 2>nul
if errorlevel 1 (
  echo   [alto] Falta Git en esta computadora. No se actualizo nada.
  echo          Descargalo de https://git-scm.com
  set "CODIGO=1"
  goto :fin
)
if not exist ".git" (
  echo   [alto] Esta carpeta no vino de un git clone, asi que no hay
  echo          de donde bajar la version nueva. No se toco nada.
  set "CODIGO=1"
  goto :fin
)

REM --- 1. Respaldo antes de tocar nada -------------------------
echo   ------------------------------------------------
echo    Paso 1 de 6: respaldando la base
echo   ------------------------------------------------
echo.
node scripts\respaldo.mjs
if errorlevel 1 (
  echo.
  echo   [alto] No se pudo respaldar la base, asi que no se actualizo
  echo          nada. La caja sigue funcionando igual que antes.
  set "CODIGO=1"
  goto :fin
)

REM --- 2. Anotar donde estamos ---------------------------------
echo.
echo   ------------------------------------------------
echo    Paso 2 de 6: anotando la version de ahorita
echo   ------------------------------------------------
echo.
set "COMMIT="
for /f "usebackq delims=" %%C in (`git rev-parse HEAD`) do set "COMMIT=%%C"
if not defined COMMIT (
  echo   [alto] No se pudo leer la version actual. No se toco nada.
  set "CODIGO=1"
  goto :fin
)
echo   Version de ahorita: !COMMIT:~0,8!
echo   Si la nueva falla, aqui es donde se regresa.

REM --- 3. Bajar la version nueva -------------------------------
echo.
echo   ------------------------------------------------
echo    Paso 3 de 6: bajando la version nueva
echo   ------------------------------------------------
echo.
REM --ff-only para que nunca invente una mezcla rara si alguien
REM alcanzo a cambiar archivos aqui: mejor que falle y avise.
git pull --ff-only
if errorlevel 1 (
  echo.
  echo   [alto] No se pudo bajar la version nueva. Puede ser que no
  echo          haya internet, o que alguien haya cambiado archivos
  echo          en esta computadora.
  echo          No se toco nada: la caja sigue funcionando.
  set "CODIGO=1"
  goto :fin
)

set "NUEVO="
for /f "usebackq delims=" %%C in (`git rev-parse HEAD`) do set "NUEVO=%%C"
if "!NUEVO!"=="!COMMIT!" (
  echo.
  echo   Ya estaba en la ultima version, no habia nada nuevo que bajar.
  echo   No se reinicio la caja para no interrumpir a la tienda.
  set "CODIGO=0"
  goto :fin
)
echo   Version nueva: !NUEVO:~0,8!

REM --- 4. Instalar lo que haga falta ---------------------------
echo.
echo   ------------------------------------------------
echo    Paso 4 de 6: instalando lo que haga falta
echo   ------------------------------------------------
echo.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo   [alto] Fallo la instalacion.
  goto :regresarse
)

REM --- 5. Preparar el programa ---------------------------------
echo.
echo   ------------------------------------------------
echo    Paso 5 de 6: preparando el programa
echo   ------------------------------------------------
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo   [alto] La version nueva no compila.
  goto :regresarse
)
if not exist ".next\BUILD_ID" (
  echo.
  echo   [alto] La compilacion quedo a medias.
  goto :regresarse
)
echo.
echo   [ok] La version nueva quedo lista.

REM Las instalaciones viejas dejaron las tareas programadas con el limite
REM de 72 horas de fabrica, que apaga la caja sola al tercer dia. Se afina
REM aqui para que la maquina del cliente se corrija en la siguiente
REM actualizacion, sin que nadie tenga que entrar a mano.
call scripts\afinar-tareas.bat
if errorlevel 1 (
  echo   [aviso] No se pudieron afinar las tareas programadas. Corre
  echo           scripts\afinar-tareas.bat como administrador.
) else (
  echo   [ok] Tareas programadas sin limite de 72 horas y con reintentos.
)

REM --- 6. Reiniciar --------------------------------------------
echo.
echo   ------------------------------------------------
echo    Paso 6 de 6: reiniciando la caja
echo   ------------------------------------------------
echo.
call :reiniciar

echo.
echo   ==========================================
echo      Listo. La caja quedo actualizada.
echo   ==========================================
echo   Paso de la version !COMMIT:~0,8! a la !NUEVO:~0,8!
set "CODIGO=0"
goto :fin


REM ============================================================
REM  Regresarse a la version de antes
REM ============================================================
:regresarse
echo.
echo   ------------------------------------------------
echo    La version nueva NO sirvio. Regresando a la de antes
echo   ------------------------------------------------
echo.
git reset --hard !COMMIT!
call npm install --no-audit --no-fund
call npm run build
if errorlevel 1 (
  echo.
  echo   [alto] Ojo: tampoco se pudo preparar la version de antes.
  echo          Hablale a Diego. Mientras, la caja sigue encendida
  echo          con lo que ya tenia cargado, no la reinicien.
  set "CODIGO=2"
  goto :fin
)
echo.
echo   [ok] Se quedo como estaba, en la version !COMMIT:~0,8!.
echo        La tienda puede seguir cobrando normal.
call :reiniciar
set "CODIGO=1"
goto :fin


REM ============================================================
REM  Apagar la caja para que se vuelva a levantar solita
REM ============================================================
:reiniciar
REM Se mata SOLO el node que tiene agarrado el puerto 3001, no todos los
REM node de la computadora: en esta misma maquina corre tambien el sistema
REM de bodega, y tumbarlo dejaria a la bodega sin sistema por una
REM actualizacion que ni es suya.
set "MATE=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":3001 .*LISTENING"') do (
  taskkill /f /pid %%P >nul 2>nul
  set "MATE=1"
)
if "!MATE!"=="0" (
  echo   La caja no estaba encendida, no hubo nada que reiniciar.
  exit /b 0
)

echo   Apagada. servidor.bat la vuelve a levantar sola en unos segundos.
ping -n 21 127.0.0.1 >nul

set "VIVA=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":3001 .*LISTENING"') do set "VIVA=1"
if "!VIVA!"=="1" (
  echo   [ok] La caja ya volvio a encender sola.
) else (
  echo   [aviso] La caja no volvio a encender sola. Eso pasa cuando
  echo           nadie tiene abierto INICIAR.bat ni quedo programada.
  echo           Alguien en la bodega tiene que abrir INICIAR.bat.
)
exit /b 0


:fin
echo.
if "!SILENCIOSO!"=="0" pause
exit /b !CODIGO!
