@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
start "starmc-backend" cmd /k "npm run dev"
cd /d "%~dp0frontend"
start "starmc-frontend" cmd /k "npm run dev"
echo [StarMC] 已打开两个窗口：后端 + 前端。请用浏览器访问 http://localhost:5173
echo [StarMC] 若登录仍失败，请先关闭占用 8787/8788 的旧后端窗口，再重新运行本脚本。
pause
