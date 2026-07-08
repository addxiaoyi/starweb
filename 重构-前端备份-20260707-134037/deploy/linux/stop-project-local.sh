#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

stop_pid_file() {
  local name="$1"
  local pid_file="$2"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" || true
      echo "[stop] ${name} (${pid})"
    fi
    rm -f "$pid_file"
  fi
}

stop_pid_file "web" "${PROJECT_ROOT}/.runtime/web.pid"
stop_pid_file "backend" "${PROJECT_ROOT}/.runtime/backend.pid"
stop_pid_file "supertokens" "${PROJECT_ROOT}/.runtime/supertokens.pid"

echo "[ok] 已停止项目内进程"