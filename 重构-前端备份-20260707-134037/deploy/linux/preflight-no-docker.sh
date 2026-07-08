#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"

SUPERTOKENS_URI="${SUPERTOKENS_CONNECTION_URI:-http://127.0.0.1:3567}"
API_HEALTH_URL="${API_HEALTH_URL:-https://www.star-web.top/healthz}"
RUN_BACKEND_VERIFY="${RUN_BACKEND_VERIFY:-0}"
BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-/etc/starmc/starmc-api.env}"

echo "[preflight] project: ${PROJECT_ROOT}"
echo "[preflight] supertokens: ${SUPERTOKENS_URI%/}/hello"
echo "[preflight] backend health: ${API_HEALTH_URL}"

if ! command -v curl >/dev/null 2>&1; then
  echo "[preflight][error] curl 未安装"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[preflight][error] npm 未安装"
  exit 1
fi

echo "[preflight] 1/3 检查 SuperTokens Core..."
if ! curl -fsS "${SUPERTOKENS_URI%/}/hello" | grep -qi "hello"; then
  echo "[preflight][error] SuperTokens Core 不可用"
  exit 1
fi

echo "[preflight] 2/3 检查 backend 健康接口..."
curl -fsS "${API_HEALTH_URL}" >/dev/null

echo "[preflight] 3/3 运行 backend doctor..."
(
  cd "${BACKEND_DIR}"
  if [[ -f "${BACKEND_ENV_FILE}" ]]; then
    echo "[preflight] 使用 env-file: ${BACKEND_ENV_FILE}"
    node --env-file="${BACKEND_ENV_FILE}" scripts/check-auth-stack.mjs
  else
    npm run doctor
  fi
)

if [[ "${RUN_BACKEND_VERIFY}" == "1" ]]; then
  echo "[preflight] 附加执行 backend verify..."
  (
    cd "${BACKEND_DIR}"
    npm run verify
  )
fi

echo "[preflight] PASS"
