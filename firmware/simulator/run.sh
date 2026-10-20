#!/usr/bin/env bash
# Build (incrementally) and launch the native desktop simulator.
#
#   simulator/run.sh                  # default SD root: simulator/sd_root/
#   simulator/run.sh --scale 2        # extra args are forwarded to the binary
#   simulator/run.sh --sd-root /tmp/sd
#
# Prerequisites: cmake + SDL2 (brew install sdl2 cmake). The first run configures
# the build directory and fetches ArduinoJson/QRCode via FetchContent; every later
# run only recompiles what changed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

if [[ ! -f "$BUILD_DIR/CMakeCache.txt" ]]; then
  cmake -S "$SCRIPT_DIR" -B "$BUILD_DIR"
fi
cmake --build "$BUILD_DIR" -j

exec "$BUILD_DIR/crosspoint_simulator" "$@"
