#!/usr/bin/env bash
# build-web-release.sh — one-shot: build OnePage firmware, merge into a single
# 0x0 flash image, and drop it (plus manifest.json) into web/public/firmware/
# so the browser flasher at /firmware can serve it same-origin.
#
# Usage:
#   ./scripts/build-web-release.sh                  # default version "dev"
#   ./scripts/build-web-release.sh v0.1.1           # tag-style version
#   ./scripts/build-web-release.sh v1.0.0 --skip-build
#   ./scripts/build-web-release.sh --help
#
# Requires: PlatformIO (pio) and esptool v5 (invoked via `python3 -m esptool`).
# The three flash offsets (0x0 / 0x8000 / 0x10000) must match partitions.csv.
set -euo pipefail

# ── Locate repo roots (script is under firmware/scripts/) ────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FW_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${FW_ROOT}/.." && pwd)"
WEB_FW_DIR="${REPO_ROOT}/web/public/firmware"
BUILD_DIR="${FW_ROOT}/.pio/build/onepage"

# ── Args ─────────────────────────────────────────────────────────────────────
VERSION="dev"
SKIP_BUILD=0
usage() {
  cat <<'EOF'
Usage: scripts/build-web-release.sh [VERSION] [options]

  VERSION          Optional tag/label embedded in the bin filename and manifest.
                   Default: "dev"

Options:
  --skip-build     Skip `pio run`; reuse existing .pio/build/onepage/*.bin.
  --env NAME       PlatformIO env name (default: onepage).
  --python PATH    Python interpreter providing esptool (default: python3).
  -h, --help       Show this help.

Output artifacts (overwrites in place):
  web/public/firmware/onepage-firmware-<VERSION>.bin
  web/public/firmware/manifest.json
EOF
}

ENV_NAME="onepage"
PY="${PYTHON:-python3}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --env)        ENV_NAME="$2"; shift 2 ;;
    --python)     PY="$2"; shift 2 ;;
    --*)          echo "Unknown option: $1" >&2; usage; exit 2 ;;
    *)            VERSION="$1"; shift ;;
  esac
done

# Sanitize VERSION for use as a filename (keep dots, dashes, underscores).
SAFE_VERSION="$(printf '%s' "${VERSION}" | tr -cd 'A-Za-z0-9._-')"
BIN_NAME="onepage-firmware-${SAFE_VERSION}.bin"

echo "── OnePage web release ────────────────────────────────"
echo "  Version      : ${VERSION}"
echo "  PIO env      : ${ENV_NAME}"
echo "  Output bin   : web/public/firmware/${BIN_NAME}"
echo "  Manifest     : web/public/firmware/manifest.json"
echo

# ── 1. Build ─────────────────────────────────────────────────────────────────
if [[ ${SKIP_BUILD} -eq 0 ]]; then
  echo "▶ pio run -e ${ENV_NAME}"
  (cd "${FW_ROOT}" && pio run -e "${ENV_NAME}")
  echo
else
  echo "▶ skipping build (--skip-build)"
fi

# ── 2. Sanity-check three inputs exist and look fresh ────────────────────────
for f in bootloader.bin partitions.bin firmware.bin; do
  p="${BUILD_DIR}/${f}"
  [[ -f "${p}" ]] || { echo "✗ missing ${p}. Run without --skip-build first." >&2; exit 1; }
done

# ── 3. Merge to a single 0x0 image ───────────────────────────────────────────
# Offsets MUST match firmware/partitions.csv:
#   app0 @ 0x10000 → firmware.bin
#   partition table @ 0x8000
#   bootloader @ 0x0
mkdir -p "${WEB_FW_DIR}"
OUT_BIN="${WEB_FW_DIR}/${BIN_NAME}"

echo "▶ esptool merge-bin (bootloader@0x0, partitions@0x8000, app@0x10000)"
"${PY}" -m esptool --chip esp32c61 merge-bin \
  -o "${OUT_BIN}" \
  --flash-mode dio --flash-freq 80m --flash-size 16MB \
  0x0     "${BUILD_DIR}/bootloader.bin" \
  0x8000  "${BUILD_DIR}/partitions.bin" \
  0x10000 "${BUILD_DIR}/firmware.bin"
echo

# ── 4. Write manifest.json (same-origin relative path) ───────────────────────
# Strip leading "v" from VERSION to mirror the CI generator's convention.
MVN="${SAFE_VERSION#v}"
MAN="${WEB_FW_DIR}/manifest.json"

echo "▶ writing manifest.json"
cat > "${MAN}" <<JSON
{
  "name": "OnePage",
  "version": "${MVN}",
  "new_install_prompt_erase": false,
  "builds": [
    {
      "chipFamily": "ESP32-C61",
      "parts": [{ "path": "${BIN_NAME}", "offset": 0 }]
    }
  ]
}
JSON

# ── 5. Cleanup: delete the previous default v0.1.0 bin if we produced a new one
# (kept as a soft hint — only if user replaced the release pointer).
if [[ "${BIN_NAME}" != "onepage-firmware-v0.1.0.bin" && -f "${WEB_FW_DIR}/onepage-firmware-v0.1.0.bin" ]]; then
  : # intentionally keep the old bin in-place; user can delete manually.
fi

# ── Summary ──────────────────────────────────────────────────────────────────
SIZE=$(wc -c < "${OUT_BIN}" | tr -d ' ')
echo "✓ done"
echo "  ${OUT_BIN#$REPO_ROOT/}  (${SIZE} bytes)"
echo "  ${MAN#$REPO_ROOT/}"
echo
echo "Next: serve the web site and flash from browser (Chrome / Edge, Web Serial):"
echo "  cd ${REPO_ROOT#$HOME/}/web && npm install && npm run dev"
echo "  → open http://localhost:4321/firmware (or /zh/firmware)"
echo "  → connect device via USB-C, click 'Connect'."
