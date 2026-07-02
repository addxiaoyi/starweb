#!/usr/bin/env bash
# 依赖 curl。用法: BASE_URL=http://127.0.0.1:8090 ./http-api-security-check.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

load_env_file() {
  local env_file="$1"
  if [[ ! -f "$env_file" ]]; then
    return
  fi

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    local line="${raw_line%$'\r'}"
    case "$line" in
      ''|'#'*) continue ;;
    esac

    local key="${line%%=*}"
    local value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    value="${value//\\n/$'\n'}"
    value="${value//\\\"/\"}"
    value="${value//\\\\/\\}"
    export "$key=$value"
  done < "$env_file"
}

normalize_http_host() {
  local host="${1:-}"
  host="${host#"${host%%[![:space:]]*}"}"
  host="${host%"${host##*[![:space:]]}"}"
  case "$host" in
    ''|'0.0.0.0'|'::'|'[::]')
      printf '127.0.0.1'
      ;;
    *)
      host="${host#[}"
      host="${host%]}"
      printf '%s' "$host"
      ;;
  esac
}

resolve_base_url() {
  if [[ -n "${VLA_HTTP_BASE:-}" ]]; then
    printf '%s' "${VLA_HTTP_BASE%/}"
    return
  fi

  if [[ -n "${VLA_HTTP_PORT:-}" ]]; then
    printf 'http://%s:%s' "$(normalize_http_host "${VLA_HTTP_BIND:-}")" "$VLA_HTTP_PORT"
    return
  fi

  printf 'http://127.0.0.1:8090'
}

load_env_file "$ROOT/.env.velocity.generated"
load_env_file "$ROOT/.env.velocity"

BASE_URL="${BASE_URL:-$(resolve_base_url)}"
BASE_URL="${BASE_URL%/}"
API_KEY="${VLA_HTTP_API_KEY:-${VLA_API_KEY:-}}"
FAILED=0

check() {
  local name="$1"
  local wants="$2"
  shift 2
  local got
  got="$(curl -sS -o /dev/null -w '%{http_code}' "$@")"

  IFS='/' read -r -a want_codes <<< "$wants"
  local want
  for want in "${want_codes[@]}"; do
    if [[ "$got" == "$want" ]]; then
      echo "[ OK ] $name : HTTP $got"
      return
    fi
  done

  echo "[FAIL] $name : HTTP $got (expect $wants)" >&2
  FAILED=$((FAILED + 1))
}

echo "HTTP API 安全自检  BASE_URL=$BASE_URL"
check "GET /v1/health (public)" "200/503" "${BASE_URL}/v1/health"
check "GET /v1/metrics/prometheus (no key)" "401" "${BASE_URL}/v1/metrics/prometheus"
check "GET /v1/user/exists (no key)" "401" "${BASE_URL}/v1/user/exists?name=test"

if [[ -n "$API_KEY" ]]; then
  got="$(curl -sS -o /dev/null -w '%{http_code}' -H "X-API-Key: ${API_KEY}" "${BASE_URL}/v1/metrics/prometheus")"
  if [[ "$got" == "200" ]]; then
    echo "[ OK ] GET /v1/metrics/prometheus (with X-API-Key) : HTTP 200"
  else
    echo "[WARN] GET /v1/metrics/prometheus (with key) : HTTP $got (match http-api.api-key to VLA_HTTP_API_KEY, VLA_API_KEY, or pass the same value via the shell environment)" >&2
    FAILED=$((FAILED + 1))
  fi
else
  echo "[SKIP] 未设置 VLA_HTTP_API_KEY / VLA_API_KEY，跳过带密钥访问验证"
fi

if [[ "$FAILED" -gt 0 ]]; then
  echo "共 $FAILED 项未通过。" >&2
  exit 1
fi

echo "全部通过。"
exit 0
