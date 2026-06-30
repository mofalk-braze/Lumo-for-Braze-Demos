#!/usr/bin/env bash
set -euo pipefail

ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
WORK_DIR="${TMPDIR:-/tmp}/lumo-android-ca"
PEM="$WORK_DIR/zscaler-root-ca.pem"
HASHED="$WORK_DIR/zscaler-root-ca.hashed"

mkdir -p "$WORK_DIR"

fail() {
  echo "Error: $*" >&2
  exit 1
}

wait_for_boot() {
  "$ADB" wait-for-device
  until [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    sleep 2
  done
}

adb_shell_trim() {
  "$ADB" shell "$@" 2>/dev/null | tr -d '\r'
}

require_adb_root() {
  local context="$1"
  echo "Checking adb root access for $context..."
  local root_log
  root_log="$("$ADB" root 2>&1 || true)"
  [[ -n "$root_log" ]] && echo "$root_log"
  sleep 2
  "$ADB" wait-for-device
  if [[ "$(adb_shell_trim id -u)" != "0" ]]; then
    local build_fingerprint build_tags image_variant
    build_fingerprint="$(adb_shell_trim getprop ro.build.fingerprint || true)"
    build_tags="$(adb_shell_trim getprop ro.build.tags || true)"
    image_variant="$(adb_shell_trim getprop ro.product.system.name || true)"
    cat >&2 <<EOF
adb root is required for $context, but this emulator is not rootable.

Current image:
  system name: ${image_variant:-unknown}
  build tags: ${build_tags:-unknown}
  fingerprint: ${build_fingerprint:-unknown}

Use a rootable Google APIs AVD. Google Play/production images cannot install a
system CA and must not be used for Zscaler-backed push/IAM validation.
EOF
    exit 1
  fi
}

require_system_ca_writeable() {
  if ! "$ADB" shell 'touch /system/etc/security/cacerts/.lumo-ca-write-test && rm /system/etc/security/cacerts/.lumo-ca-write-test' >/dev/null 2>&1; then
    fail "/system/etc/security/cacerts is not writable after adb remount"
  fi
}

verify_remote_cert() {
  local remote="$1"
  local label="$2"
  if ! "$ADB" shell "test -f '$remote'" >/dev/null 2>&1; then
    fail "$label verification failed; missing $remote"
  fi
  echo "Verified $label: $remote"
}

find_d8() {
  if [[ -n "${D8:-}" && -x "$D8" ]]; then
    printf '%s' "$D8"
    return 0
  fi
  local candidate
  candidate="$(ls -1 "$ANDROID_HOME"/build-tools/*/d8 2>/dev/null | sort | tail -n 1 || true)"
  [[ -n "$candidate" && -x "$candidate" ]] || return 1
  printf '%s' "$candidate"
}

run_java_https_smoke_checks() {
  command -v javac >/dev/null 2>&1 || return 127
  local d8_bin
  d8_bin="$(find_d8)" || return 127

  local probe_dir="$WORK_DIR/https-smoke"
  local remote_dex="/data/local/tmp/braze-demo-trust-smoke.dex"
  rm -rf "$probe_dir"
  mkdir -p "$probe_dir/classes" "$probe_dir/dex"

  cat >"$probe_dir/TrustSmoke.java" <<'EOF'
import java.io.InputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;

public class TrustSmoke {
  public static void main(String[] args) throws Exception {
    boolean ok = true;
    for (String raw : args) {
      HttpsURLConnection connection = null;
      try {
        connection = (HttpsURLConnection) new URL(raw).openConnection();
        connection.setRequestMethod("GET");
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(5000);
        int code = connection.getResponseCode();
        InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (stream != null) stream.close();
        System.out.println("OK " + raw + " " + code);
      } catch (Throwable t) {
        ok = false;
        System.out.println("FAIL " + raw + " " + t.getClass().getName() + ": " + t.getMessage());
      } finally {
        if (connection != null) connection.disconnect();
      }
    }
    if (!ok) System.exit(2);
  }
}
EOF

  javac -encoding UTF-8 -source 8 -target 8 -d "$probe_dir/classes" "$probe_dir/TrustSmoke.java" >/dev/null
  "$d8_bin" --output "$probe_dir/dex" "$probe_dir/classes" >/dev/null
  "$ADB" push "$probe_dir/dex/classes.dex" "$remote_dex" >/dev/null
  "$ADB" shell "CLASSPATH='$remote_dex' app_process /system/bin TrustSmoke https://braze-images.com/ https://firebaseinstallations.googleapis.com/"
  "$ADB" shell "rm -f '$remote_dex'" >/dev/null 2>&1 || true
}

run_shell_https_smoke_checks() {
  if "$ADB" shell 'command -v curl >/dev/null 2>&1' >/dev/null 2>&1; then
    "$ADB" shell 'curl -sS -o /dev/null -m 8 https://braze-images.com/ && curl -sS -o /dev/null -m 8 https://firebaseinstallations.googleapis.com/'
    return $?
  fi
  if "$ADB" shell 'command -v wget >/dev/null 2>&1' >/dev/null 2>&1; then
    "$ADB" shell 'wget -q -T 8 -O /dev/null https://braze-images.com/ && wget -q -T 8 -O /dev/null https://firebaseinstallations.googleapis.com/'
    return $?
  fi
  if "$ADB" shell 'toybox wget --help >/dev/null 2>&1' >/dev/null 2>&1; then
    "$ADB" shell 'toybox wget -q -T 8 -O /dev/null https://braze-images.com/ && toybox wget -q -T 8 -O /dev/null https://firebaseinstallations.googleapis.com/'
    return $?
  fi
  return 127
}

run_https_smoke_checks() {
  echo "Running emulator HTTPS trust smoke checks..."
  if run_java_https_smoke_checks; then
    echo "Verified emulator HTTPS trust through app_process."
    return 0
  fi
  local java_status=$?
  if [[ "$java_status" == "127" ]]; then
    if run_shell_https_smoke_checks; then
      echo "Verified emulator HTTPS trust through shell HTTPS client."
      return 0
    fi
    local shell_status=$?
    if [[ "$shell_status" == "127" ]]; then
      fail "No emulator HTTPS smoke-check mechanism is available. Install a JDK and Android build-tools so app_process trust proof can run."
    fi
  fi
  fail "Emulator HTTPS trust smoke check failed"
}

if [[ ! -x "$ADB" ]]; then
  fail "adb not found at $ADB. Set ADB=/path/to/adb."
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
  fail "Could not find Zscaler Root CA in macOS System keychains."
fi

cp "$FOUND" "$PEM"

HASH="$(openssl x509 -inform PEM -subject_hash_old -in "$PEM" -noout)"
cp "$PEM" "$HASHED"

echo "Using cert hash: $HASH"
openssl x509 -in "$PEM" -noout -subject -issuer -fingerprint -sha256

require_adb_root "system CA installation"

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
  wait_for_boot
  require_adb_root "system CA remount after disable-verity"
  if ! "$ADB" remount >"$REMOUNT_LOG" 2>&1; then
    cat "$REMOUNT_LOG" >&2
    fail "adb remount failed after disable-verity"
  fi
fi
require_system_ca_writeable

REMOTE="/system/etc/security/cacerts/$HASH.0"
echo "Installing to $REMOTE..."
"$ADB" push "$HASHED" "$REMOTE"
"$ADB" shell chmod 644 "$REMOTE"
"$ADB" shell chown root:root "$REMOTE" || true
"$ADB" shell 'command -v chcon >/dev/null && chcon u:object_r:system_file:s0 '"$REMOTE"' || true'
verify_remote_cert "$REMOTE" "system CA install"

echo "Rebooting emulator so Google Play services reloads system CAs..."
"$ADB" reboot
wait_for_boot
verify_remote_cert "$REMOTE" "system CA after reboot"

APEX_CERT_DIR="/apex/com.android.conscrypt/cacerts"
if "$ADB" shell "[ -d '$APEX_CERT_DIR' ]" >/dev/null 2>&1; then
  APEX_TMP="/data/local/tmp/lumo-conscrypt-cacerts"

  echo "Installing runtime Conscrypt APEX CA bind mount..."
  require_adb_root "Conscrypt APEX CA bind mount"
  "$ADB" shell "rm -rf '$APEX_TMP' && mkdir -p '$APEX_TMP' && cp '$APEX_CERT_DIR'/* '$APEX_TMP'/"
  "$ADB" push "$HASHED" "$APEX_TMP/$HASH.0"
  "$ADB" shell "chmod 755 '$APEX_TMP' && chmod 644 '$APEX_TMP'/* && chown root:root '$APEX_TMP'/* || true"
  "$ADB" shell "command -v chcon >/dev/null && chcon u:object_r:system_file:s0 '$APEX_TMP' '$APEX_TMP'/* || true"
  "$ADB" shell "mount --bind '$APEX_TMP' '$APEX_CERT_DIR'"
  verify_remote_cert "$APEX_CERT_DIR/$HASH.0" "Conscrypt APEX CA bind mount"
  if ! "$ADB" shell "grep -F ' $APEX_CERT_DIR ' /proc/mounts" >/dev/null 2>&1; then
    fail "Conscrypt APEX bind mount was not visible in /proc/mounts"
  fi

  echo "Restarting Android framework so Google Play services reloads Conscrypt CAs..."
  "$ADB" shell stop
  sleep 3
  "$ADB" shell start
  wait_for_boot
  verify_remote_cert "$APEX_CERT_DIR/$HASH.0" "Conscrypt APEX CA after framework restart"
else
  fail "Conscrypt APEX CA directory not found at $APEX_CERT_DIR"
fi

run_https_smoke_checks

echo "Done. Reinstall/relaunch the demo app and retry FCM token generation."
