#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIME_SYNC_SCRIPT="${TIME_SYNC_SCRIPT:-$SCRIPT_DIR/sync-emulator-network-time.mjs}"
MODE="${1:---once}"
DEVICE_SERIAL="${2:-${ANDROID_SERIAL:-}}"
ADB="${ADB:-${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb}"

usage() {
  cat >&2 <<'EOF'
Usage:
  ensure-time-sync-guard.sh --once <android-serial>
  ensure-time-sync-guard.sh --watch-owned <android-serial>

--once performs a foreground clock check and exits. --watch-owned is reserved
for the launcher authority: it stays in the foreground so the launcher remains
the process owner and can stop it cleanly.
EOF
  exit 2
}

[[ "$MODE" == "--once" || "$MODE" == "--watch-owned" ]] || usage
[[ -n "$DEVICE_SERIAL" ]] || usage
[[ -x "$TIME_SYNC_SCRIPT" ]] || {
  echo "Error: time sync script is not executable: $TIME_SYNC_SCRIPT" >&2
  exit 1
}

if [[ "$MODE" == "--watch-owned" ]]; then
  OWNER_PID="${BRAZE_DEMO_LAUNCHER_OWNER_PID:-}"
  OWNER_INSTANCE="${BRAZE_DEMO_LAUNCHER_INSTANCE_ID:-}"
  [[ "$OWNER_PID" =~ ^[0-9]+$ && "$OWNER_PID" == "$PPID" && -n "$OWNER_INSTANCE" ]] || {
    echo "Error: continuous Android clock watching must be spawned and owned by the launcher authority." >&2
    exit 1
  }
  exec env ANDROID_SERIAL="$DEVICE_SERIAL" ADB="$ADB" "$TIME_SYNC_SCRIPT" --watch
fi

exec env ANDROID_SERIAL="$DEVICE_SERIAL" ADB="$ADB" "$TIME_SYNC_SCRIPT"
