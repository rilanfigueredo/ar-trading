@echo off
chcp 65001 >nul
title Ar_Trading
if not exist node_modules (
  echo Primero ejecuta instalar.bat
  pause
  exit /b 1
)
call npm start
