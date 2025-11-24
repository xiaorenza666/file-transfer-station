@echo off
REM 文件中转站 - Windows一键部署脚本
REM 使用方法: 双击运行 deploy.bat

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo   文件中转站系统 - 一键部署
echo ==========================================
echo.

REM 检查Node.js
echo [1/5] 检查环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ❌ Node.js未安装
    echo 请访问 https://nodejs.org 下载并安装 Node.js 18+
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✓ Node.js %NODE_VERSION%

REM 检查pnpm
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ⚠️  pnpm未安装，正在安装...
    call npm install -g pnpm
)

REM 安装依赖
echo.
echo [2/5] 安装依赖...
call pnpm install
if errorlevel 1 (
    echo.
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)
echo ✓ 依赖安装完成

REM 配置环境变量
echo.
echo [3/5] 配置环境...

if not exist ".env.local" (
    echo 创建 .env.local 文件...
    (
        echo # 数据库配置
        echo DATABASE_URL="file:./data.db"
        echo.
        echo # OAuth配置
        echo VITE_APP_ID="test_app_id"
        echo OAUTH_SERVER_URL="https://api.manus.im"
        echo VITE_OAUTH_PORTAL_URL="https://manus.im/login"
        echo.
        echo # JWT密钥
        echo JWT_SECRET="your_secret_key_min_32_chars_generated"
        echo.
        echo # 文件存储
        echo BUILT_IN_FORGE_API_URL="https://api.manus.im"
        echo BUILT_IN_FORGE_API_KEY="test_key"
        echo.
        echo # 应用配置
        echo VITE_APP_TITLE="文件中转站"
        echo VITE_APP_LOGO="/logo.svg"
        echo.
        echo # 所有者信息
        echo OWNER_NAME="Admin"
        echo OWNER_OPEN_ID="admin_openid"
        echo.
        echo # 环境
        echo NODE_ENV="development"
    ) > .env.local
    echo ✓ 配置文件已创建
) else (
    echo ✓ 配置文件已存在
)

REM 初始化数据库
echo.
echo [4/5] 初始化数据库...
call pnpm db:push
if errorlevel 1 (
    echo.
    echo ❌ 数据库初始化失败
    pause
    exit /b 1
)
echo ✓ 数据库初始化完成

REM 启动应用
echo.
echo [5/5] 启动应用...
echo.
echo ==========================================
echo   ✓ 部署完成！
echo ==========================================
echo.
echo 应用已启动，访问地址：
echo   http://localhost:3000
echo.
echo 首次使用提示：
echo   1. 打开浏览器访问 http://localhost:3000
echo   2. 点击'登录'使用Manus账户登录
echo   3. 上传文件并获取分享链接
echo   4. 访问 http://localhost:3000/admin 进入管理后台
echo.
echo 停止应用：
echo   按 Ctrl+C 停止服务
echo.

call pnpm dev

pause
