#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR"
BACKEND_DIR="$ROOT_DIR/backend"

ok() { printf '[doctor] %s\n' "$*"; }
warn() { printf '[doctor][warn] %s\n' "$*" >&2; }
fail() { printf '[doctor][error] %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "node not found"
command -v npm >/dev/null 2>&1 || fail "npm not found"

ok "node: $(node -v)"
ok "npm: $(npm -v)"

if command -v ss >/dev/null 2>&1; then
  ok "port tool: ss"
elif command -v lsof >/dev/null 2>&1; then
  ok "port tool: lsof"
else
  warn "neither ss nor lsof found"
fi

[ -d "$WEB_DIR" ] || fail "web directory missing"
[ -d "$BACKEND_DIR" ] || fail "backend directory missing"
[ -f "$WEB_DIR/package.json" ] || fail "web package.json missing"
[ -f "$BACKEND_DIR/package.json" ] || fail "backend package.json missing"

if [ -d "$WEB_DIR/node_modules" ]; then
  ok "web dependencies installed"
else
  warn "web dependencies missing"
fi

if [ -d "$BACKEND_DIR/node_modules" ]; then
  ok "backend dependencies installed"
else
  warn "backend dependencies missing"
fi

ok "startup doctor completed"
