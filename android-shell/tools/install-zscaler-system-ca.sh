#!/usr/bin/env bash
set -euo pipefail

ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
WORK_DIR="${TMPDIR:-/tmp}/lumo-android-ca"
PEM="$WORK_DIR/zscaler-root-ca.pem"
HASHED="$WORK_DIR/zscaler-root-ca.hashed"

mkdir -p "$WORK_DIR"

wait_for_boot() {
  "$ADB" wait-for-device
  until [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    sleep 2
  done
}

if [[ ! -x "$ADB" ]]; then
  echo "adb not found at $ADB. Set ADB=/path/to/adb." >&2
  exit 1
fi

echo "Extracting Zscaler Root CA from macOS System keychain..."
rm -f "$WORK_DIR"/host-cert-*.pem
security find-certificate -a -p \
  /Library/Keychains/System.keychain \
  /System/Library/Keychains/SystemRootCertificates.keychain \
  | awk '
      /BEGIN CERTIFICATE/ { n++; file=sprintf("'"$WORK_DIR"'/host-cert-%03d.pem", n) }
      file { print > file }
      /END CERTIFICATE/ { file="" }
    '

FOUND=""
for candidate in "$WORK_DIR"/host-cert-*.pem; do
  subject="$(openssl x509 -in "$candidate" -noout -subject 2>/dev/null || true)"
  if [[ "$subject" == *"Zscaler Root CA"* ]]; then
    FOUND="$candidate"
    break
  fi
done

if [[ -z "$FOUND" ]]; then
  echo "Could not find Zscaler Root CA in macOS System keychains." >&2
  exit 1
fi

cp "$FOUND" "$PEM"

HASH="$(openssl x509 -inform PEM -subject_hash_old -in "$PEM" -noout)"
cp "$PEM" "$HASHED"

echo "Using cert hash: $HASH"
openssl x509 -in "$PEM" -noout -subject -issuer -fingerprint -sha256

echo "Checking root access. This will fail on Google Play production images."
"$ADB" root || true
sleep 2
if [[ "$("$ADB" shell id -u 2>/dev/null | tr -d '\r')" != "0" ]]; then
  echo "adb root failed. Boot a Google APIs emulator image, not a Google Play image." >&2
  exit 1
fi

REMOUNT_LOG="$WORK_DIR/adb-remount.log"
if ! "$ADB" remount >"$REMOUNT_LOG" 2>&1; then
  cat "$REMOUNT_LOG" >&2
  FLASH_LOCKED="$("$ADB" shell getprop ro.boot.flash.locked 2>/dev/null | tr -d '\r' || true)"
  if [[ "$FLASH_LOCKED" == "1" ]] || grep -qi "bootloader unlocked" "$REMOUNT_LOG"; then
    cat >&2 <<'EOF'
adb root works, but adb remount failed because the emulator bootloader is locked.

Unlock this AVD once, then rerun this script:
  adb reboot bootloader
  fastboot flashing unlock
  fastboot reboot

Unlocking an emulator bootloader may wipe that AVD's local data.
EOF
    exit 1
  fi

  echo "adb remount failed; trying disable-verity then reboot/remount..."
  "$ADB" disable-verity || true
  "$ADB" reboot
  "$ADB" wait-for-device
  until [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    sleep 2
  done
  "$ADB" root
  sleep 2
  "$ADB" remount
fi

REMOTE="/system/etc/security/cacerts/$HASH.0"
echo "Installing to $REMOTE..."
"$ADB" push "$HASHED" "$REMOTE"
"$ADB" shell chmod 644 "$REMOTE"
"$ADB" shell chown root:root "$REMOTE" || true
"$ADB" shell 'command -v chcon >/dev/null && chcon u:object_r:system_file:s0 '"$REMOTE"' || true'

echo "Rebooting emulator so Google Play services reloads system CAs..."
"$ADB" reboot
wait_for_boot

if "$ADB" shell '[ -d /apex/com.android.conscrypt/cacerts ]'; then
  APEX_TMP="/data/local/tmp/lumo-conscrypt-cacerts"

  echo "Installing runtime Conscrypt APEX CA bind mount..."
  "$ADB" root || true
  sleep 2
  "$ADB" shell "rm -rf '$APEX_TMP' && mkdir -p '$APEX_TMP' && cp /apex/com.android.conscrypt/cacerts/* '$APEX_TMP'/"
  "$ADB" push "$HASHED" "$APEX_TMP/$HASH.0"
  "$ADB" shell "chmod 755 '$APEX_TMP' && chmod 644 '$APEX_TMP'/* && chown root:root '$APEX_TMP'/* || true"
  "$ADB" shell "command -v chcon >/dev/null && chcon u:object_r:system_file:s0 '$APEX_TMP' '$APEX_TMP'/* || true"
  "$ADB" shell "mount --bind '$APEX_TMP' /apex/com.android.conscrypt/cacerts"
  "$ADB" shell "ls -l /apex/com.android.conscrypt/cacerts/$HASH.0"

  echo "Restarting Android framework so Google Play services reloads Conscrypt CAs..."
  "$ADB" shell stop
  sleep 3
  "$ADB" shell start
  wait_for_boot
fi

echo "Done. Reinstall/relaunch the demo app and retry FCM token generation."
