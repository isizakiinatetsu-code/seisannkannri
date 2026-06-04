@echo off
cd /d %~dp0
echo 納入管理システム サーバー起動中...
echo.
echo ブラウザで http://localhost:8080 を開いてください
echo 携帯からは http://192.168.1.100:8080 で開けます
echo.
echo サーバーを止めるには このウィンドウを閉じてください
echo.
npm run dev
pause
