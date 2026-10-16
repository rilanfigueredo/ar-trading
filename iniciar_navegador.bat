@echo off
chcp 65001 >nul
title Ar_Trading (modo navegador)
echo Abriendo en tu navegador: http://localhost:3000
echo Deja esta ventana abierta mientras uses el programa.
start "" http://localhost:3000
node server.js
pause
