@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 秋招信库 · 本地投递看板

where node >nul 2>nul
if errorlevel 1 goto no_node

set NODE_MAJOR=
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if "%NODE_MAJOR%"=="" goto no_node
if %NODE_MAJOR% LSS 18 goto old_node

echo 正在启动本地投递看板，稍后会自动打开浏览器。
echo 使用期间请不要关闭这个窗口；关闭窗口即可停止服务。
echo.
node server.mjs --open
if errorlevel 3 if not errorlevel 4 goto already_running
echo.
echo 本地看板已停止。
pause
exit /b

:already_running
rem 看板已经在另一个窗口运行，浏览器已打开，这个窗口几秒后自动关闭
ping -n 4 127.0.0.1 >nul
exit /b

:no_node
echo 没有找到 Node.js。本地投递看板需要 Node.js 18 或更高版本。
echo 即将打开 Node.js 下载页面：请下载“LTS”版本并安装，安装完成后重新双击 start.bat。
start "" "https://nodejs.org/zh-cn/download"
pause
exit /b 1

:old_node
echo 当前 Node.js 版本过低（主版本 %NODE_MAJOR%），本地投递看板需要 18 或更高版本。
echo 即将打开 Node.js 下载页面：请安装新的“LTS”版本后重新双击 start.bat。
start "" "https://nodejs.org/zh-cn/download"
pause
exit /b 1
