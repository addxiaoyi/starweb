# Linux 服务器部署（随仓库携带）

目标：项目在 **Windows / macOS 开发**，可随时 **rsync / scp / git pull** 到 **Linux**，用同一套代码与明确的环境模板上线。

## 1. 服务器依赖

- **Node.js 18+**（推荐 20 LTS；需支持 `node --env-file`）
- **Nginx**（或其它反代）用于 HTTPS、静态 `dist`、反代 `/api`、`/auth`、`/uploads`、`/plugin`
- **SuperTokens Core** 裸机安装于本机或内网（默认 `http://127.0.0.1:3567`，可配 systemd 常驻）
- 可选：**PostgreSQL**（网站扩展表）；不配则仅用 `DATA_DIR` 下 `store.json`

### 1.1 无容器运行（推荐）最小依赖组合

生产可用的最小组合：

1. SuperTokens Core（独立进程）
2. 本仓库 backend（Node）
3. Nginx（静态站点 + 反代）

> 说明：`supertokens-node` 只是 SDK，不能替代 Core 进程。`/auth/signup`、`/auth/signin` 可用的前提是 Core 可达。

### 1.2 SuperTokens Core 裸机常驻（systemd）

仓库已提供模板：

- `deploy/linux/install-supertokens-core-no-docker.sh`
- `deploy/linux/setup-supertokens-core-systemd.sh`
- `deploy/linux/setup-backend-auth-closure.sh`
- `deploy/linux/setup-auth-stack-no-docker.sh`
- `deploy/linux/supertokens-core.env.example`
- `deploy/linux/supertokens-core.service.example`

最快方式（一条命令完成安装 + 生成 env + 写入 systemd + 启动）：

```bash
cd /srv/starmc-website/重构
chmod +x deploy/linux/setup-supertokens-core-systemd.sh
sudo bash deploy/linux/setup-supertokens-core-systemd.sh \
  --plugin postgresql \
  --db-uri "postgresql://supertokens:replace_me@127.0.0.1:5432/supertokens"
```

可选：如果你需要 API Key（后端也要同步 `SUPERTOKENS_API_KEY`）：

```bash
sudo bash deploy/linux/setup-supertokens-core-systemd.sh \
  --plugin postgresql \
  --db-uri "postgresql://supertokens:replace_me@127.0.0.1:5432/supertokens" \
  --api-key "replace_with_strong_key"
```

最小安装步骤（无 Docker，直接从官方镜像仓库提取 Core）：

```bash
# 1) 安装 Core 到 /opt/supertokens（默认 postgresql:11.4.4）
cd /srv/starmc-website/重构
chmod +x deploy/linux/install-supertokens-core-no-docker.sh
sudo bash deploy/linux/install-supertokens-core-no-docker.sh --plugin postgresql --tag 11.4.4

# 如需 MySQL 版本（旧标签）
# sudo bash deploy/linux/install-supertokens-core-no-docker.sh --plugin mysql --tag 10.1.4

# 2) 准备 /etc/supertokens 配置
sudo install -d -o supertokens -g supertokens -m 0750 /etc/supertokens

sudo cp /srv/starmc-website/重构/deploy/linux/supertokens-core.env.example /etc/supertokens/core.env
sudo chmod 600 /etc/supertokens/core.env
sudoedit /etc/supertokens/core.env

# 3) 安装 systemd
sudo cp /srv/starmc-website/重构/deploy/linux/supertokens-core.service.example /etc/systemd/system/supertokens-core.service
sudo systemctl daemon-reload
sudo systemctl enable --now supertokens-core

# 验证 Core 可达
curl -i http://127.0.0.1:3567/hello
sudo systemctl status supertokens-core --no-pager
```

### 1.3 后端认证闭环一键接线（推荐）

Core 启动后，直接把后端连到 Core 并执行 `doctor + healthz`：

```bash
cd /srv/starmc-website/重构
chmod +x deploy/linux/setup-backend-auth-closure.sh
sudo bash deploy/linux/setup-backend-auth-closure.sh \
  --core-uri http://127.0.0.1:3567
```

如果 Core 配了 API Key，同步写入后端：

```bash
sudo bash deploy/linux/setup-backend-auth-closure.sh \
  --core-uri http://127.0.0.1:3567 \
  --core-api-key "replace_with_strong_key"
```

### 1.4 登录系统全链路一键（Core + Backend）

如果你希望一次完成 Core + backend 接线 + doctor 验收，直接用：

```bash
cd /srv/starmc-website/重构
chmod +x deploy/linux/setup-auth-stack-no-docker.sh
sudo bash deploy/linux/setup-auth-stack-no-docker.sh \
  --plugin postgresql \
  --db-uri "postgresql://supertokens:replace_me@127.0.0.1:5432/supertokens"
```

带 API Key 的例子：

```bash
sudo bash deploy/linux/setup-auth-stack-no-docker.sh \
  --plugin postgresql \
  --db-uri "postgresql://supertokens:replace_me@127.0.0.1:5432/supertokens" \
  --core-api-key "replace_with_strong_key"
```

## 2. 首次上线目录建议

```text
/srv/starmc-website/          # 或你喜欢的路径
  重构/
    backend/                  # npm ci，环境见下文
    dist/                     # npm run build 产出
    deploy/linux/             # 本说明与模板（只读参考）
```

创建运行用户与数据目录（示例）：

```bash
sudo useradd -r -s /usr/sbin/nologin starmc || true
sudo mkdir -p /var/lib/starmc-api/data
sudo chown -R starmc:starmc /var/lib/starmc-api
```

## 3. 环境变量（不要提交密钥）

| 文件 | 用途 |
|------|------|
| `deploy/linux/backend.env.production.example` | 复制为服务器上的 `/etc/starmc/starmc-api.env`（权限 `0600`） |
| `重构/.env.example` | 复制为 `重构/.env.production.local`，再执行 `npm run build` |

要点：

- `CORS_ORIGIN`、`AUTH_API_DOMAIN`、`AUTH_WEBSITE_DOMAIN`、`PUBLIC_SITE_ORIGIN` 与 **浏览器里真实访问的 HTTPS 域名** 一致。
- `PUBLIC_API_BASE_URL` 为 **游戏代理 / 外网能访问的 API 根**（参见 `backend/.env.example`）。
- 反代后务必 `TRUST_PROXY=1`。

## 4. systemd（后端常驻）

参考 **`starmc-api.service.example`**：修改其中 `WorkingDirectory`、`User`、`ExecStart` 里的 `node` 路径与 `--env-file` 路径后安装到 `/etc/systemd/system/`。

## 5. Nginx

- 仓库内另有 **`nginx.prod.conf`**（Docker 上游名为 `backend`）。
- 同机部署请用 **`nginx.same-host.conf.example`** 的思路，把 upstream 改为 `127.0.0.1:8787` / `8788`；生产环境使用 **`nginx.prod.conf`**（上游名为 `backend`，对应 `docker-compose.prod.yml`）。

## 6. 从开发机同步代码

使用 **`rsync-exclude.txt`** 排除 `node_modules`、`dist`、本地 `.env` 与 `backend/data`，避免覆盖服务器数据与密钥。

示例脚本：**`rsync-deploy.example.sh`**（先改 `REMOTE_USER` / `REMOTE_HOST` / `REMOTE_DIR`）。

仅用 Git 时：在服务器 `git pull` 后同样 **`npm ci` + 构建**，且 **勿** 把 `.env` 提交进仓库。

## 7. 发布流程小结

```bash
# 服务器 — 后端
cd /srv/starmc-website/重构/backend
npm ci
npm run doctor   # 确认 Core /（可选）PG 可达
sudo systemctl restart starmc-api

# 服务器 — 前端
cd /srv/starmc-website/重构
npm ci
npm run build
# 由 Nginx root 指向 dist/
```

## 7.1 一次性上线（无容器）可复制命令

> 以下命令默认 Ubuntu/Debian，其他发行版按包管理器替换。

```bash
# 1) 安装基础依赖
sudo apt update
sudo apt install -y nginx rsync curl tar python3

# 2) 安装 Node 20（若系统仓库版本过低可改用 nvm）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v

# 3) 准备目录与运行账户
sudo useradd -r -s /usr/sbin/nologin starmc || true
sudo mkdir -p /srv/starmc-website /var/lib/starmc-api/data /etc/starmc
sudo chown -R starmc:starmc /var/lib/starmc-api

# 4) 同步代码（开发机执行 rsync；或服务器 git pull）
# 目标目录建议：/srv/starmc-website/重构

# 5) 安装 SuperTokens Core（无 Docker）
cd /srv/starmc-website/重构
chmod +x deploy/linux/setup-auth-stack-no-docker.sh
sudo bash deploy/linux/setup-auth-stack-no-docker.sh \
  --plugin postgresql \
  --db-uri "postgresql://supertokens:replace_me@127.0.0.1:5432/supertokens"
curl -i http://127.0.0.1:3567/hello

# 6) 安装并配置 backend systemd（首次）
sudo cp /srv/starmc-website/重构/deploy/linux/starmc-api.service.example /etc/systemd/system/starmc-api.service
sudoedit /etc/systemd/system/starmc-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now starmc-api

# 7) 前端构建
cd /srv/starmc-website/重构
cp .env.example .env.production.local
# 按域名修改 .env.production.local
npm ci
npm run build

# 8) Nginx 配置
sudo cp /srv/starmc-website/重构/deploy/linux/nginx.same-host.conf.example /etc/nginx/sites-available/starmc.conf
sudoedit /etc/nginx/sites-available/starmc.conf
sudo ln -sf /etc/nginx/sites-available/starmc.conf /etc/nginx/sites-enabled/starmc.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 7.2 联通性验收（发布后立刻执行）

```bash
# API 健康
curl -i https://www.star-web.top/healthz

# SuperTokens Core 可达（按实际 Core 地址）
curl -i http://127.0.0.1:3567/hello
sudo systemctl status supertokens-core --no-pager

# 站点首页（走 Nginx）
curl -I https://www.example.com/

# 认证接口（应返回业务 JSON，不应 404）
curl -i -X POST https://www.example.com/auth/signup \
  -H 'content-type: application/json' \
  --data '{"formFields":[{"id":"email","value":"test@example.com"},{"id":"password","value":"12345678"}]}'
```

### 7.3 一键预检脚本（无容器）

仓库提供 `deploy/linux/preflight-no-docker.sh`，用于发布前快速检查 Core/API/doctor 闭环：

```bash
cd /srv/starmc-website/重构
chmod +x deploy/linux/preflight-no-docker.sh
bash deploy/linux/preflight-no-docker.sh
```

可选参数：

```bash
# 指定 Core / API 地址
SUPERTOKENS_CONNECTION_URI=http://127.0.0.1:3567 \
API_HEALTH_URL=https://www.star-web.top/healthz \
bash deploy/linux/preflight-no-docker.sh

# 指定后端 env 文件（默认 /etc/starmc/starmc-api.env）
BACKEND_ENV_FILE=/etc/starmc/starmc-api.env \
bash deploy/linux/preflight-no-docker.sh

# 额外执行 backend verify（耗时更长）
RUN_BACKEND_VERIFY=1 bash deploy/linux/preflight-no-docker.sh
```

## 8. 项目内安装（无 systemd / 无 root，可直接在项目目录运行）

适用于你说的“安装在项目里面”。脚本会在 `重构/.runtime/` 下生成配置、日志与 PID，不写入 `/etc`。

新增脚本：
- `deploy/linux/project-local.env.example`
- `deploy/linux/setup-project-local.sh`
- `deploy/linux/run-project-local.sh`
- `deploy/linux/stop-project-local.sh`

### 8.1 使用步骤

```bash
cd /srv/starmc-website/重构
cp deploy/linux/project-local.env.example deploy/linux/project-local.env
# 编辑 project-local.env，至少填好 MYSQL_CONNECTION_URI（或 POSTGRESQL_CONNECTION_URI）

bash deploy/linux/setup-project-local.sh
```

把 SuperTokens Core 可执行文件放到以下任一路径之一：
- `重构/.runtime/supertokens/supertokens`
- 或在 `deploy/linux/project-local.env` 中设置 `SUPERTOKENS_BIN=/your/path/supertokens`

然后一键启动：

```bash
bash deploy/linux/run-project-local.sh
```

停止：

```bash
bash deploy/linux/stop-project-local.sh
```

### 8.2 项目内运行验收

```bash
curl -i http://127.0.0.1:3567/hello
curl -i http://127.0.0.1:8787/healthz
curl -I http://127.0.0.1:4173/
curl -i -X POST http://127.0.0.1:8787/auth/signup \
  -H 'content-type: application/json' \
  --data '{"formFields":[{"id":"email","value":"test@example.com"},{"id":"password","value":"12345678"}]}'
```

## 9. 与 Windows 开发的差异

- 路径分隔符由 Node `path` 处理，**业务代码无需改盘符**；勿在配置里写死 `D:\` 之类。
- 生产域名、SMTP、VLA 密钥只在 **服务器环境文件** 中配置，开发机 `.env` 可继续用 localhost。

更多后端说明见 **`backend/README.md`**。
