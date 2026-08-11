#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="${ADB:-$ANDROID_HOME/platform-tools/adb}"
EMULATOR="${EMULATOR:-$ANDROID_HOME/emulator/emulator}"
DEFAULT_AVD="${BRAZE_DEMO_ANDROID_AVD:-Braze_Demo_API_36}"
AVD="${AVD:-$DEFAULT_AVD}"
APP_ID="${APP_ID:-com.braze.demoshell}"
ANDROID_USER="${ANDROID_USER:-0}"
INSTALL_APP="${INSTALL_APP:-0}"
APK_PATH="${APK_PATH:-}"
LAUNCH_APP="${LAUNCH_APP:-1}"
RESET_APP_DATA="${RESET_APP_DATA:-0}"
TRUST_MODE="${TRUST_MODE:-auto}"
TRUST_INSTALLER="${TRUST_INSTALLER:-$SCRIPT_DIR/install-zscaler-system-ca.sh}"
TIME_SYNC_GUARD="${TIME_SYNC_GUARD:-1}"
TIME_SYNC_GUARD_SCRIPT="${TIME_SYNC_GUARD_SCRIPT:-$SCRIPT_DIR/ensure-time-sync-guard.sh}"
NODE_BINARY="${NODE_BINARY:-node}"
DETACHED_EMULATOR_STARTER="${DETACHED_EMULATOR_STARTER:-$SCRIPT_DIR/start-demo-emulator.mjs}"
BOOT_TIMEOUT_SECONDS="${BRAZE_DEMO_ANDROID_BOOT_TIMEOUT_SECONDS:-180}"
EMULATOR_LOG="${BRAZE_DEMO_EMULATOR_LOG:-/tmp/lumo-demo-emulator.log}"
EMULATOR_PID_FILE="${BRAZE_DEMO_EMULATOR_PID_FILE:-${TMPDIR:-/tmp}/lumo-demo-emulator.pid}"

DEVICE_SERIAL=""
LAUNCH_MODE="warm"
TRUST_FRAMEWORK_RESTARTED="0"
DEVICE_SERIALS=()
DEVICE_STATES=()

fail() {
  echo "Error: $*" >&2
  exit 1
}

adb_device() {
  "$ADB" -s "$DEVICE_SERIAL" "$@"
}

read_connected_devices() {
  DEVICE_SERIALS=()
  DEVICE_STATES=()
  local serial state rest
  while read -r serial state rest; do
    [[ -z "${serial:-}" || "$serial" == "List" ]] && continue
    DEVICE_SERIALS+=("$serial")
    DEVICE_STATES+=("${state:-unknown}")
  done < <("$ADB" devices)
}

avd_name_for_serial() {
  local serial="$1"
  local name=""
  if [[ "$serial" == emulator-* ]]; then
    name="$("$ADB" -s "$serial" emu avd name 2>/dev/null | tr -d '\r' | sed -n '1p' || true)"
    if [[ -z "$name" ]]; then
      name="$("$ADB" -s "$serial" shell getprop ro.boot.qemu.avd_name 2>/dev/null | tr -d '\r' || true)"
    fi
  fi
  printf '%s' "$name"
}

select_existing_device() {
  read_connected_devices
  if [[ "${#DEVICE_SERIALS[@]}" -eq 0 ]]; then
    return 1
  fi
  if [[ "${#DEVICE_SERIALS[@]}" -ne 1 ]]; then
    fail "Expected exactly one Android device for '$AVD', but found ${#DEVICE_SERIALS[@]}: ${DEVICE_SERIALS[*]}. Disconnect extra devices and retry."
  fi
  if [[ "${DEVICE_STATES[0]}" != "device" ]]; then
    fail "Android device ${DEVICE_SERIALS[0]} is ${DEVICE_STATES[0]}, not ready. Resolve the device state before launching."
  fi

  local running_avd
  running_avd="$(avd_name_for_serial "${DEVICE_SERIALS[0]}")"
  if [[ -z "$running_avd" ]]; then
    fail "Connected target ${DEVICE_SERIALS[0]} is not an emulator. The demo launcher only operates the dedicated '$AVD' AVD."
  fi
  if [[ "$running_avd" != "$AVD" ]]; then
    fail "Connected emulator ${DEVICE_SERIALS[0]} runs AVD '$running_avd', but '$AVD' is required. Stop the wrong AVD explicitly and retry."
  fi
  DEVICE_SERIAL="${DEVICE_SERIALS[0]}"
  export ANDROID_SERIAL="$DEVICE_SERIAL"
  return 0
}

wait_for_expected_device() {
  local deadline=$((SECONDS + BOOT_TIMEOUT_SECONDS))
  while (( SECONDS < deadline )); do
    read_connected_devices
    if [[ "${#DEVICE_SERIALS[@]}" -gt 1 ]]; then
      fail "More than one Android device appeared while '$AVD' was booting: ${DEVICE_SERIALS[*]}."
    fi
    if [[ "${#DEVICE_SERIALS[@]}" -eq 1 && "${DEVICE_STATES[0]}" == "device" ]]; then
      local running_avd
      running_avd="$(avd_name_for_serial "${DEVICE_SERIALS[0]}")"
      if [[ "$running_avd" != "$AVD" ]]; then
        fail "Emulator ${DEVICE_SERIALS[0]} booted AVD '${running_avd:-unknown}', expected '$AVD'."
      fi
      DEVICE_SERIAL="${DEVICE_SERIALS[0]}"
      export ANDROID_SERIAL="$DEVICE_SERIAL"
      return 0
    fi
    sleep 2
  done
  fail "Timed out after ${BOOT_TIMEOUT_SECONDS}s waiting for '$AVD'. See $EMULATOR_LOG."
}

start_expected_avd() {
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

  LAUNCH_MODE="cold"
  if pgrep -f "[e]mulator.*-avd[[:space:]]+$AVD([[:space:]]|$)" >/dev/null 2>&1; then
    echo "A process for $AVD is already starting; waiting for its adb transport..."
  else
    echo "Starting $AVD once with a writable system partition..."
    local emulator_pid
    emulator_pid="$("$NODE_BINARY" "$DETACHED_EMULATOR_STARTER" \
      --log "$EMULATOR_LOG" \
      --pid-file "$EMULATOR_PID_FILE" \
      -- \
      "$EMULATOR" \
      -avd "$AVD" \
      -writable-system \
      -no-snapshot-load)"
    [[ "$emulator_pid" =~ ^[0-9]+$ ]] || fail "Detached emulator starter returned an invalid PID: ${emulator_pid:-empty}."
  fi
  wait_for_expected_device
}

credential_type() {
  adb_device shell dumpsys lock_settings 2>/dev/null \
    | awk -F': ' '/CredentialType:/ { print $2; exit }' \
    | tr -d '\r' \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

print_secure_lock_remediation() {
  local type="${1:-unknown}"
  cat >&2 <<EOF

The dedicated demo AVD has a secure screen credential ($type).
The launcher will never store, guess, or type that credential.

One-time remediation on the emulator:
  Settings > Security & privacy > Device unlock > Screen lock
  authenticate, then select Swipe (not None).

Swipe keeps Android keyguard and lock-screen notifications active while allowing
future launches to become ready without presenter input.
EOF
}

enforce_lock_screen_notification_settings() {
  local key expected actual
  while read -r key expected; do
    adb_device shell settings put secure "$key" "$expected" >/dev/null
    actual="$(adb_device shell settings get secure "$key" 2>/dev/null | tr -d '\r' || true)"
    if [[ "$actual" != "$expected" ]]; then
      fail "Android secure setting $key remained '${actual:-unset}', expected '$expected' for lock-screen notification demos."
    fi
  done <<'EOF'
lock_screen_show_notifications 1
lock_screen_allow_private_notifications 1
lock_screen_show_silent_notifications 1
lock_screen_notification_minimalism 0
EOF
}

enforce_tap_to_wake_settings() {
  local key actual current
  # API-36 exposes the secure double-tap key, while its doze compatibility
  # keys may begin unset. Store all three known secure switches and verify
  # their deterministic state; physical gesture effectiveness remains a smoke test.
  for key in double_tap_to_wake doze_pulse_on_double_tap doze_tap_gesture; do
    current="$(adb_device shell settings get secure "$key" 2>/dev/null | tr -d '\r' || true)"
    adb_device shell settings put secure "$key" 1 >/dev/null
    actual="$(adb_device shell settings get secure "$key" 2>/dev/null | tr -d '\r' || true)"
    if [[ "$actual" != "1" ]]; then
      fail "Android tap-to-wake setting secure/$key remained '${actual:-unset}', expected '1'."
    fi
  done

  current="$(adb_device shell settings get system double_tap_to_wake 2>/dev/null | tr -d '\r' || true)"
  if [[ -z "$current" || "$current" == "null" ]]; then
    echo "Android system/double_tap_to_wake compatibility key is unset; secure gesture settings are authoritative."
  else
    adb_device shell settings put system double_tap_to_wake 1 >/dev/null
    actual="$(adb_device shell settings get system double_tap_to_wake 2>/dev/null | tr -d '\r' || true)"
    if [[ "$actual" != "1" ]]; then
      fail "Android tap-to-wake setting system/double_tap_to_wake remained '${actual:-unset}', expected '1'."
    fi
  fi
}

wait_for_boot_and_unlock() {
  adb_device wait-for-device
  local deadline=$((SECONDS + BOOT_TIMEOUT_SECONDS))
  until [[ "$(adb_device shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    (( SECONDS < deadline )) || fail "Android boot did not complete within ${BOOT_TIMEOUT_SECONDS}s."
    sleep 2
  done

  local type
  type="$(credential_type)"
  if [[ -z "$type" ]]; then
    fail "Could not determine the Android screen credential type. Refusing unattended launch until the AVD is verified as non-secure Swipe."
  fi
  if [[ "$(printf '%s' "$type" | tr '[:lower:]' '[:upper:]')" != "NONE" ]]; then
    print_secure_lock_remediation "$type"
    exit 1
  fi

  # CredentialType NONE covers both Swipe and no lock screen. Keep keyguard
  # enabled so lock-screen notifications remain part of the demo contract.
  local lockscreen_disabled
  lockscreen_disabled="$(adb_device shell locksettings get-disabled --user "$ANDROID_USER" 2>/dev/null | tr -d '\r' || true)"
  case "$lockscreen_disabled" in
    true)
      adb_device shell locksettings set-disabled --user "$ANDROID_USER" false >/dev/null
      lockscreen_disabled="$(adb_device shell locksettings get-disabled --user "$ANDROID_USER" 2>/dev/null | tr -d '\r' || true)"
      ;;
    false) ;;
    *) fail "Could not verify that Android keyguard is enabled for Swipe notifications." ;;
  esac
  if [[ "$lockscreen_disabled" != "false" ]]; then
    fail "Android keyguard remained disabled. Select Swipe (not None) in Settings and retry."
  fi
  enforce_lock_screen_notification_settings
  enforce_tap_to_wake_settings

  adb_device shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  adb_device shell wm dismiss-keyguard >/dev/null 2>&1 || true
  adb_device shell input swipe 640 2400 640 400 350 >/dev/null 2>&1 || true

  for _ in $(seq 1 30); do
    local user_state=""
    user_state="$(adb_device shell dumpsys user 2>/dev/null | awk '
      /UserInfo\{0:/ { in_user = 1 }
      in_user && /State:/ { print $2; exit }
    ' | tr -d '\r' || true)"
    if [[ "$user_state" == "RUNNING_UNLOCKED" ]]; then
      return 0
    fi
    sleep 1
  done
  fail "Android user $ANDROID_USER did not reach RUNNING_UNLOCKED. Unlock the AVD once and retry."
}

wait_for_launcher_activity() {
  local component=""
  for _ in $(seq 1 30); do
    component="$(adb_device shell cmd package resolve-activity --brief \
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
  adb_device shell pm list packages | grep -F "$APP_ID" >&2 || true
  return 1
}

quiesce_previous_app() {
  echo "Quiescing $APP_ID before Android boot, trust, or install work..."
  if ! adb_device shell am force-stop --user "$ANDROID_USER" "$APP_ID" >/dev/null; then
    fail "Could not force-stop $APP_ID before Android preparation. Refusing to leave a stale app visible."
  fi
}

print_trust_remediation() {
  cat >&2 <<'EOF'

Android emulator system trust could not be prepared.

This corporate-network demo path requires the dedicated rootable Google APIs AVD.
Normal launches only probe and restore known trust state; they do not reboot or
disable verity. Use TRUST_MODE=repair for an explicit first-time trust repair,
then rerun the normal launcher. Do not reset app data.
EOF
}

prepare_trust() {
  TRUST_FRAMEWORK_RESTARTED="0"
  if [[ "$TRUST_MODE" == "skip" ]]; then
    echo "TRUST_MODE=skip: leaving emulator trust unchanged."
    return 0
  fi
  if ! security find-certificate -a -c "Zscaler Root CA" /Library/Keychains/System.keychain >/dev/null 2>&1; then
    echo "No Zscaler Root CA found in macOS System keychain; skipping CA install."
    return 0
  fi

  echo "Checking Zscaler system and Conscrypt trust..."
  if [[ "$TRUST_MODE" == "repair" ]]; then
    if ! TRUST_REPAIR=1 "$TRUST_INSTALLER"; then
      print_trust_remediation
      exit 1
    fi
    TRUST_FRAMEWORK_RESTARTED="1"
    return 0
  fi

  local probe_output=""
  local probe_status=0
  probe_output="$("$TRUST_INSTALLER" --probe-only 2>&1)" || probe_status=$?
  [[ -n "$probe_output" ]] && printf '%s\n' "$probe_output"
  if [[ "$probe_status" == "0" ]]; then
    return 0
  fi

  if [[ "$probe_output" == *"Android trust is not ready (system=1 conscrypt=0)."* ]]; then
    echo "Persistent system CA is healthy; restoring only the volatile Conscrypt trust mount..."
    if ! "$TRUST_INSTALLER"; then
      print_trust_remediation
      exit 1
    fi
    TRUST_FRAMEWORK_RESTARTED="1"
    return 0
  fi

  # Missing or broken persistent system trust is a repair operation. Never let
  # the normal launcher remount /system, disable verity, or install a system CA.
  print_trust_remediation
  exit 1
}

install_prebuilt_apk() {
  [[ "$INSTALL_APP" == "1" ]] || return 0
  [[ -n "$APK_PATH" ]] || fail "INSTALL_APP=1 requires an explicit absolute APK_PATH. The emulator wrapper no longer invokes Gradle."
  [[ "$APK_PATH" == /* ]] || fail "APK_PATH must be absolute: $APK_PATH"
  [[ -f "$APK_PATH" ]] || fail "APK_PATH does not exist: $APK_PATH"

  if [[ "$RESET_APP_DATA" == "1" ]]; then
    echo "RESET_APP_DATA=1: explicitly removing the previous app and SDK identity..." >&2
    if adb_device shell pm path "$APP_ID" >/dev/null 2>&1; then
      adb_device uninstall "$APP_ID" >/dev/null
    fi
    echo "Installing prebuilt APK after the explicit identity reset..."
  else
    echo "Installing prebuilt APK once with adb install -r while preserving app data..."
  fi
  adb_device install -r "$APK_PATH"
}

ensure_app_is_installed() {
  if ! adb_device shell pm path "$APP_ID" >/dev/null 2>&1; then
    fail "$APP_ID is not installed. Re-run with INSTALL_APP=1 and APK_PATH=/absolute/path/to/app-debug.apk."
  fi
}

check_network_clock() {
  [[ "$TIME_SYNC_GUARD" == "1" ]] || return 0
  echo "Checking Android network clock before launcher-owned continuous coverage..."
  if ! ANDROID_SERIAL="$DEVICE_SERIAL" ADB="$ADB" \
    "$TIME_SYNC_GUARD_SCRIPT" --once "$DEVICE_SERIAL"; then
    echo "Warning: initial Android network clock refresh was unavailable." >&2
  fi
}

validate_boolean_flag() {
  local name="$1"
  local value="$2"
  [[ "$value" == "0" || "$value" == "1" ]] || fail "$name must be 0 or 1 (got '$value')."
}

validate_boolean_flag "INSTALL_APP" "$INSTALL_APP"
validate_boolean_flag "LAUNCH_APP" "$LAUNCH_APP"
validate_boolean_flag "RESET_APP_DATA" "$RESET_APP_DATA"
validate_boolean_flag "TIME_SYNC_GUARD" "$TIME_SYNC_GUARD"
if [[ "$RESET_APP_DATA" == "1" && "$INSTALL_APP" != "1" ]]; then
  fail "RESET_APP_DATA=1 requires INSTALL_APP=1 and an explicit APK_PATH; refusing to ignore a destructive reset request."
fi

if [[ ! -x "$ADB" ]]; then
  fail "adb not found at $ADB. Set ANDROID_HOME or ADB."
fi
if [[ ! -x "$EMULATOR" ]]; then
  fail "emulator not found at $EMULATOR. Set ANDROID_HOME or EMULATOR."
fi
case "$TRUST_MODE" in
  auto|skip|repair) ;;
  *) fail "TRUST_MODE must be auto, skip, or repair (got '$TRUST_MODE')." ;;
esac

"$ADB" start-server >/dev/null
if select_existing_device; then
  echo "Warm launch: reusing $DEVICE_SERIAL ($AVD); no emulator stop or reboot."
else
  start_expected_avd
fi

quiesce_previous_app
wait_for_boot_and_unlock
prepare_trust
if [[ "$TRUST_FRAMEWORK_RESTARTED" == "1" ]]; then
  # Explicit repair and volatile Conscrypt restoration both stop/start Android's
  # framework. Re-prove boot, Swipe/keyguard, and user-unlocked state only when
  # the installer actually ran; a healthy auto probe remains a single pass.
  echo "Trust preparation restarted Android's framework; revalidating boot and Swipe unlock state..."
  wait_for_boot_and_unlock
fi
install_prebuilt_apk
ensure_app_is_installed
check_network_clock

if [[ "$LAUNCH_APP" == "1" ]]; then
  echo "Launching the installed demo shell without clearing data..."
  if ACTIVITY_COMPONENT="$(wait_for_launcher_activity)"; then
    adb_device shell am start --user "$ANDROID_USER" \
      -a android.intent.action.MAIN \
      -c android.intent.category.LAUNCHER \
      -n "$ACTIVITY_COMPONENT"
  else
    fail "Could not launch $APP_ID after install verification."
  fi
else
  echo "LAUNCH_APP=0: leaving the target app force-stopped."
fi

echo "Ready. launchMode=$LAUNCH_MODE serial=$DEVICE_SERIAL avd=$AVD installed=$INSTALL_APP launched=$LAUNCH_APP"
echo "Emulator log: $EMULATOR_LOG"
echo "Continuous Android clock coverage is launcher-owned and is not detached by this wrapper."
