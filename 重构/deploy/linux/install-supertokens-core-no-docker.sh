#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install SuperTokens Core on Linux without Docker by extracting image layers.

Usage:
  install-supertokens-core-no-docker.sh [options]

Options:
  --plugin <postgresql|mysql>  Core image flavor. Default: postgresql
  --tag <version>              Image tag. Defaults:
                               postgresql -> 11.4.4
                               mysql      -> 10.1.4
  --install-dir <path>         Install directory. Default: /opt/supertokens
  --user <name>                Runtime user to own install dir. Default: supertokens
  --group <name>               Runtime group to own install dir. Default: supertokens
  --skip-user-setup            Skip user/group creation and chown even when running as root
  --keep-workdir               Keep temporary extraction directory for debugging
  -h, --help                   Show this help

Examples:
  sudo bash deploy/linux/install-supertokens-core-no-docker.sh
  sudo bash deploy/linux/install-supertokens-core-no-docker.sh --plugin mysql --tag 10.1.4
EOF
}

PLUGIN="postgresql"
TAG=""
INSTALL_DIR="/opt/supertokens"
RUNTIME_USER="supertokens"
RUNTIME_GROUP="supertokens"
SKIP_USER_SETUP="0"
KEEP_WORKDIR="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plugin)
      PLUGIN="${2:-}"
      shift 2
      ;;
    --tag)
      TAG="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --user)
      RUNTIME_USER="${2:-}"
      shift 2
      ;;
    --group)
      RUNTIME_GROUP="${2:-}"
      shift 2
      ;;
    --skip-user-setup)
      SKIP_USER_SETUP="1"
      shift
      ;;
    --keep-workdir)
      KEEP_WORKDIR="1"
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

case "${PLUGIN}" in
  postgresql|postgres)
    PLUGIN="postgresql"
    REPO="supertokens/supertokens-postgresql"
    DEFAULT_TAG="11.4.4"
    ;;
  mysql)
    REPO="supertokens/supertokens-mysql"
    DEFAULT_TAG="10.1.4"
    ;;
  *)
    echo "[error] --plugin must be postgresql or mysql" >&2
    exit 1
    ;;
esac

if [[ -z "${TAG}" ]]; then
  TAG="${DEFAULT_TAG}"
fi

for cmd in curl tar python3 install cp mkdir chmod; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[error] missing required command: ${cmd}" >&2
    exit 1
  fi
done

ARCH_RAW="$(uname -m)"
case "${ARCH_RAW}" in
  x86_64|amd64)
    ARCH="amd64"
    ;;
  aarch64|arm64)
    ARCH="arm64"
    ;;
  *)
    echo "[error] unsupported architecture: ${ARCH_RAW}" >&2
    exit 1
    ;;
esac

REGISTRY="registry.supertokens.io"
BASE_URL="https://${REGISTRY}/v2/${REPO}"
ACCEPT_INDEX="application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json"
ACCEPT_MANIFEST="application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json"

WORK_DIR="$(mktemp -d -t supertokens-install-XXXXXX)"
ROOTFS_DIR="${WORK_DIR}/rootfs"
mkdir -p "${ROOTFS_DIR}"

cleanup() {
  if [[ "${KEEP_WORKDIR}" == "1" ]]; then
    echo "[info] keep workdir: ${WORK_DIR}"
    return
  fi
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

echo "[info] plugin      : ${PLUGIN}"
echo "[info] repo        : ${REPO}"
echo "[info] tag         : ${TAG}"
echo "[info] arch        : ${ARCH}"
echo "[info] install dir : ${INSTALL_DIR}"

fetch_manifest_by_ref() {
  local ref="$1"
  local accept="$2"
  curl -fsSL --retry 3 --retry-delay 1 \
    -H "Accept: ${accept}" \
    "${BASE_URL}/manifests/${ref}"
}

MANIFEST_JSON="$(fetch_manifest_by_ref "${TAG}" "${ACCEPT_INDEX}")"
MANIFEST_MEDIA_TYPE="$(
  printf '%s' "${MANIFEST_JSON}" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("mediaType",""))'
)"

if [[ "${MANIFEST_MEDIA_TYPE}" == *"image.index"* || "${MANIFEST_MEDIA_TYPE}" == *"manifest.list"* ]]; then
  echo "[info] multi-arch manifest detected, resolving linux/${ARCH}..."
  RESOLVED_DIGEST="$(
    printf '%s' "${MANIFEST_JSON}" | python3 - "${ARCH}" <<'PY'
import json
import sys

arch = sys.argv[1]
doc = json.load(sys.stdin)
for item in doc.get("manifests", []):
    platform = item.get("platform") or {}
    if platform.get("os") == "linux" and platform.get("architecture") == arch:
        digest = item.get("digest")
        if digest:
            print(digest)
            raise SystemExit(0)
raise SystemExit(1)
PY
  )" || {
    echo "[error] failed to resolve linux/${ARCH} digest from image index" >&2
    exit 1
  }
  MANIFEST_JSON="$(fetch_manifest_by_ref "${RESOLVED_DIGEST}" "${ACCEPT_MANIFEST}")"
fi

mapfile -t LAYER_DIGESTS < <(
  printf '%s' "${MANIFEST_JSON}" | python3 - <<'PY'
import json
import sys

doc = json.load(sys.stdin)
layers = doc.get("layers", [])
if not layers:
    raise SystemExit(1)
for layer in layers:
    digest = layer.get("digest")
    if digest:
        print(digest)
PY
) || {
  echo "[error] failed to parse layer digests from manifest" >&2
  exit 1
}

echo "[info] downloading and extracting ${#LAYER_DIGESTS[@]} layers..."
for digest in "${LAYER_DIGESTS[@]}"; do
  layer_file="${WORK_DIR}/${digest#sha256:}.tar.gz"
  echo "[info] layer ${digest}"
  curl -fsSL --retry 3 --retry-delay 1 \
    "${BASE_URL}/blobs/${digest}" \
    -o "${layer_file}"
  tar -xzf "${layer_file}" -C "${ROOTFS_DIR}"
done

if [[ ! -d "${ROOTFS_DIR}/usr/lib/supertokens" ]]; then
  echo "[error] extracted image does not contain /usr/lib/supertokens" >&2
  exit 1
fi

install -d -m 0755 "${INSTALL_DIR}"
install -d -m 0755 "${INSTALL_DIR}/usr/lib"
rm -rf "${INSTALL_DIR}/usr/lib/supertokens"
cp -a "${ROOTFS_DIR}/usr/lib/supertokens" "${INSTALL_DIR}/usr/lib/supertokens"

cat > "${INSTALL_DIR}/supertokens" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_HOME="${SUPERTOKENS_CORE_HOME:-${ROOT_DIR}/usr/lib/supertokens}"

if [[ ! -d "${CORE_HOME}" ]]; then
  echo "[error] core home not found: ${CORE_HOME}" >&2
  exit 1
fi

if [[ -x "${CORE_HOME}/jre/bin/java" ]]; then
  JAVA_BIN="${CORE_HOME}/jre/bin/java"
else
  JAVA_BIN="${JAVA_BIN:-java}"
fi

CLASSPATH="${CORE_HOME}/core/*:${CORE_HOME}/plugin-interface/*:${CORE_HOME}/plugin/*:${CORE_HOME}/ee/*"

exec "${JAVA_BIN}" -classpath "${CLASSPATH}" io.supertokens.Main "${CORE_HOME}/" "$@"
EOF
chmod 0755 "${INSTALL_DIR}/supertokens"

if [[ "${SKIP_USER_SETUP}" != "1" && "$(id -u)" -eq 0 ]]; then
  if ! getent group "${RUNTIME_GROUP}" >/dev/null 2>&1; then
    groupadd --system "${RUNTIME_GROUP}"
  fi

  if ! id -u "${RUNTIME_USER}" >/dev/null 2>&1; then
    NOLOGIN_SHELL="$(command -v nologin || true)"
    if [[ -z "${NOLOGIN_SHELL}" ]]; then
      NOLOGIN_SHELL="/usr/sbin/nologin"
    fi
    useradd --system --home "${INSTALL_DIR}" --shell "${NOLOGIN_SHELL}" --gid "${RUNTIME_GROUP}" "${RUNTIME_USER}"
  fi

  chown -R "${RUNTIME_USER}:${RUNTIME_GROUP}" "${INSTALL_DIR}"
fi

CORE_VERSION="$(
  awk -F': *' '/^core_version:/ {print $2}' "${INSTALL_DIR}/usr/lib/supertokens/version.yaml" 2>/dev/null || true
)"

echo "[ok] SuperTokens Core installed."
if [[ -n "${CORE_VERSION}" ]]; then
  echo "[ok] core version: ${CORE_VERSION}"
fi
echo "[ok] launcher     : ${INSTALL_DIR}/supertokens"
echo "[next] copy env template and set DB URI:"
echo "       sudo cp deploy/linux/supertokens-core.env.example /etc/supertokens/core.env"
echo "       sudo chmod 600 /etc/supertokens/core.env"
echo "       sudoedit /etc/supertokens/core.env"
