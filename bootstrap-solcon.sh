#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="--check"
TARGET="all"
MODE_SET="0"

usage() {
  cat <<'EOF'
Usage:
  ./bootstrap-solcon.sh --check [--target all|android|ios|web]
  ./bootstrap-solcon.sh --install [--target all|android|ios|web]
  ./bootstrap-solcon.sh --android-avd [--target android]

Android-first setup does not require Xcode or iOS tooling:
  ./bootstrap-solcon.sh --install --target android
  ./bootstrap-solcon.sh --android-avd --target android
  ./bootstrap-solcon.sh --check --target android

Lumo public setup may use ./bootstrap-lumo.sh with the same flags.

Supported v1 host: Apple Silicon macOS.
EOF
}

run_doctor() {
  local allow_missing_avd="${1:-0}"
  if command -v node >/dev/null 2>&1; then
    if [[ "$allow_missing_avd" == "1" ]]; then
      BRAZE_DEMO_DOCTOR_ALLOW_MISSING_AVD=1 \
        node "$ROOT_DIR/tools/doctor-solcon.mjs" --target "$TARGET"
    else
      node "$ROOT_DIR/tools/doctor-solcon.mjs" --target "$TARGET"
    fi
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
  local packages=(node)
  if [[ "$TARGET" == "all" || "$TARGET" == "android" ]]; then
    packages+=(openjdk@17)
  fi
  if [[ "$TARGET" == "all" || "$TARGET" == "ios" ]]; then
    packages+=(xcodegen)
  fi
  install_with_brew "${packages[@]}"

  if [[ -d "/opt/homebrew/opt/openjdk@17" ]]; then
    export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
  fi

  if [[ ! -d "$ROOT_DIR/web-template/node_modules" ]]; then
    echo "Installing web-template dependencies..."
    (cd "$ROOT_DIR/web-template" && npm ci --no-audit --no-fund)
  fi

  if [[ ! -d "$ROOT_DIR/node_modules" && -f "$ROOT_DIR/package-lock.json" ]]; then
    echo "Installing root npm dependencies..."
    (cd "$ROOT_DIR" && npm ci --no-audit --no-fund)
  fi

  if [[ "$TARGET" == "all" || "$TARGET" == "ios" ]]; then
    cat <<'EOF'

Manual iOS checks that may still require GUI/admin approval:
- Install Xcode from the App Store and open it once.
- Accept Xcode first-launch/license prompts.
EOF
  fi
  if [[ "$TARGET" == "all" || "$TARGET" == "android" ]]; then
    cat <<'EOF'

Manual Android checks that may still require GUI/admin approval:
- Install Android Studio, then Android SDK Command-line Tools from SDK Manager if missing.
- Confirm the Zscaler Root CA is in the macOS System keychain if you are on the corporate network.
EOF
  fi

  # A missing AVD is the expected next step after host dependencies. Keep it
  # visible as a warning here; the final Android doctor remains strict.
  run_doctor 1
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --check|--install|--android-avd)
      if [[ "$MODE_SET" == "1" ]]; then
        echo "Choose exactly one of --check, --install, or --android-avd." >&2
        usage >&2
        exit 1
      fi
      MODE="$1"
      MODE_SET="1"
      shift
      ;;
    --target)
      [[ "$#" -ge 2 ]] || { echo "--target requires all, android, ios, or web." >&2; exit 1; }
      TARGET="$2"
      shift 2
      ;;
    --target=*)
      TARGET="${1#--target=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$TARGET" in
  all|android|ios|web) ;;
  *)
    echo "Unsupported target '$TARGET'. Use all, android, ios, or web." >&2
    exit 1
    ;;
esac

if [[ "$MODE" == "--android-avd" && "$TARGET" != "all" && "$TARGET" != "android" ]]; then
  echo "--android-avd only supports --target android (or the default all target)." >&2
  exit 1
fi

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
  *)
    usage >&2
    exit 1
    ;;
esac
