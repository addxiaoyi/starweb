#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOCAL_ENV="${SCRIPT_DIR}/project-local.env"

if [[ ! -f "${LOCAL_ENV}" ]]; then
  cp "${SCRIPT_DIR}/project-local.env.example" "${LOCAL_ENV}"
  echo "[init] 已创建 ${LOCAL_ENV}，请先编辑数据库连接与端口后再执行。"
  exit 0
fi

# shellcheck disable=SC1090
source "${LOCAL_ENV}"

mkdir -p "${PROJECT_ROOT}/.runtime/supertokens" "${PROJECT_ROOT}/.runtime/logs" "${PROJECT_ROOT}/backend/data"

# 生成 SuperTokens Core 本地配置
cat > "${PROJECT_ROOT}/.runtime/supertokens/config.yaml" <<EOF
port: ${SUPERTOKENS_PORT:-3567}
host: 127.0.0.1
EOF

if [[ -n "${MYSQL_CONNECTION_URI:-}" ]]; then
  cat >> "${PROJECT_ROOT}/.runtime/supertokens/config.yaml" <<EOF
mysql_connection_uri: ${MYSQL_CONNECTION_URI}
EOF
elif [[ -n "${POSTGRESQL_CONNECTION_URI:-}" ]]; then
  cat >> "${PROJECT_ROOT}/.runtime/supertokens/config.yaml" <<EOF
postgresql_connection_uri: ${POSTGRESQL_CONNECTION_URI}
EOF
else
  echo "[error] 未配置 MYSQL_CONNECTION_URI 或 POSTGRESQL_CONNECTION_URI"
  exit 1
fi

# 生成 backend 本地 env（项目内）
cat > "${PROJECT_ROOT}/backend/.env.project-local" <<EOF
NODE_ENV=production
PORT=${API_PORT:-8787}
PLUGIN_PORT=${PLUGIN_PORT:-8788}
TRUST_PROXY=1

CORS_ORIGIN=${PUBLIC_SCHEME:-http}://${PUBLIC_HOST:-127.0.0.1}:${PUBLIC_PORT:-80},http://127.0.0.1,http://localhost
PUBLIC_SITE_ORIGIN=${PUBLIC_SCHEME:-http}://${PUBLIC_HOST:-127.0.0.1}:${PUBLIC_PORT:-80}
AUTH_API_DOMAIN=${PUBLIC_SCHEME:-http}://${PUBLIC_HOST:-127.0.0.1}:${PUBLIC_PORT:-80}
AUTH_WEBSITE_DOMAIN=${PUBLIC_SCHEME:-http}://${PUBLIC_HOST:-127.0.0.1}:${PUBLIC_PORT:-80}

SUPERTOKENS_CONNECTION_URI=http://127.0.0.1:${SUPERTOKENS_PORT:-3567}
SUPERTOKENS_API_KEY=${SUPERTOKENS_API_KEY:-}

PUBLIC_API_BASE_URL=http://127.0.0.1:${API_PORT:-8787}
DATA_DIR=${PROJECT_ROOT}/backend/data
EOF

# 生成 web 本地构建 env
cat > "${PROJECT_ROOT}/.env.production.local" <<EOF
VITE_AUTH_API_DOMAIN=${PUBLIC_SCHEME:-http}://${PUBLIC_HOST:-127.0.0.1}:${PUBLIC_PORT:-80}
VITE_AUTH_WEBSITE_DOMAIN=${PUBLIC_SCHEME:-http}://${PUBLIC_HOST:-127.0.0.1}:${PUBLIC_PORT:-80}
VITE_AUTH_API_BASE_PATH=/auth
VITE_SUPERTOKENS_APP_NAME=StarMC
VITE_WEB_VITALS_ENDPOINT=/api/metrics/web-vitals
EOF

echo "[ok] 项目内配置已生成："
echo "  - backend/.env.project-local"
echo "  - .env.production.local"
echo "  - .runtime/supertokens/config.yaml"
echo "下一步：执行 deploy/linux/run-project-local.sh"