@echo off
chcp 65001 >nul
title Atendente IA - NAO FECHE ESTA JANELA
cd /d "%~dp0"
node scripts\iniciar.mjs
pause
