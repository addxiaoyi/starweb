# Docker 离线部署（无网络环境）

目标：在**无网络 Linux 服务器**上，仅通过 `docker compose up -d` 启动前后端。

## 1) 在有网络机器上构建并打包镜像

在项目根目录 `重构` 执行（需 Docker 已启动，且能联网完成构建）：

**推荐：一键脚本（输出到 `artifacts/starmc-offline-images.tar`）**

- Windows（PowerShell）：`.\scripts\package-offline-docker.ps1`
- Linux / macOS：`chmod +x ./scripts/package-offline-docker.sh && ./scripts/package-offline-docker.sh`

**或手动执行：**

```bash
docker build -t starmc-backend:offline ./backend
docker build -f Dockerfile.frontend -t starmc-frontend:offline .
docker save -o artifacts/starmc-offline-images.tar starmc-backend:offline starmc-frontend:offline
```

将以下文件拷贝到目标 Linux 服务器（U 盘 / 内网传输）：

- `docker-compose.prod.yml`
- `artifacts/starmc-offline-images.tar`

> 说明：`starmc-offline-images.tar` 体积较大，默认已加入 `.gitignore`，不会随仓库提交；你在本机跑完脚本后，该文件会出现在 `artifacts/` 目录，便于整目录拷贝。

> 可选：如果需要自定义环境变量，可额外拷贝并编辑 `docker-compose.prod.yml`。

## 2) 在无网络 Linux 服务器上加载并启动

```bash
docker load -i artifacts/starmc-offline-images.tar
docker compose -f docker-compose.prod.yml up -d
```

若你只在服务器上放了 `starmc-offline-images.tar`（与 `docker-compose.prod.yml` 同级），则：

```bash
docker load -i starmc-offline-images.tar
docker compose -f docker-compose.prod.yml up -d
```

查看状态：

```bash
docker compose -f docker-compose.prod.yml ps
```

## 3) 访问与健康检查

- 前端：`http://<服务器IP>/`
- 后端 API 健康检查：`http://<服务器IP>:8787/healthz`
- 插件桩健康检查：`http://<服务器IP>:8788/healthz`

## 4) 数据持久化

`docker-compose.prod.yml` 已将后端数据目录挂载为命名卷：

- `starmc_backend_data:/app/data`

即使容器重建，后端本地数据仍会保留。
