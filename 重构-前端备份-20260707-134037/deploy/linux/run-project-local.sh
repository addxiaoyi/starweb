#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOCAL_ENV="${SCRIPT_DIR}/project-local.env"

if [[ ! -f "${LOCAL_ENV}" ]]; then
  echo "[error] 缺少 ${LOCAL_ENV}，先执行 setup-project-local.sh"
  exit 1
fi

# shellcheck disable=SC1090
source "${LOCAL_ENV}"

if [[ ! -f "${PROJECT_ROOT}/backend/.env.project-local" ]]; then
  echo "[error] 缺少 backend/.env.project-local，先执行 setup-project-local.sh"
  exit 1
fi

# 查找 SuperTokens 可执行文件
ST_BIN="${SUPERTOKENS_BIN:-}"
if [[ -z "${ST_BIN}" ]]; then
  for p in \
    "${PROJECT_ROOT}/.runtime/supertokens/supertokens" \
    "${PROJECT_ROOT}/.runtime/supertokens/supertokens-linux-amd64" \
    "/usr/local/bin/supertokens" \
    "/usr/bin/supertokens"; do
    if [[ -x "$p" ]]; then ST_BIN="$p"; break; fi
  done
fi

if [[ -z "${ST_BIN}" ]]; then
  echo "[error] 未找到 SuperTokens Core 可执行文件，请设置 SUPERTOKENS_BIN 或放到 .runtime/supertokens/"
  exit 1
fi

mkdir -p "${PROJECT_ROOT}/.runtime/logs"

# 安装依赖与构建
cd "${PROJECT_ROOT}/backend"
npm ci

cd "${PROJECT_ROOT}"
npm ci
npm run build

# 启动 SuperTokens Core（后台）
nohup "${ST_BIN}" --config "${PROJECT_ROOT}/.runtime/supertokens/config.yaml" \
  > "${PROJECT_ROOT}/.runtime/logs/supertokens.log" 2>&1 &
echo $! > "${PROJECT_ROOT}/.runtime/supertokens.pid"

# 启动 backend（后台）
cd "${PROJECT_ROOT}/backend"
nohup node --env-file=.env.project-local src/server.js \
  > "${PROJECT_ROOT}/.runtime/logs/backend.log" 2>&1 &
echo $! > "${PROJECT_ROOT}/.runtime/backend.pid"

# 启动 web preview（后台）
cd "${PROJECT_ROOT}"
nohup npm run preview -- --host 0.0.0.0 --port "${WEB_PORT:-4173}" \
  > "${PROJECT_ROOT}/.runtime/logs/web.log" 2>&1 &
echo $! > "${PROJECT_ROOT}/.runtime/web.pid"

echo "[ok] 已启动（项目内后台进程）："
echo "  SuperTokens: http://127.0.0.1:${SUPERTOKENS_PORT:-3567}/hello"
echo "  Backend:     http://127.0.0.1:${API_PORT:-8787}/healthz"
echo "  Web:         http://127.0.0.1:${WEB_PORT:-4173}"
echo "日志目录：${PROJECT_ROOT}/.runtime/logs"
echo "停止请执行：deploy/linux/stop-project-local.sh"