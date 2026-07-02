#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR"
BACKEND_DIR="$ROOT_DIR/backend"
NODE_MIN_MAJOR=18

log() {
  printf '[setup] %s\n' "$*"
}

fail() {
  printf '[setup][error] %s\n' "$*" >&2
  exit 1
}

check_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing required command: $1"
  fi
}

node_major() {
  node -p "process.versions.node.split('.')[0]"
}

install_if_needed() {
  local dir="$1"
  local label="$2"
  if [ ! -d "$dir/node_modules" ]; then
    log "Installing ${label} dependencies..."
    (cd "$dir" && npm install)
  else
    log "${label} dependencies already installed"
  fi
}

check_command node
check_command npm

if ! command -v ss >/dev/null 2>&1 && ! command -v lsof >/dev/null 2>&1; then
  log "Tip: install 'ss' or 'lsof' for auto port detection"
fi

CURRENT_NODE_MAJOR="$(node_major)"
if [ "$CURRENT_NODE_MAJOR" -lt "$NODE_MIN_MAJOR" ]; then
  fail "Node.js ${NODE_MIN_MAJOR}+ is required, current: $(node -v)"
fi

mkdir -p "$ROOT_DIR/.runtime"

install_if_needed "$WEB_DIR" "web"
install_if_needed "$BACKEND_DIR" "backend"

if [ -f "$ROOT_DIR/package-lock.json" ]; then
  log "Web lockfile detected"
fi
if [ -f "$BACKEND_DIR/package-lock.json" ]; then
  log "Backend lockfile detected"
fi

log "Environment bootstrap complete"
