@echo off
chcp 65001 >nul
title Ar_Trading - Crear instalador
if not exist node_modules (
  echo Primero ejecuta instalar.bat
  pause
  exit /b 1
)
echo Creando el instalador de Windows ^(puede tardar varios minutos^)...
call npm run dist
echo.
echo Si todo salio bien, el instalador esta en la carpeta "dist".
pause
