#!/bin/bash

# 文件中转站 - 一键部署脚本
# 使用方法: bash deploy.sh

set -e

echo "=========================================="
echo "  文件中转站系统 - 一键部署"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查Node.js
echo -e "${YELLOW}[1/5] 检查环境...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js未安装${NC}"
    echo "请访问 https://nodejs.org 安装 Node.js 18+"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠️  pnpm未安装，正在安装...${NC}"
    npm install -g pnpm
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION}${NC}"

# 安装依赖
echo ""
echo -e "${YELLOW}[2/5] 安装依赖...${NC}"
pnpm install
echo -e "${GREEN}✓ 依赖安装完成${NC}"

# 配置环境变量
echo ""
echo -e "${YELLOW}[3/5] 配置环境...${NC}"

if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}创建 .env.local 文件...${NC}"
    cat > .env.local << 'EOF'
# 数据库配置
# 默认使用内存数据库（重启后数据丢失）。如果要使用 MySQL，请取消注释并配置：
# DATABASE_URL="mysql://user:password@localhost:3306/dbname"

# S3 对象存储配置（可选）
# 默认存储在本地 uploads/ 目录。如果要使用 S3，请取消注释并配置：
# S3_ENDPOINT=https://s3.example.com
# S3_REGION=auto
# S3_BUCKET=your-bucket-name
# S3_ACCESS_KEY_ID=your_access_key
# S3_SECRET_ACCESS_KEY=your_secret_key

# OAuth配置（测试用）
VITE_APP_ID="test_app_id"
OAUTH_SERVER_URL="https://api.manus.im"
VITE_OAUTH_PORTAL_URL="https://manus.im/login"

# JWT密钥（自动生成）
JWT_SECRET="your_secret_key_min_32_chars_generated"

# 应用配置
VITE_APP_TITLE="文件中转站"
VITE_APP_LOGO="/logo.svg"

# 所有者信息
OWNER_NAME="Admin"
OWNER_OPEN_ID="admin_openid"

# 环境
NODE_ENV="development"
EOF
    echo -e "${GREEN}✓ 配置文件已创建${NC}"
else
    echo -e "${GREEN}✓ 配置文件已存在${NC}"
fi

# 初始化数据库
echo ""
echo -e "${YELLOW}[4/5] 初始化数据库...${NC}"
if grep -q "^DATABASE_URL=mysql" .env.local 2>/dev/null || [ -n "$DATABASE_URL" ]; then
    echo "检测到 MySQL 配置，正在运行数据库迁移..."
    pnpm db:push
    echo -e "${GREEN}✓ 数据库初始化完成${NC}"
else
    echo "未检测到 MySQL 配置，将使用内存数据库模式（重启后数据丢失）"
    echo "如需持久化存储，请在 .env.local 中配置 DATABASE_URL"
fi

# 启动应用
echo ""
echo -e "${YELLOW}[5/5] 启动应用...${NC}"
echo ""
echo -e "${GREEN}=========================================="
echo "  ✓ 部署完成！"
echo "=========================================="
echo ""
echo -e "${GREEN}应用已启动，访问地址：${NC}"
echo -e "${GREEN}  http://localhost:3000${NC}"
echo ""
echo -e "${YELLOW}首次使用提示：${NC}"
echo "  1. 打开浏览器访问 http://localhost:3000"
echo "  2. 点击'登录'使用Manus账户登录"
echo "  3. 上传文件并获取分享链接"
echo "  4. 访问 http://localhost:3000/admin 进入管理后台"
echo ""
echo -e "${YELLOW}停止应用：${NC}"
echo "  按 Ctrl+C 停止服务"
echo ""

# 启动开发服务器
pnpm dev
