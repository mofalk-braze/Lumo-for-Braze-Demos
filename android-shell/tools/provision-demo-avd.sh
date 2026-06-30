#!/usr/bin/env bash
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
AVD_NAME="${AVD_NAME:-${BRAZE_DEMO_ANDROID_AVD:-Braze_Demo_API_36}}"
API_LEVEL="${API_LEVEL:-36.1}"
ABI="${ABI:-}"
DEVICE="${DEVICE:-pixel_10_pro}"
RECREATE_AVD="${RECREATE_AVD:-0}"

if [[ -z "$ABI" ]]; then
  case "$(uname -m)" in
    arm64|aarch64) ABI="arm64-v8a" ;;
    *) ABI="x86_64" ;;
  esac
fi

EMULATOR="${EMULATOR:-$ANDROID_HOME/emulator/emulator}"
SYSTEM_IMAGE="system-images;android-$API_LEVEL;google_apis;$ABI"

fail() {
  echo "Error: $*" >&2
  exit 1
}

find_android_tool() {
  local env_name="$1"
  local tool_name="$2"
  local explicit="${!env_name:-}"
  if [[ -n "$explicit" ]]; then
    [[ -x "$explicit" ]] || fail "$tool_name was set through $env_name but is not executable: $explicit"
    printf '%s' "$explicit"
    return 0
  fi

  local candidate
  for candidate in \
    "$ANDROID_HOME/cmdline-tools/latest/bin/$tool_name" \
    "$ANDROID_HOME/cmdline-tools"/*/bin/"$tool_name" \
    "/Applications/Android Studio.app/Contents/plugins/android/resources/commandlinetools/bin/$tool_name"
  do
    if [[ -x "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done

  return 1
}

SDKMANAGER="$(find_android_tool SDKMANAGER sdkmanager || true)"
AVDMANAGER="$(find_android_tool AVDMANAGER avdmanager || true)"

if [[ -z "$SDKMANAGER" || -z "$AVDMANAGER" ]]; then
  cat >&2 <<EOF
Android SDK command-line tools are not installed in this SDK.

Install them once from Android Studio:
  Settings > Languages & Frameworks > Android SDK > SDK Tools > Android SDK Command-line Tools

Or install from an existing sdkmanager and rerun:
  sdkmanager --install "cmdline-tools;latest"

You can also point this script directly at tools:
  SDKMANAGER=/path/to/sdkmanager AVDMANAGER=/path/to/avdmanager android-shell/tools/provision-demo-avd.sh
EOF
  exit 1
fi

if [[ ! -x "$EMULATOR" ]]; then
  fail "emulator not found at $EMULATOR. Install the Android emulator package or set EMULATOR."
fi

case "$SYSTEM_IMAGE" in
  *google_apis_playstore*|*playstore*) fail "Refusing Google Play image. Use a rootable google_apis image." ;;
esac

echo "Installing Android emulator prerequisites for $SYSTEM_IMAGE..."
"$SDKMANAGER" \
  "platform-tools" \
  "emulator" \
  "platforms;android-$API_LEVEL" \
  "$SYSTEM_IMAGE"

if "$EMULATOR" -list-avds | grep -Fxq "$AVD_NAME"; then
  AVD_DIR="$HOME/.android/avd/$AVD_NAME.avd"
  CONFIG="$AVD_DIR/config.ini"
  EXISTING_DEVICE="$(grep -E '^hw.device.name=' "$CONFIG" 2>/dev/null | cut -d= -f2- || true)"
  EXISTING_IMAGE="$(grep -E '^image.sysdir.1=' "$CONFIG" 2>/dev/null | cut -d= -f2- || true)"
  if [[ "$RECREATE_AVD" == "1" ]]; then
    echo "RECREATE_AVD=1: deleting existing AVD $AVD_NAME before recreating it."
    "$AVDMANAGER" delete avd --name "$AVD_NAME" >/dev/null
    echo "Creating rootable Google APIs AVD: $AVD_NAME"
    echo "no" | "$AVDMANAGER" create avd --force --name "$AVD_NAME" --package "$SYSTEM_IMAGE" --device "$DEVICE"
  elif [[ "$EXISTING_DEVICE" != "$DEVICE" || "$EXISTING_IMAGE" != *"android-$API_LEVEL/google_apis/$ABI"* ]]; then
    cat >&2 <<EOF
AVD already exists but does not match the dedicated demo profile.

  AVD: $AVD_NAME
  current device: ${EXISTING_DEVICE:-unknown}
  expected device: $DEVICE
  current image: ${EXISTING_IMAGE:-unknown}
  expected image fragment: android-$API_LEVEL/google_apis/$ABI

Recreate it explicitly:
  RECREATE_AVD=1 android-shell/tools/provision-demo-avd.sh

This deletes only the '$AVD_NAME' emulator profile. App data inside that AVD is
lost, so use it as a one-time setup correction rather than a normal launch step.
EOF
    exit 1
  else
    echo "AVD already exists and matches the dedicated demo profile: $AVD_NAME"
  fi
else
  echo "Creating rootable Google APIs AVD: $AVD_NAME"
  if "$AVDMANAGER" list device | grep -q "id: .*$DEVICE"; then
    echo "no" | "$AVDMANAGER" create avd --force --name "$AVD_NAME" --package "$SYSTEM_IMAGE" --device "$DEVICE"
  else
    echo "Device profile '$DEVICE' not found; creating AVD with default hardware profile."
    echo "no" | "$AVDMANAGER" create avd --force --name "$AVD_NAME" --package "$SYSTEM_IMAGE"
  fi
fi

AVD_DIR="$HOME/.android/avd/$AVD_NAME.avd"
CONFIG="$AVD_DIR/config.ini"
if [[ -f "$CONFIG" ]]; then
  upsert_config() {
    local key="$1"
    local value="$2"
    if grep -q "^$key=" "$CONFIG"; then
      sed -i.bak "s|^$key=.*|$key=$value|" "$CONFIG"
    else
      printf '%s=%s\n' "$key" "$value" >>"$CONFIG"
    fi
  }
  upsert_config "disk.dataPartition.size" "8G"
  upsert_config "hw.keyboard" "yes"
  upsert_config "hw.gpu.enabled" "yes"
  upsert_config "hw.gpu.mode" "auto"
  upsert_config "PlayStore.enabled" "false"
  rm -f "$CONFIG.bak"
fi

cat <<EOF
Ready: $AVD_NAME

Launch through the wrapper so Zscaler trust is re-applied every boot:
  AVD=$AVD_NAME android-shell/tools/run-demo-emulator.sh

Normal launches preserve app data and the Braze SDK device ID. Use RESET_APP_DATA=1
only as an explicit recovery action.
EOF
