#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Wire backend auth settings to SuperTokens Core and verify closure (no Docker).

Usage:
  sudo bash deploy/linux/setup-backend-auth-closure.sh [options]

Options:
  --backend-env <path>        Backend env file. Default: /etc/starmc/starmc-api.env
  --backend-dir <path>        Backend directory. Default: /srv/starmc-website/重构/backend
  --core-uri <uri>            SuperTokens Core base URI. Default: http://127.0.0.1:3567
  --core-api-key <value>      Optional SUPERTOKENS_API_KEY to write into backend env
  --auth-api-domain <url>     Optional AUTH_API_DOMAIN override in backend env
  --auth-website-domain <url> Optional AUTH_WEBSITE_DOMAIN override in backend env
  --service-name <name>       Backend systemd service name. Default: starmc-api
  --api-health-url <url>      API health URL. Default auto from env PORT (or 8787)
  --skip-npm-ci               Skip npm ci
  --skip-doctor               Skip doctor checks
  --skip-restart              Skip systemctl restart
  --strict-auth-closure       Run auth-closure config check even when SMTP is incomplete
  -h, --help                  Show help

Examples:
  sudo bash deploy/linux/setup-backend-auth-closure.sh

  sudo bash deploy/linux/setup-backend-auth-closure.sh \
    --core-uri http://127.0.0.1:3567 \
    --core-api-key "replace_with_strong_key"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_BACKEND_DIR="/srv/starmc-website/重构/backend"
DEFAULT_BACKEND_ENV="/etc/starmc/starmc-api.env"
DEFAULT_SERVICE_NAME="starmc-api"
DEFAULT_CORE_URI="http://127.0.0.1:3567"

BACKEND_DIR="${DEFAULT_BACKEND_DIR}"
BACKEND_ENV="${DEFAULT_BACKEND_ENV}"
SERVICE_NAME="${DEFAULT_SERVICE_NAME}"
CORE_URI="${DEFAULT_CORE_URI}"
CORE_API_KEY=""
AUTH_API_DOMAIN=""
AUTH_WEBSITE_DOMAIN=""
API_HEALTH_URL=""

RUN_NPM_CI="1"
RUN_DOCTOR="1"
RESTART_SERVICE="1"
STRICT_AUTH_CLOSURE="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-env)
      BACKEND_ENV="${2:-}"
      shift 2
      ;;
    --backend-dir)
      BACKEND_DIR="${2:-}"
      shift 2
      ;;
    --core-uri)
      CORE_URI="${2:-}"
      shift 2
      ;;
    --core-api-key)
      CORE_API_KEY="${2:-}"
      shift 2
      ;;
    --auth-api-domain)
      AUTH_API_DOMAIN="${2:-}"
      shift 2
      ;;
    --auth-website-domain)
      AUTH_WEBSITE_DOMAIN="${2:-}"
      shift 2
      ;;
    --service-name)
      SERVICE_NAME="${2:-}"
      shift 2
      ;;
    --api-health-url)
      API_HEALTH_URL="${2:-}"
      shift 2
      ;;
    --skip-npm-ci)
      RUN_NPM_CI="0"
      shift
      ;;
    --skip-doctor)
      RUN_DOCTOR="0"
      shift
      ;;
    --skip-restart)
      RESTART_SERVICE="0"
      shift
      ;;
    --strict-auth-closure)
      STRICT_AUTH_CLOSURE="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[error] unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

for cmd in curl awk grep sed mktemp mv npm node; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[error] missing required command: ${cmd}" >&2
    exit 1
  fi
done

if [[ "${RESTART_SERVICE}" == "1" ]] && ! command -v systemctl >/dev/null 2>&1; then
  echo "[warn] systemctl not found, auto disable service restart."
  RESTART_SERVICE="0"
fi

if [[ ! -d "${BACKEND_DIR}" ]]; then
  echo "[error] backend dir not found: ${BACKEND_DIR}" >&2
  exit 1
fi

CORE_URI="$(printf '%s' "${CORE_URI}" | sed 's#/*$##')"
if [[ -z "${CORE_URI}" ]]; then
  echo "[error] --core-uri cannot be empty" >&2
  exit 1
fi

if [[ ! -f "${BACKEND_ENV}" ]]; then
  TEMPLATE_PATH="${SCRIPT_DIR}/backend.env.production.example"
  if [[ -f "${TEMPLATE_PATH}" ]]; then
    echo "[info] backend env missing, initializing from template: ${BACKEND_ENV}"
    install -d -m 0750 "$(dirname "${BACKEND_ENV}")"
    cp "${TEMPLATE_PATH}" "${BACKEND_ENV}"
    chmod 600 "${BACKEND_ENV}"
  else
    echo "[error] backend env not found: ${BACKEND_ENV}" >&2
    exit 1
  fi
fi

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp
  tmp="$(mktemp)"

  awk -v k="${key}" -v v="${value}" '
    BEGIN { done=0 }
    {
      if ($0 ~ "^[[:space:]]*" k "=") {
        if (done == 0) {
          print k "=" v
          done=1
        }
        next
      }
      print $0
    }
    END {
      if (done == 0) {
        print k "=" v
      }
    }
  ' "${file}" > "${tmp}"

  mv "${tmp}" "${file}"
}

read_env_value() {
  local key="$1"
  local file="$2"
  awk -v k="${key}" '
    $0 ~ /^[[:space:]]*#/ { next }
    {
      line=$0
      sub(/^[[:space:]]+/, "", line)
      if (index(line, k "=") == 1) {
        val=substr(line, length(k) + 2)
        sub(/^[[:space:]]+/, "", val)
        sub(/[[:space:]]+$/, "", val)
        gsub(/^"/, "", val)
        gsub(/"$/, "", val)
        print val
        exit
      }
    }
  ' "${file}"
}

has_nonempty_env_value() {
  local key="$1"
  local file="$2"
  local value
  value="$(read_env_value "${key}" "${file}" || true)"
  [[ -n "${value}" ]]
}

has_any_nonempty_env_value() {
  local file="$1"
  shift
  local key
  for key in "$@"; do
    if has_nonempty_env_value "${key}" "${file}"; then
      return 0
    fi
  done
  return 1
}

echo "[step] check SuperTokens Core: ${CORE_URI}/hello"
if ! curl -fsS "${CORE_URI}/hello" | grep -qi "hello"; then
  echo "[error] SuperTokens Core unreachable: ${CORE_URI}/hello" >&2
  exit 1
fi

echo "[step] update backend env: ${BACKEND_ENV}"
upsert_env "SUPERTOKENS_CONNECTION_URI" "${CORE_URI}" "${BACKEND_ENV}"
if [[ -n "${CORE_API_KEY}" ]]; then
  upsert_env "SUPERTOKENS_API_KEY" "${CORE_API_KEY}" "${BACKEND_ENV}"
fi
if [[ -n "${AUTH_API_DOMAIN}" ]]; then
  upsert_env "AUTH_API_DOMAIN" "${AUTH_API_DOMAIN}" "${BACKEND_ENV}"
fi
if [[ -n "${AUTH_WEBSITE_DOMAIN}" ]]; then
  upsert_env "AUTH_WEBSITE_DOMAIN" "${AUTH_WEBSITE_DOMAIN}" "${BACKEND_ENV}"
fi

if [[ "${RUN_NPM_CI}" == "1" ]]; then
  echo "[step] npm ci (${BACKEND_DIR})"
  (
    cd "${BACKEND_DIR}"
    npm ci
  )
fi

if [[ "${RESTART_SERVICE}" == "1" ]]; then
  if systemctl cat "${SERVICE_NAME}" >/dev/null 2>&1; then
    echo "[step] restart service: ${SERVICE_NAME}"
    systemctl restart "${SERVICE_NAME}"
    systemctl status "${SERVICE_NAME}" --no-pager || true
  else
    echo "[warn] systemd service not found: ${SERVICE_NAME} (skip restart)"
  fi
fi

if [[ "${RUN_DOCTOR}" == "1" ]]; then
  echo "[step] run doctor (check-auth-stack)"
  (
    cd "${BACKEND_DIR}"
    node --env-file="${BACKEND_ENV}" scripts/check-auth-stack.mjs
  )

  should_run_auth_closure="0"
  if [[ "${STRICT_AUTH_CLOSURE}" == "1" ]]; then
    should_run_auth_closure="1"
  elif has_any_nonempty_env_value "${BACKEND_ENV}" "SUPERTOKENS_SMTP_HOST" "SMTP_HOST" &&
    has_any_nonempty_env_value "${BACKEND_ENV}" "SUPERTOKENS_SMTP_USER" "SMTP_USER" &&
    has_any_nonempty_env_value "${BACKEND_ENV}" "SUPERTOKENS_SMTP_PASSWORD" "SMTP_PASSWORD"; then
    should_run_auth_closure="1"
  fi

  if [[ "${should_run_auth_closure}" == "1" ]]; then
    echo "[step] run auth closure config check"
    (
      cd "${BACKEND_DIR}"
      node --env-file="${BACKEND_ENV}" scripts/check-auth-closure.mjs
    )
  else
    echo "[info] skip check-auth-closure (SMTP not fully configured)."
    echo "       add SUPERTOKENS_SMTP_* (or SMTP_*) then rerun with --strict-auth-closure"
  fi
fi

if [[ -z "${API_HEALTH_URL}" ]]; then
  PORT_VALUE="$(read_env_value "PORT" "${BACKEND_ENV}" || true)"
  if [[ -z "${PORT_VALUE}" ]]; then
    PORT_VALUE="8787"
  fi
  API_HEALTH_URL="http://127.0.0.1:${PORT_VALUE}/healthz"
fi

echo "[step] check API health: ${API_HEALTH_URL}"
if curl -fsS "${API_HEALTH_URL}" >/dev/null; then
  echo "[ok] API health check passed."
else
  echo "[warn] API health check failed: ${API_HEALTH_URL}"
fi

echo "[done] backend auth closure wiring completed."
echo "       SUPERTOKENS_CONNECTION_URI=${CORE_URI}"
if [[ -n "${CORE_API_KEY}" ]]; then
  echo "       SUPERTOKENS_API_KEY=<set>"
fi
