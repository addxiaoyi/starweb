#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
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
    echo "已加载环境文件: $env_file"
  fi
}

load_env_file "$ROOT/.env.velocity.generated"
load_env_file "$ROOT/.env.velocity"

shopt -s nullglob
JARS=( "$ROOT"/velocity*.jar )
if [[ ${#JARS[@]} -eq 0 ]]; then
  echo "未找到 velocity*.jar。请从 https://papermc.io/downloads/velocity 下载 Velocity（3.4.x→Java17+，3.5.x→Java21+），将 jar 放在本目录。" >&2
  echo "No velocity*.jar. Download from Paper (3.4.x needs Java 17+, 3.5.x needs Java 21+)." >&2
  exit 1
fi
echo "使用 ${JARS[0]}，工作目录: $ROOT"
exec java -Xms512M -Xmx512M -jar "${JARS[0]}" "$@"
