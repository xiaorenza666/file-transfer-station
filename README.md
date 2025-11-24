# File Transfer Station (文件中转站)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)

![Project Preview](./project-preview.svg)

一个安全、私有、功能强大的自托管文件分享平台。支持文件加密、阅后即焚、有效期设置等功能。

## ✨ 主要功能

- 📤 **便捷上传**：支持拖拽上传，大文件断点续传。
- ☁️ **S3 存储支持**：可选对接 AWS S3、MinIO、阿里云 OSS 等兼容 S3 的对象存储服务。
- 👁️ **在线预览**：支持图片、视频、音频、PDF、Word 文档等多种格式在线预览。
- 🔒 **安全分享**：支持设置访问密码，保护隐私文件。
- ⏱️ **有效期控制**：自定义文件过期时间，过期自动清理。
- 🔥 **阅后即焚**：支持设置文件下载一次后自动销毁。
- 📊 **管理后台**：内置强大的管理员仪表盘，查看系统状态、管理用户和文件。
- 🌍 **可视化日志**：基于 IP 的 2D 地图访问日志可视化。
- 🌓 **主题切换**：完美支持明亮/暗黑模式。
- 📱 **响应式设计**：完美适配桌面和移动端设备。

## 🛠️ 技术栈

- **前端**：React 19, Tailwind CSS 4, Shadcn UI, Vite
- **后端**：Node.js, Express, tRPC
- **数据库**：MySQL 8.0, Drizzle ORM
- **部署**：Docker, Docker Compose

## 🚀 快速开始

### 默认管理员账户

系统首次启动时会自动创建一个默认管理员账户：

- **邮箱**: `admin@example.com`
- **密码**: `adminpassword`

> ⚠️ **重要提示**：请在首次登录后立即修改密码！

### 本地开发

1. **克隆仓库**
   ```bash
   git clone https://github.com/xiaorenza666/file-transfer-station.git
   cd file-transfer-station
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **配置环境变量**
   复制 `.env.example` (如果有) 或参考文档创建 `.env` 文件。

4. **初始化数据库**
   ```bash
   pnpm db:push
   ```

5. **启动开发服务器**
   ```bash
   pnpm dev
   ```
   访问 http://localhost:3000

## 📦 部署指南

本项目提供多种部署方式，满足不同需求：

- **[极简部署指南 (SIMPLE_DEPLOY.md)](./SIMPLE_DEPLOY.md)**  
  适合个人用户，Windows/Linux 一键脚本运行，无需复杂配置。

- **[生产环境部署指南 (PRODUCTION_DEPLOY.md)](./PRODUCTION_DEPLOY.md)**  
  适合服务器环境，使用 Docker Compose 进行容器化部署，包含数据持久化和安全配置。

## 📄 许可证

本项目采用 [MIT](./LICENSE) 许可证。
