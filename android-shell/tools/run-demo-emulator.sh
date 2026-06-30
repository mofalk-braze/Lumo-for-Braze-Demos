#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$ROOT_DIR/.." && pwd)"

ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="${ADB:-$ANDROID_HOME/platform-tools/adb}"
EMULATOR="${EMULATOR:-$ANDROID_HOME/emulator/emulator}"
DEFAULT_AVD="${BRAZE_DEMO_ANDROID_AVD:-Braze_Demo_API_36}"
AVD="${AVD:-$DEFAULT_AVD}"
INSTALL_APP="${INSTALL_APP:-1}"
LAUNCH_APP="${LAUNCH_APP:-1}"
APP_ID="${APP_ID:-com.braze.demoshell}"
ANDROID_USER="${ANDROID_USER:-0}"
RESET_APP_DATA="${RESET_APP_DATA:-0}"

wait_for_boot() {
  "$ADB" wait-for-device
  until [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    sleep 2
  done

  "$ADB" shell locksettings set-disabled true >/dev/null 2>&1 || true

  for _ in $(seq 1 60); do
    local user_state=""
    user_state="$("$ADB" shell dumpsys user 2>/dev/null | awk '
      /UserInfo\{0:/ { in_user = 1 }
      in_user && /State:/ { print $2; exit }
    ' | tr -d '\r' || true)"
    if [[ "$user_state" == "RUNNING_UNLOCKED" ]]; then
      return 0
    fi

    "$ADB" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
    "$ADB" shell wm dismiss-keyguard >/dev/null 2>&1 || true
    "$ADB" shell input keyevent 82 >/dev/null 2>&1 || true
    "$ADB" shell input swipe 640 2400 640 400 500 >/dev/null 2>&1 || true
    sleep 2
  done

  echo "Emulator booted, but user 0 did not unlock. Unlock the AVD once or use an AVD without a lock screen." >&2
  return 1
}

wait_for_launcher_activity() {
  local component=""
  for _ in $(seq 1 30); do
    component="$("$ADB" shell cmd package resolve-activity --brief \
      --user "$ANDROID_USER" \
      -a android.intent.action.MAIN \
      -c android.intent.category.LAUNCHER \
      -p "$APP_ID" 2>/dev/null | tr -d '\r' | tail -n 1 || true)"
    if [[ "$component" == "$APP_ID/"* ]]; then
      printf '%s' "$component"
      return 0
    fi
    sleep 1
  done

  echo "Could not resolve launcher activity for $APP_ID." >&2
  "$ADB" shell pm list packages | grep "$APP_ID" >&2 || true
  return 1
}

print_trust_remediation() {
  cat >&2 <<'EOF'

Android emulator system trust could not be prepared.

This corporate-network demo path requires a rootable Google APIs emulator image so the
Zscaler root CA can be installed into Android system and Conscrypt trust stores.
Production and Google Play images do not allow `adb root`/system remount and are not
supported for push/IAM validation when the host Zscaler CA is present.

Remediation:
  1. Create or select an AVD based on a Google APIs image, not a Google Play image.
  2. Start it with -writable-system through this wrapper.
  3. Rerun the Control Room launch. Do not reset app data unless you are deliberately
     recovering a broken SDK device identity.
EOF
}

if [[ ! -x "$ADB" ]]; then
  echo "adb not found at $ADB. Set ANDROID_HOME or ADB." >&2
  exit 1
fi

if [[ ! -x "$EMULATOR" ]]; then
  echo "emulator not found at $EMULATOR. Set ANDROID_HOME or EMULATOR." >&2
  exit 1
fi

if ! "$EMULATOR" -list-avds | grep -Fxq "$AVD"; then
  cat >&2 <<EOF
Android AVD '$AVD' does not exist.

Create the dedicated rootable demo AVD, then rerun launch:
  android-shell/tools/provision-demo-avd.sh

Override with AVD=<name> or BRAZE_DEMO_ANDROID_AVD=<name> only when the target is
a rootable Google APIs image. Google Play images are not supported for Zscaler
trust-backed IAM/push validation.
EOF
  exit 1
fi

echo "Stopping any running emulator..."
"$ADB" emu kill >/dev/null 2>&1 || true
if command -v screen >/dev/null 2>&1; then
  screen -S braze-demo-emulator -X quit >/dev/null 2>&1 || true
fi
sleep 3

echo "Starting $AVD with writable system partition..."
if command -v screen >/dev/null 2>&1; then
  screen -dmS braze-demo-emulator bash -lc \
    "exec \"\$0\" -avd \"\$1\" -writable-system -no-snapshot-load -no-snapshot-save >/tmp/lumo-demo-emulator.log 2>&1" \
    "$EMULATOR" "$AVD"
else
  nohup "$EMULATOR" -avd "$AVD" -writable-system -no-snapshot-load -no-snapshot-save >/tmp/lumo-demo-emulator.log 2>&1 &
fi

wait_for_boot

if security find-certificate -a -c "Zscaler Root CA" /Library/Keychains/System.keychain >/dev/null 2>&1; then
  echo "Applying Zscaler system trust pattern..."
  if ! "$SCRIPT_DIR/install-zscaler-system-ca.sh"; then
    print_trust_remediation
    exit 1
  fi
else
  echo "No Zscaler Root CA found in macOS System keychain; skipping CA install."
fi

if [[ "$INSTALL_APP" == "1" ]]; then
  if [[ "$RESET_APP_DATA" == "1" ]]; then
    echo "RESET_APP_DATA=1: removing previous demo shell install and SDK storage..."
    "$ADB" uninstall "$APP_ID" >/dev/null 2>&1 || true
  else
    echo "Installing debug APK while preserving app data and SDK device identity..."
  fi
  echo "Installing debug APK..."
  (cd "$ROOT_DIR" && ./gradlew installDebug)
fi

if [[ "$LAUNCH_APP" == "1" ]]; then
  echo "Force-stopping any existing demo shell process..."
  "$ADB" shell am force-stop --user "$ANDROID_USER" "$APP_ID" >/dev/null 2>&1 || true
  echo "Launching Braze demo shell..."
  if ACTIVITY_COMPONENT="$(wait_for_launcher_activity)"; then
    "$ADB" shell am start --user "$ANDROID_USER" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n "$ACTIVITY_COMPONENT"
  else
    echo "Falling back to Android launcher resolution through monkey..."
    "$ADB" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1
  fi
fi

echo "Ready. Emulator log: /tmp/lumo-demo-emulator.log"
