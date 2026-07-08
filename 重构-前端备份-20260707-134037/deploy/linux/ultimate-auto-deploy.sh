#!/usr/bin/env bash
set -euo pipefail

# StarMC 一键智能部署脚本（Linux / 宝塔友好）
# 功能：
#  1) 自动准备 Node/Nginx 基础依赖
#  2) 生成前后端生产环境文件
#  3) 安装依赖、执行后端迁移、前端构建
#  4) 安装/更新 systemd（可选）
#  5) 安装/更新 Nginx 站点配置（可选）
#  6) 发布后健康检查
#
# 用法（推荐 root）：
#   chmod +x deploy/linux/ultimate-auto-deploy.sh
#   sudo DOMAIN=star-web.top bash deploy/linux/ultimate-auto-deploy.sh
#
# 关键环境变量：
#   DOMAIN=star-web.top
#   APP_ROOT=/srv/starmc-website/重构
#   API_PORT=8787
#   PLUGIN_PORT=8788
#   SUPERTOKENS_PORT=3567
#   ENABLE_SYSTEMD=1
#   ENABLE_NGINX=1
#   ENABLE_DB_MIGRATE=1
#   STRICT_MIGRATION=1
#   RUN_BACKEND_DOCTOR=1
#   RUN_BACKEND_SECURITY_CHECK=1
#   RUN_BACKEND_VERIFY=0
#   NON_INTERACTIVE=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"

APP_ROOT="${APP_ROOT:-$PROJECT_ROOT}"
API_PORT="${API_PORT:-8787}"
PLUGIN_PORT="${PLUGIN_PORT:-8788}"
SUPERTOKENS_PORT="${SUPERTOKENS_PORT:-3567}"
DOMAIN="${DOMAIN:-star-web.top}"
ENABLE_SYSTEMD="${ENABLE_SYSTEMD:-1}"
ENABLE_NGINX="${ENABLE_NGINX:-1}"
ENABLE_DB_MIGRATE="${ENABLE_DB_MIGRATE:-1}"
STRICT_MIGRATION="${STRICT_MIGRATION:-1}"
RUN_BACKEND_DOCTOR="${RUN_BACKEND_DOCTOR:-1}"
RUN_BACKEND_SECURITY_CHECK="${RUN_BACKEND_SECURITY_CHECK:-1}"
RUN_BACKEND_VERIFY="${RUN_BACKEND_VERIFY:-0}"
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"

log()  { echo -e "\033[1;34m[INFO]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $*"; }
err()  { echo -e "\033[1;31m[ERR ]\033[0m $*"; }

require_cmd() { command -v "$1" >/dev/null 2>&1; }
is_root() { [[ "${EUID:-$(id -u)}" -eq 0 ]]; }

detect_pkg_manager() {
  if require_cmd apt-get; then echo "apt"; return; fi
  if require_cmd dnf; then echo "dnf"; return; fi
  if require_cmd yum; then echo "yum"; return; fi
  echo "unknown"
}

install_pkgs() {
  local mgr="$1"; shift
  local pkgs=("$@")
  [[ ${#pkgs[@]} -gt 0 ]] || return 0
  case "$mgr" in
    apt)
      apt-get update -y
      DEBIAN_FRONTEND=noninteractive apt-get install -y "${pkgs[@]}"
      ;;
    dnf) dnf install -y "${pkgs[@]}" ;;
    yum) yum install -y "${pkgs[@]}" ;;
    *)
      err "未识别包管理器，无法自动安装：${pkgs[*]}"
      return 1
      ;;
  esac
}

ensure_base_tools() {
  local mgr
  mgr="$(detect_pkg_manager)"

  local missing=()
  for c in curl git sed awk grep; do
    require_cmd "$c" || missing+=("$c")
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    if ! is_root; then
      err "缺少命令：${missing[*]}，且当前非 root，无法自动安装。"
      exit 1
    fi
    log "安装基础工具：${missing[*]}"
    install_pkgs "$mgr" "${missing[@]}"
  fi
}

ensure_node20() {
  if require_cmd node; then
    local major
    major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
    if [[ "$major" -ge 20 ]]; then
      log "Node.js 已满足要求：$(node -v)"
      return 0
    fi
    warn "当前 Node.js 版本过低：$(node -v)，将尝试升级到 20+"
  else
    warn "未检测到 Node.js，将尝试安装 20+"
  fi

  if ! is_root; then
    err "安装 Node.js 需要 root 权限，请使用 sudo 运行脚本。"
    exit 1
  fi

  local mgr
  mgr="$(detect_pkg_manager)"

  case "$mgr" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      install_pkgs "$mgr" nodejs
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
      install_pkgs "$mgr" nodejs
      ;;
    *)
      err "无法自动安装 Node.js（未知包管理器）"
      exit 1
      ;;
  esac

  log "Node.js 安装完成：$(node -v)"
}

ensure_nginx() {
  [[ "$ENABLE_NGINX" == "1" ]] || return 0

  if require_cmd nginx; then
    log "Nginx 已安装：$(nginx -v 2>&1)"
    return 0
  fi

  if ! is_root; then
    warn "未检测到 Nginx，且当前非 root，跳过自动安装。"
    return 0
  fi

  local mgr
  mgr="$(detect_pkg_manager)"
  log "安装 Nginx..."
  install_pkgs "$mgr" nginx
}

random_secret() {
  if require_cmd openssl; then
    openssl rand -hex 32
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

ask_if_needed() {
  local key="$1" prompt="$2" default_val="$3"
  local cur="${!key:-}"
  if [[ -n "$cur" ]]; then
    return 0
  fi

  if [[ "$NON_INTERACTIVE" == "1" || ! -t 0 ]]; then
    printf -v "$key" '%s' "$default_val"
    return 0
  fi

  read -r -p "${prompt} [${default_val}]: " input
  input="${input:-$default_val}"
  printf -v "$key" '%s' "$input"
}

upsert_kv() {
  local file="$1" k="$2" v="$3"
  if grep -qE "^${k}=" "$file"; then
    sed -i -E "s#^${k}=.*#${k}=${v}#" "$file"
  else
    echo "${k}=${v}" >> "$file"
  fi
}

prepare_env_files() {
  local backend_env="/etc/starmc/starmc-api.env"
  local web_env="${PROJECT_ROOT}/.env.production.local"

  ask_if_needed DOMAIN "请输入站点域名（无协议）" "star-web.top"

  local scheme="https"
  if [[ "$DOMAIN" == "127.0.0.1" || "$DOMAIN" == "localhost" ]]; then
    scheme="http"
  fi
  local site_origin="${scheme}://${DOMAIN}"

  if is_root; then
    mkdir -p /etc/starmc
    if [[ ! -f "$backend_env" ]]; then
      cp "${SCRIPT_DIR}/backend.env.production.example" "$backend_env"
    fi
  else
    backend_env="${BACKEND_DIR}/.env.production.local"
    if [[ ! -f "$backend_env" ]]; then
      cp "${SCRIPT_DIR}/backend.env.production.example" "$backend_env"
    fi
  fi

  local plugin_refresh_secret admin_secret
  plugin_refresh_secret="$(random_secret)"
  admin_secret="$(random_secret)"

  upsert_kv "$backend_env" "NODE_ENV" "production"
  upsert_kv "$backend_env" "PORT" "$API_PORT"
  upsert_kv "$backend_env" "PLUGIN_PORT" "$PLUGIN_PORT"
  upsert_kv "$backend_env" "TRUST_PROXY" "1"
  upsert_kv "$backend_env" "CORS_ORIGIN" "${site_origin},https://www.${DOMAIN}"
  upsert_kv "$backend_env" "PUBLIC_SITE_ORIGIN" "$site_origin"
  upsert_kv "$backend_env" "AUTH_API_DOMAIN" "$site_origin"
  upsert_kv "$backend_env" "AUTH_WEBSITE_DOMAIN" "$site_origin"
  upsert_kv "$backend_env" "SUPERTOKENS_CONNECTION_URI" "http://127.0.0.1:${SUPERTOKENS_PORT}"
  upsert_kv "$backend_env" "PUBLIC_API_BASE_URL" "${site_origin}"
  upsert_kv "$backend_env" "PLUGIN_REFRESH_SECRET" "$plugin_refresh_secret"
  upsert_kv "$backend_env" "DEV_ADMIN_SECRET" "$admin_secret"
  upsert_kv "$backend_env" "DATA_DIR" "/var/lib/starmc-api/data"

  if [[ ! -f "$web_env" ]]; then
    touch "$web_env"
  fi
  upsert_kv "$web_env" "VITE_AUTH_API_DOMAIN" "$site_origin"
  upsert_kv "$web_env" "VITE_AUTH_WEBSITE_DOMAIN" "$site_origin"
  upsert_kv "$web_env" "VITE_WEB_VITALS_ENDPOINT" "/api/metrics/web-vitals"

  if is_root; then
    chmod 600 "$backend_env" || true
    mkdir -p /var/lib/starmc-api/data
  fi

  log "环境文件已生成："
  log "  Backend: $backend_env"
  log "  Web:     $web_env"
  warn "请检查并补全后端环境中的 SMTP、数据库、VLA 对接密钥等业务项。"
  if [[ "$DOMAIN" == "star-web.top" ]]; then
    log "已按目标域名 star-web.top 生成默认生产配置。"
  fi
}

install_deps_and_build() {
  log "安装后端依赖..."
  cd "$BACKEND_DIR"
  npm ci

  if [[ "$RUN_BACKEND_DOCTOR" == "1" ]]; then
    log "执行后端环境自检（npm run doctor）..."
    npm run doctor
  fi

  if [[ "$RUN_BACKEND_SECURITY_CHECK" == "1" ]]; then
    log "执行后端安全基线检查（npm run check:security-baseline）..."
    npm run check:security-baseline
  fi

  if [[ "$ENABLE_DB_MIGRATE" == "1" ]]; then
    log "执行后端数据库迁移（npm run db:migrate）..."
    if ! npm run db:migrate; then
      if [[ "$STRICT_MIGRATION" == "1" ]]; then
        err "数据库迁移失败，STRICT_MIGRATION=1，终止部署。"
        exit 1
      fi
      warn "数据库迁移失败（可能未配置 DATABASE_URL 或数据库未就绪），继续部署。"
    fi
  fi

  if [[ "$RUN_BACKEND_VERIFY" == "1" ]]; then
    log "执行后端质量闸（npm run verify）..."
    npm run verify
  fi

  log "安装前端依赖并构建..."
  cd "$PROJECT_ROOT"
  npm ci
  npm run check:security-baseline
  npm run build
}

setup_systemd_service() {
  [[ "$ENABLE_SYSTEMD" == "1" ]] || return 0

  if ! is_root; then
    warn "当前非 root，跳过 systemd 服务安装。"
    return 0
  fi

  if ! require_cmd systemctl; then
    warn "未检测到 systemctl，跳过 systemd 配置。"
    return 0
  fi

  local service_file="/etc/systemd/system/starmc-api.service"
  cp "${SCRIPT_DIR}/starmc-api.service.example" "$service_file"

  sed -i -E "s#^WorkingDirectory=.*#WorkingDirectory=${BACKEND_DIR}#" "$service_file"
  sed -i -E "s#^ExecStart=.*#ExecStart=$(command -v node) --env-file=/etc/starmc/starmc-api.env src/server.js#" "$service_file"

  if id -u starmc >/dev/null 2>&1; then
    sed -i -E "s#^User=.*#User=starmc#" "$service_file"
    sed -i -E "s#^Group=.*#Group=starmc#" "$service_file"
  else
    sed -i -E "s#^User=.*#User=root#" "$service_file"
    sed -i -E "s#^Group=.*#Group=root#" "$service_file"
  fi

  systemctl daemon-reload
  systemctl enable starmc-api >/dev/null 2>&1 || true
  systemctl restart starmc-api
  log "systemd 服务已启动：starmc-api"
}

setup_nginx_conf() {
  [[ "$ENABLE_NGINX" == "1" ]] || return 0

  if ! require_cmd nginx; then
    warn "未检测到 nginx，跳过 Nginx 配置。"
    return 0
  fi

  if ! is_root; then
    warn "当前非 root，跳过 Nginx 写入。"
    return 0
  fi

  local target_conf=""
  if [[ -d "/www/server/panel/vhost/nginx" ]]; then
    target_conf="/www/server/panel/vhost/nginx/starmc.conf"
  elif [[ -d "/etc/nginx/conf.d" ]]; then
    target_conf="/etc/nginx/conf.d/starmc.conf"
  else
    warn "未找到可写的 Nginx 配置目录，跳过。"
    return 0
  fi

  cat > "$target_conf" <<EOF
upstream starmc_api {
  server 127.0.0.1:${API_PORT};
}
upstream starmc_plugin {
  server 127.0.0.1:${PLUGIN_PORT};
}

server {
  listen 80;
  server_name ${DOMAIN} www.${DOMAIN};

  root ${PROJECT_ROOT}/dist;
  index index.html;

  location / {
    try_files \$uri \$uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://starmc_api;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location /auth/ {
    proxy_pass http://starmc_api;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location /uploads/ {
    proxy_pass http://starmc_api;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location /plugin/ {
    proxy_pass http://starmc_plugin;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location = /healthz {
    proxy_pass http://starmc_api/healthz;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

  nginx -t
  if require_cmd systemctl; then
    systemctl reload nginx || systemctl restart nginx
  else
    nginx -s reload || true
  fi

  log "Nginx 配置已写入：$target_conf"
}

health_check() {
  log "执行健康检查..."
  sleep 2

  set +e
  curl -fsS "http://127.0.0.1:${API_PORT}/healthz" >/dev/null
  local api_ok=$?
  curl -fsS "http://127.0.0.1:${SUPERTOKENS_PORT}/hello" >/dev/null
  local st_ok=$?
  curl -fsSI "http://127.0.0.1" >/dev/null
  local ng_ok=$?
  set -e

  [[ $api_ok -eq 0 ]] && log "Backend 健康检查通过：http://127.0.0.1:${API_PORT}/healthz" || warn "Backend 健康检查失败，请查看服务日志。"
  [[ $st_ok -eq 0 ]] && log "SuperTokens 可达：http://127.0.0.1:${SUPERTOKENS_PORT}/hello" || warn "SuperTokens 不可达（若尚未启动 Core 属正常）。"
  [[ $ng_ok -eq 0 ]] && log "Nginx 本机响应正常" || warn "Nginx 本机请求失败，请检查站点配置。"
}

print_summary() {
  echo
  log "部署流程执行完毕。"
  echo "============================================================"
  echo "站点域名: ${DOMAIN}"
  echo "前端目录: ${PROJECT_ROOT}/dist"
  echo "后端目录: ${BACKEND_DIR}"
  echo "API 端口 : ${API_PORT}"
  echo "插件端口: ${PLUGIN_PORT}"
  echo "Core 端口: ${SUPERTOKENS_PORT}"
  echo "============================================================"
  echo "后续建议："
  echo "1) 在宝塔为 ${DOMAIN} 申请 SSL 并开启强制 HTTPS。"
  echo "2) 补齐 /etc/starmc/starmc-api.env 中 SMTP / 数据库 / VLA 相关密钥。"
  echo "3) 对外验收：/ /api/health /auth/signup /healthz"
}

main() {
  log "开始智能部署 StarMC（含迁移与一键发布）"
  log "项目目录：${PROJECT_ROOT}"

  ensure_base_tools
  ensure_node20
  ensure_nginx
  prepare_env_files
  install_deps_and_build
  setup_systemd_service
  setup_nginx_conf
  health_check
  print_summary
}

main "$@"
