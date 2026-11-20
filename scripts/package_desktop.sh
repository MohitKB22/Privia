#!/usr/bin/env bash
# Build PRIVIA's installers for this computer's platform.
#
# Steps: freeze the backend into a sidecar, smoke-test it, draw the icons,
# build the Tauri app, and copy the installers into ./release with stable names.
# Run from a virtualenv with the project installed (make install-dev).
set -euo pipefail
cd "$(dirname "$0")/.."

PY="${PY:-python}"
command -v node >/dev/null || { echo "Node.js 20+ is required: https://nodejs.org"; exit 1; }
if ! command -v cargo >/dev/null; then
  echo "Rust is required to build the desktop app: https://rustup.rs"
  echo "You can still run the UI in a browser with: make dev"
  exit 1
fi

target="${TARGET:-$(rustc -vV | sed -n 's/^host: //p')}"
case "$target" in
  *apple-darwin)  label="macos-$([[ $target == aarch64* ]] && echo arm64 || echo x64)"; bundles="app,dmg" ;;
  *windows*)      label="windows-x64"; bundles="msi,nsis" ;;
  *)              label="linux-x64"; bundles="deb,rpm,appimage" ;;
esac
suffix=""; [[ "$target" == *windows* ]] && suffix=".exe"

echo "==> Backend sidecar for $target"
"$PY" -m pip install --quiet "pyinstaller>=6.10" pillow
"$PY" packaging/backend/build_sidecar.py --target "$target"
"$PY" packaging/backend/smoke_test.py "apps/desktop/src-tauri/binaries/privia-backend-${target}${suffix}"

echo "==> Desktop UI"
(cd apps/desktop && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund))
"$PY" scripts/make_icons.py

echo "==> Installers ($bundles)"
(cd apps/desktop && npx tauri build --target "$target" --bundles "$bundles")
"$PY" packaging/collect_artifacts.py --label "$label" --target "$target"

echo ""
echo "Installers are in ./release"
