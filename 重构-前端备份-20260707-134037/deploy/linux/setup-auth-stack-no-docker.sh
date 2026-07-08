#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
All-in-one setup for login closure on Linux (no Docker):
1) Install + configure SuperTokens Core (systemd)
2) Wire backend env to Core + restart + doctor + health check

Usage:
  sudo bash deploy/linux/setup-auth-stack-no-docker.sh --db-uri <uri> [options]

Required:
  --db-uri <uri>              SuperTokens metadata DB URI

Core options:
  --plugin <postgresql|mysql> Default: postgresql
  --tag <version>             Default: postgresql->11.4.4, mysql->10.1.4
  --core-port <port>          Default: 3567
  --core-api-key <value>      Optional Core API key (also written to backend env)
  --install-dir <path>        Default: /opt/supertokens
  --core-env-path <path>      Default: /etc/supertokens/core.env
  --core-service-path <path>  Default: /etc/systemd/system/supertokens-core.service
  --core-user <name>          Default: supertokens
  --core-group <name>         Default: supertokens

Backend options:
  --backend-env <path>        Default: /etc/starmc/starmc-api.env
  --backend-dir <path>        Default: /srv/starmc-website/重构/backend
  --backend-service <name>    Default: starmc-api
  --auth-api-domain <url>     Optional backend AUTH_API_DOMAIN override
  --auth-website-domain <url> Optional backend AUTH_WEBSITE_DOMAIN override
  --api-health-url <url>      Optional backend health URL
  --skip-npm-ci               Skip backend npm ci
  --skip-doctor               Skip backend doctor checks
  --skip-restart              Skip backend service restart
  --strict-auth-closure       Force run check-auth-closure even if SMTP not set

  -h, --help                  Show help

Example:
  sudo bash deploy/linux/setup-auth-stack-no-docker.sh \
    --plugin postgresql \
    --db-uri "postgresql://supertokens:replace_me@127.0.0.1:5432/supertokens"
EOF
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[error] please run as root (use sudo)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_SETUP="${SCRIPT_DIR}/setup-supertokens-core-systemd.sh"
BACKEND_SETUP="${SCRIPT_DIR}/setup-backend-auth-closure.sh"

for f in "${CORE_SETUP}" "${BACKEND_SETUP}"; do
  if [[ ! -f "${f}" ]]; then
    echo "[error] required script not found: ${f}" >&2
    exit 1
  fi
  if [[ ! -x "${f}" ]]; then
    chmod +x "${f}"
  fi
done

PLUGIN="postgresql"
TAG=""
DB_URI=""
CORE_PORT="3567"
CORE_API_KEY=""
INSTALL_DIR="/opt/supertokens"
CORE_ENV_PATH="/etc/supertokens/core.env"
CORE_SERVICE_PATH="/etc/systemd/system/supertokens-core.service"
CORE_USER="supertokens"
CORE_GROUP="supertokens"

BACKEND_ENV="/etc/starmc/starmc-api.env"
BACKEND_DIR="/srv/starmc-website/重构/backend"
BACKEND_SERVICE="starmc-api"
AUTH_API_DOMAIN=""
AUTH_WEBSITE_DOMAIN=""
API_HEALTH_URL=""
SKIP_NPM_CI="0"
SKIP_DOCTOR="0"
SKIP_RESTART="0"
STRICT_AUTH_CLOSURE="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plugin) PLUGIN="${2:-}"; shift 2 ;;
    --tag) TAG="${2:-}"; shift 2 ;;
    --db-uri) DB_URI="${2:-}"; shift 2 ;;
    --core-port) CORE_PORT="${2:-}"; shift 2 ;;
    --core-api-key) CORE_API_KEY="${2:-}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --core-env-path) CORE_ENV_PATH="${2:-}"; shift 2 ;;
    --core-service-path) CORE_SERVICE_PATH="${2:-}"; shift 2 ;;
    --core-user) CORE_USER="${2:-}"; shift 2 ;;
    --core-group) CORE_GROUP="${2:-}"; shift 2 ;;

    --backend-env) BACKEND_ENV="${2:-}"; shift 2 ;;
    --backend-dir) BACKEND_DIR="${2:-}"; shift 2 ;;
    --backend-service) BACKEND_SERVICE="${2:-}"; shift 2 ;;
    --auth-api-domain) AUTH_API_DOMAIN="${2:-}"; shift 2 ;;
    --auth-website-domain) AUTH_WEBSITE_DOMAIN="${2:-}"; shift 2 ;;
    --api-health-url) API_HEALTH_URL="${2:-}"; shift 2 ;;

    --skip-npm-ci) SKIP_NPM_CI="1"; shift ;;
    --skip-doctor) SKIP_DOCTOR="1"; shift ;;
    --skip-restart) SKIP_RESTART="1"; shift ;;
    --strict-auth-closure) STRICT_AUTH_CLOSURE="1"; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "[error] unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${DB_URI}" ]]; then
  echo "[error] --db-uri is required" >&2
  exit 1
fi

CORE_ARGS=(
  --plugin "${PLUGIN}"
  --db-uri "${DB_URI}"
  --port "${CORE_PORT}"
  --install-dir "${INSTALL_DIR}"
  --env-path "${CORE_ENV_PATH}"
  --service-path "${CORE_SERVICE_PATH}"
  --user "${CORE_USER}"
  --group "${CORE_GROUP}"
)

if [[ -n "${TAG}" ]]; then
  CORE_ARGS+=(--tag "${TAG}")
fi
if [[ -n "${CORE_API_KEY}" ]]; then
  CORE_ARGS+=(--api-key "${CORE_API_KEY}")
fi

echo "[all-in-one] step 1/2: setup SuperTokens Core"
bash "${CORE_SETUP}" "${CORE_ARGS[@]}"

CORE_URI="http://127.0.0.1:${CORE_PORT}"
BACKEND_ARGS=(
  --backend-env "${BACKEND_ENV}"
  --backend-dir "${BACKEND_DIR}"
  --core-uri "${CORE_URI}"
  --service-name "${BACKEND_SERVICE}"
)

if [[ -n "${CORE_API_KEY}" ]]; then
  BACKEND_ARGS+=(--core-api-key "${CORE_API_KEY}")
fi
if [[ -n "${AUTH_API_DOMAIN}" ]]; then
  BACKEND_ARGS+=(--auth-api-domain "${AUTH_API_DOMAIN}")
fi
if [[ -n "${AUTH_WEBSITE_DOMAIN}" ]]; then
  BACKEND_ARGS+=(--auth-website-domain "${AUTH_WEBSITE_DOMAIN}")
fi
if [[ -n "${API_HEALTH_URL}" ]]; then
  BACKEND_ARGS+=(--api-health-url "${API_HEALTH_URL}")
fi
if [[ "${SKIP_NPM_CI}" == "1" ]]; then
  BACKEND_ARGS+=(--skip-npm-ci)
fi
if [[ "${SKIP_DOCTOR}" == "1" ]]; then
  BACKEND_ARGS+=(--skip-doctor)
fi
if [[ "${SKIP_RESTART}" == "1" ]]; then
  BACKEND_ARGS+=(--skip-restart)
fi
if [[ "${STRICT_AUTH_CLOSURE}" == "1" ]]; then
  BACKEND_ARGS+=(--strict-auth-closure)
fi

echo "[all-in-one] step 2/2: setup backend closure"
bash "${BACKEND_SETUP}" "${BACKEND_ARGS[@]}"

echo "[all-in-one] done."
echo "  Core    : ${CORE_URI}/hello"
if [[ -z "${API_HEALTH_URL}" ]]; then
  echo "  Backend : auto health url from backend env"
else
  echo "  Backend : ${API_HEALTH_URL}"
fi
