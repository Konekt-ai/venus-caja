@echo off
REM ============================================================
REM  VENUS CAJA - Afinar las tareas programadas
REM
REM  schtasks /create no sabe fijar dos cosas que importan, y las
REM  deja como vienen de fabrica:
REM
REM  - El limite de ejecucion queda en 72 horas, y al cumplirse
REM    Windows MATA la tarea. Como "Venus Caja" es el servidor y
REM    corre sin parar, la caja se apagaria sola al tercer dia de
REM    prendida la computadora, a media jornada. Aqui se le quita
REM    el limite.
REM  - No hay reintentos. Si el servidor truena justo al arrancar
REM    (la base todavia no esta a la mano, por ejemplo), Windows se
REM    rendia a la primera. Aqui se le ponen reintentos.
REM
REM  Se puede correr las veces que sea: siempre deja lo mismo. Lo
REM  llaman INSTALAR.bat y ACTUALIZAR.bat, y tambien se puede correr
REM  a mano desde una ventana de administrador si una instalacion
REM  vieja quedo con el limite puesto.
REM
REM  Necesita PowerShell porque schtasks no llega a estos ajustes;
REM  la computadora que corre la caja es Windows 10 u 11 (asi lo
REM  pide docs\INSTALACION.md), ahi siempre esta.
REM ============================================================
set "FALLO=0"

REM El servidor: sin limite de tiempo, con reintentos por minuto, y que
REM ni la pila de una laptop lo detenga.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Set-ScheduledTask -TaskName 'Venus Caja' -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable) -ErrorAction Stop | Out-Null } catch { exit 1 }" >nul 2>nul
if errorlevel 1 set "FALLO=1"

REM El respaldo diario: una hora le sobra (tarda segundos); si la
REM computadora estaba apagada a las 22:30, se hace al prenderla.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Set-ScheduledTask -TaskName 'Venus Caja respaldo' -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -StartWhenAvailable) -ErrorAction Stop | Out-Null } catch { exit 1 }" >nul 2>nul
if errorlevel 1 set "FALLO=1"

exit /b %FALLO%
