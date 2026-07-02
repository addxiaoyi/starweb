#!/usr/bin/env bash
# Copies a StarVelocity jar into ./plugins/
# Usage: ./copy-plugin.sh [auto|default|velocity35]
# default: Java 17 / Velocity 3.4 API
# velocity35: Java 21 / Velocity 3.5 API
set -euo pipefail
VARIANT="${1:-auto}"
case "$VARIANT" in
  auto|default|velocity35) ;;
  *)
    echo "用法: $0 [auto|default|velocity35]" >&2
    exit 2
    ;;
esac
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOD="$HERE/../velocity-limbo-auth/target"
DEST="$HERE/plugins"
if [[ ! -d "$HERE/../velocity-limbo-auth" ]]; then
  echo "未找到 velocity-limbo-auth 目录" >&2
  exit 1
fi
shopt -s nullglob
case "$VARIANT" in
  default)
    CAND=( "$MOD"/StarVelocity-4.0.0.jar )
    ;;
  velocity35)
    CAND=( "$MOD"/StarVelocity-4.0.0-velocity35-java21.jar )
    ;;
  *)
    CAND=( "$MOD"/StarVelocity-*.jar "$MOD"/Velocity-Limbo-Auth*.jar )
    ;;
esac
if [[ ${#CAND[@]} -eq 0 ]]; then
  echo "未找到构建产物：$VARIANT" >&2
  echo "默认构建:  在 velocity-limbo-auth 目录执行 mvn -U clean package" >&2
  echo "Velocity 3.5: 在 velocity-limbo-auth 目录执行 mvn -U -Pvelocity35 clean package" >&2
  exit 1
fi
SRC=""
for f in "${CAND[@]}"; do
  case "$f" in
    *original*|*shaded*) continue ;;
  esac
  if [[ -z "$SRC" || "$f" -nt "$SRC" ]]; then
    SRC="$f"
  fi
done
if [[ -z "$SRC" ]]; then
  SRC="${CAND[0]}"
fi
mkdir -p "$DEST"
rm -f "$DEST"/StarVelocity-*.jar "$DEST"/Velocity-Limbo-Auth*.jar
cp -f "$SRC" "$DEST/"
echo "已复制: $(basename "$SRC") -> plugins/"
