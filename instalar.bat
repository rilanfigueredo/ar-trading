@echo off
chcp 65001 >nul
title Ar_Trading - Instalacion
echo.
echo === Ar_Trading: instalacion de componentes ===
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js en tu PC.
  echo 1. Entra a https://nodejs.org y descarga la version "LTS".
  echo 2. Instalala con todas las opciones por defecto.
  echo 3. Cierra esta ventana y vuelve a abrir instalar.bat
  echo.
  pause
  exit /b 1
)
echo Instalando ^(puede tardar unos minutos, necesita internet^)...
call npm install
if errorlevel 1 (
  echo.
  echo Hubo un error. Copia el mensaje de arriba y envialo a Claude.
  pause
  exit /b 1
)
echo.
echo Listo. Ahora abre iniciar.bat para usar el programa.
pause
