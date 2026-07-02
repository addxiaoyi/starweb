@echo off
chcp 65001 > nul
echo ========================================
echo StarMC 前端一键部署脚本
echo ========================================
echo.

cd /d "D:\qwq\项目\————————————————————————\starmc-website"

echo [1/4] 推送代码到服务器...
git push origin master
if %errorlevel% neq 0 (
    echo ❌ Git push 失败，请检查网络或权限
    pause
    exit /b 1
)
echo ✓ 代码推送成功
echo.

echo [2/4] 正在连接服务器...
echo 服务器: root@103.236.92.10
echo 请先设置环境变量 STARMC_DEPLOY_PASSWORD
echo.
echo 请在弹出的 SSH 窗口中粘贴以下命令：
echo.
echo ----------------------------------------
echo cd /root/starmc-website ^&^& bash deploy-baota.sh
echo ----------------------------------------
echo.
pause
if "%STARMC_DEPLOY_PASSWORD%"=="" (
    echo STARMC_DEPLOY_PASSWORD is required
    pause
    exit /b 1
)
ssh root@103.236.92.10

echo.
echo [3/4] 等待 20 秒让服务重启...
timeout /t 20 /nobreak > nul

echo [4/4] 验证部署...
curl -sS -o nul -w "HTTP状态: %%{http_code}\n响应时间: %%{time_total}秒\n" https://star-web.top/skins

echo.
echo ========================================
echo ✅ 部署流程完成！
echo ========================================
echo.
echo 请访问测试: https://star-web.top/skins
echo - 点击 '皮肤/披风' 切换应该平滑滑动
echo - 点击 '最新/热度' 应该有动画
echo - 点击 '更多筛选' 查看标签/来源
echo.
pause
