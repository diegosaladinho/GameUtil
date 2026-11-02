@echo off
chcp 65001 >nul
echo ============================================
echo  GameUtil - compilar version portable
echo ============================================
where node >nul 2>nul || (echo Necesitas instalar Node.js 18 o superior desde https://nodejs.org & pause & exit /b 1)
call npm install || (echo Fallo en npm install & pause & exit /b 1)
call npm test || (echo Las pruebas han fallado & pause & exit /b 1)
call npm run dist || (echo Fallo al compilar & pause & exit /b 1)
call npm run checksums
echo.
echo Listo: dist\GameUtil-Portable-*.exe
echo Los datos de la app se guardan en %%APPDATA%%\GameUtil
pause
