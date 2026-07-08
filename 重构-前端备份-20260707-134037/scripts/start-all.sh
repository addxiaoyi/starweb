#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
WEB_DIR="$ROOT_DIR"
BACKEND_DIR="$ROOT_DIR/backend"
RUNTIME_DIR="$ROOT_DIR/.runtime"
SETUP_SCRIPT="$ROOT_DIR/scripts/setup-linux.sh"
WEB_GENERATED_ENV="$ROOT_DIR/.env.starmc.generated"
WEB_MODE_GENERATED_ENV="$ROOT_DIR/.env.starmc.development.generated"
BACKEND_GENERATED_ENV="$BACKEND_DIR/.env.generated"
mkdir -p "$RUNTIME_DIR"

check_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

read_env_value() {
  local file_path="$1"
  local key="$2"

  if [ ! -f "$file_path" ]; then
    return 1
  fi

  node -e "
    const fs = require('fs')
    const filePath = process.argv[1]
    const key = process.argv[2]
    const text = fs.readFileSync(filePath, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const idx = line.indexOf('=')
      if (idx <= 0) continue
      const currentKey = line.slice(0, idx).trim()
      if (currentKey !== key) continue
      let value = line.slice(idx + 1).trim()
      if (value.length >= 2) {
        const first = value[0]
        const last = value[value.length - 1]
        if ((first === '\"' && last === '\"') || (first === '\'' && last === '\'')) {
          value = value.slice(1, -1)
        }
      }
      process.stdout.write(value)
      process.exit(0)
    }
    process.exit(1)
  " "$file_path" "$key"
}

check_command node
check_command npm

if [ ! -x "$SETUP_SCRIPT" ]; then
  chmod +x "$SETUP_SCRIPT" 2>/dev/null || true
fi

echo "Refreshing generated configuration from repository root..."
( cd "$REPO_ROOT" && npm run config:doctor:simple )

if [ ! -d "$WEB_DIR/node_modules" ] || [ ! -d "$BACKEND_DIR/node_modules" ]; then
  bash "$SETUP_SCRIPT"
fi

WEB_ORIGIN="$(read_env_value "$WEB_GENERATED_ENV" "VITE_PUBLIC_SITE_ORIGIN" || true)"
PLUGIN_TARGET="$(read_env_value "$WEB_MODE_GENERATED_ENV" "VITE_LOCAL_PLUGIN_TARGET" || true)"
BACKEND_ORIGIN="$(read_env_value "$BACKEND_GENERATED_ENV" "PUBLIC_API_BASE_URL" || true)"
BACKEND_PORT="$(read_env_value "$BACKEND_GENERATED_ENV" "PORT" || true)"
PLUGIN_PORT="$(read_env_value "$BACKEND_GENERATED_ENV" "PLUGIN_PORT" || true)"

if [ -z "$WEB_ORIGIN" ] || [ -z "$PLUGIN_TARGET" ] || [ -z "$BACKEND_ORIGIN" ] || [ -z "$BACKEND_PORT" ] || [ -z "$PLUGIN_PORT" ]; then
  echo "Generated configuration is incomplete. Run 'npm run config:doctor' at repository root and verify the generated env files." >&2
  exit 1
fi

WEB_PORT="$(node -e "const u = new URL(process.argv[1]); process.stdout.write(String(u.port || (u.protocol === 'https:' ? 443 : 80)))" "$WEB_ORIGIN")"

assert_port_available() {
  local port="$1"
  local name="$2"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :$port )" | tail -n +2 | grep -q .; then
      echo "$name port $port is already in use. Update the simple config or stop the existing process, then rerun the script." >&2
      exit 1
    fi
    return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$name port $port is already in use. Update the simple config or stop the existing process, then rerun the script." >&2
      exit 1
    fi
    return 0
  fi
  echo "Warning: neither 'ss' nor 'lsof' was found. Port availability was not checked." >&2
}

assert_port_available "$WEB_PORT" "Web"
assert_port_available "$BACKEND_PORT" "Backend"

cleanup() {
  kill "$BACKEND_PID" "$WEB_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "Starting backend using generated config on port $BACKEND_PORT..."
( cd "$BACKEND_DIR" && npm run dev:simple ) &
BACKEND_PID=$!

echo "Starting web using generated config at $WEB_ORIGIN..."
( cd "$WEB_DIR" && npm run dev -- --host 0.0.0.0 --port "$WEB_PORT" ) &
WEB_PID=$!

echo "Web:      $WEB_ORIGIN"
echo "Backend:  $BACKEND_ORIGIN"
echo "Plugin:   $PLUGIN_TARGET"
echo "Config:   generated via npm run config:doctor"
echo "Runtime:  $RUNTIME_DIR"
echo "Backend configured plugin port: $PLUGIN_PORT"

wait "$BACKEND_PID" "$WEB_PID"
