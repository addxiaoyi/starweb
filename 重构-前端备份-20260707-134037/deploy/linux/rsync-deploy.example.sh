#!/usr/bin/env bash
# 示例：从开发机把「重构」同步到 Linux（请先配置 SSH 密钥）
# 用法：在仓库根目录（含 velocity-limbo-auth 的上级）或仅同步 重构 子目录时调整 SRC。
set -euo pipefail

# 改成你的服务器与用户
REMOTE_USER="deploy"
REMOTE_HOST="your.server.ip"
# 服务器上项目根（内含 重构/ 目录）
REMOTE_DIR="/srv/starmc-website/重构"

# 本脚本位于 重构/deploy/linux；同步根目录为「重构」文件夹本身
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REFACTOR_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# REMOTE_DIR 建议为服务器上的「重构」路径，例如 /srv/starmc-website/重构
rsync -avz --delete \
  --exclude-from="${SCRIPT_DIR}/rsync-exclude.txt" \
  "${REFACTOR_ROOT}/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "同步完成。请在服务器上："
echo "  1) 配置 /etc/starmc/starmc-api.env（见 deploy/linux/backend.env.production.example）"
echo "  2) 配置 重构/.env.production.local 后 npm ci && npm run build"
echo "  3) 重构/backend: npm ci && npm run doctor && systemctl restart starmc-api"
echo "详见 deploy/linux/README.md"
