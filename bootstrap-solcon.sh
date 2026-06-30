#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:---check}"

usage() {
  cat <<'EOF'
Usage:
  ./bootstrap-solcon.sh --check        Run readiness diagnostics.
  ./bootstrap-solcon.sh --install      Install/guidance for shared dependencies, then run diagnostics.
  ./bootstrap-solcon.sh --android-avd  Provision the dedicated rootable Android demo AVD.

Supported v1 host: Apple Silicon macOS.
EOF
}

run_doctor() {
  if command -v node >/dev/null 2>&1; then
    node "$ROOT_DIR/tools/doctor-solcon.mjs"
  else
    echo "Node.js is missing, so the full doctor cannot run yet."
    echo "Install Homebrew from https://brew.sh, then run: ./bootstrap-solcon.sh --install"
    return 1
  fi
}

require_apple_silicon_mac() {
  if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
    echo "This bootstrap path currently supports Apple Silicon macOS only." >&2
    exit 1
  fi
}

install_with_brew() {
  local packages=("$@")
  if ! command -v brew >/dev/null 2>&1; then
    cat >&2 <<'EOF'
Homebrew is not installed. Install it once from:
  https://brew.sh

Then rerun:
  ./bootstrap-solcon.sh --install
EOF
    exit 1
  fi

  for package in "${packages[@]}"; do
    if brew list "$package" >/dev/null 2>&1; then
      echo "Already installed: $package"
    else
      echo "Installing: $package"
      brew install "$package"
    fi
  done
}

install_mode() {
  require_apple_silicon_mac
  install_with_brew node openjdk@17 xcodegen

  if [[ -d "/opt/homebrew/opt/openjdk@17" ]]; then
    export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
  fi

  if [[ ! -d "$ROOT_DIR/web-template/node_modules" ]]; then
    echo "Installing web-template dependencies..."
    (cd "$ROOT_DIR/web-template" && npm install)
  fi

  if [[ ! -d "$ROOT_DIR/node_modules" && -f "$ROOT_DIR/package-lock.json" ]]; then
    echo "Installing root npm dependencies..."
    (cd "$ROOT_DIR" && npm install)
  fi

  cat <<'EOF'

Manual checks that may still require GUI/admin approval:
- Install Xcode from the App Store and open it once.
- Accept Xcode first-launch/license prompts.
- Install Android Studio, then Android SDK Command-line Tools from SDK Manager if missing.
- Confirm the Zscaler Root CA is in the macOS System keychain if you are on the corporate network.
EOF

  run_doctor
}

case "$MODE" in
  --check)
    run_doctor
    ;;
  --install)
    install_mode
    ;;
  --android-avd)
    require_apple_silicon_mac
    "$ROOT_DIR/android-shell/tools/provision-demo-avd.sh"
    ;;
  -h|--help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
