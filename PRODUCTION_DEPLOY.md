# 文件中转站 - 生产环境部署指南 (Docker Compose)

本文档详细介绍了如何使用 Docker Compose 在生产环境中部署文件中转站系统。此方案包含了数据持久化、安全性配置和自动重启策略。

## 1. 准备工作

### 1.1 服务器要求
- **操作系统**: Linux (推荐 Ubuntu 20.04/22.04)
- **软件**: Docker Engine (v20.10+), Docker Compose (v2.0+)
- **硬件**: 
  - CPU: 2核+
  - 内存: 4GB+ (推荐)
  - 磁盘: 20GB+ (取决于文件存储需求)

### 1.2 获取代码
将项目代码上传至服务器，或通过 Git 克隆：
```bash
git clone <your-repo-url> file-transfer-station
cd file-transfer-station/file-transfer-station
```
*(注意：请确保进入包含 `docker-compose.prod.yml` 的目录)*

## 2. 配置环境变量

在部署目录下创建一个 `.env` 文件，用于存储敏感信息。**切勿将此文件提交到版本控制系统。**

```bash
# 创建 .env 文件
nano .env
```

将以下内容复制到 `.env` 文件中，并修改密码和密钥：

```env
# ==========================================
# 数据库配置 (务必修改密码!)
# ==========================================
DB_ROOT_PASSWORD=ChangeMe_RootPassword_Complex!
DB_PASSWORD=ChangeMe_UserPassword_Complex!

# ==========================================
# 应用安全配置 (务必修改密钥!)
# ==========================================
# 生成一个随机字符串，至少32位。可以使用 `openssl rand -base64 32` 生成
JWT_SECRET=ChangeMe_JwtSecret_RandomString_AtLeast32Chars

# ==========================================
# 应用基础信息
# ==========================================
NODE_ENV=production
VITE_APP_TITLE=文件中转站
# 初始管理员账号 (首次启动时自动创建)
OWNER_NAME=Admin
OWNER_OPEN_ID=local:admin@example.com

# ==========================================
# OAuth 配置 (如果使用 Manus 登录)
# ==========================================
# 如果仅使用本地登录，以下可保持默认或留空
VITE_APP_ID=your_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im/login
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_api_key
```

## 3. 启动服务

使用 `docker-compose.prod.yml` 启动服务：

```bash
# 后台启动所有服务
docker-compose -f docker-compose.prod.yml up -d
```

### 验证部署
1. 查看容器状态：
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   ```
   应看到 `fts-prod-db` 和 `fts-prod-app` 状态为 `Up`。

2. 查看应用日志：
   ```bash
   docker-compose -f docker-compose.prod.yml logs -f app
   ```
   如果看到 "Server listening on port 3000"，说明启动成功。

## 4. 访问应用

默认情况下，应用运行在服务器的 `3000` 端口。
- 访问地址: `http://<服务器IP>:3000`
- 默认管理员账号: `admin@example.com`
- 默认管理员密码: `adminpassword` (首次登录后请立即修改！)

## 5. 运维管理

### 5.1 数据备份
所有重要数据都已挂载到宿主机目录，备份非常简单。

- **数据库数据**: 存储在 Docker Volume `prod_db_data` 中。
- **用户上传文件**: 存储在当前目录下的 `./uploads` 文件夹。
- **日志文件**: 存储在当前目录下的 `./logs` 文件夹。

**备份命令示例**:
```bash
# 备份上传文件
tar -czvf uploads_backup_$(date +%Y%m%d).tar.gz ./uploads

# 备份数据库 (进入容器导出)
docker exec fts-prod-db mysqldump -u root -p$DB_ROOT_PASSWORD file_transfer_station > db_backup_$(date +%Y%m%d).sql
```

### 5.2 更新应用
当代码有更新时：

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并启动 (Docker 会自动重建镜像)
docker-compose -f docker-compose.prod.yml up -d --build
```

### 5.3 停止服务
```bash
docker-compose -f docker-compose.prod.yml down
```

## 6. 高级配置 (Nginx 反向代理 + HTTPS)

生产环境建议在 Docker 容器前加一层 Nginx 反向代理，并配置 SSL 证书。

### Nginx 配置示例
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 允许大文件上传
        client_max_body_size 1024M;
    }
}
```

## 7. 故障排查

- **数据库连接失败**: 检查 `.env` 中的密码是否与 `docker-compose.prod.yml` 中的一致。
- **文件上传失败**: 检查 `./uploads` 目录是否有写入权限 (通常 Docker 会自动处理)。
- **应用无法启动**: 使用 `docker-compose -f docker-compose.prod.yml logs app` 查看详细报错信息。
