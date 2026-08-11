#!/usr/bin/env bash
set -euo pipefail

ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
WORK_DIR="${TMPDIR:-/tmp}/lumo-android-ca"
PEM="$WORK_DIR/zscaler-root-ca.pem"
HASHED="$WORK_DIR/zscaler-root-ca.hashed"
TRUST_SMOKE_INFRA_FAILURE=125
TRUST_SMOKE_LAST_OUTPUT=""
TRUST_REPAIR="${TRUST_REPAIR:-0}"
PROBE_ONLY=0

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

compile_java_https_smoke_probe() {
  command -v javac >/dev/null 2>&1 || return 127
  local d8_bin
  d8_bin="$(find_d8)" || return 127

  local probe_dir="$WORK_DIR/https-smoke"
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

  if ! javac -encoding UTF-8 -source 8 -target 8 -d "$probe_dir/classes" "$probe_dir/TrustSmoke.java" >/dev/null; then
    echo "Failed to compile the Android HTTPS trust probe with javac." >&2
    return "$TRUST_SMOKE_INFRA_FAILURE"
  fi

  local class_file="$probe_dir/classes/TrustSmoke.class"
  if [[ ! -f "$class_file" ]]; then
    echo "Android HTTPS trust probe compilation did not produce $class_file." >&2
    return "$TRUST_SMOKE_INFRA_FAILURE"
  fi
  if ! "$d8_bin" --output "$probe_dir/dex" "$class_file" >/dev/null; then
    echo "Failed to convert the Android HTTPS trust probe class to DEX." >&2
    return "$TRUST_SMOKE_INFRA_FAILURE"
  fi
}

run_java_https_smoke_checks() {
  compile_java_https_smoke_probe || return $?

  local probe_dir="$WORK_DIR/https-smoke"
  local remote_dex="/data/local/tmp/braze-demo-trust-smoke.dex"
  if ! "$ADB" push "$probe_dir/dex/classes.dex" "$remote_dex" >/dev/null; then
    echo "Failed to copy the Android HTTPS trust probe to the emulator." >&2
    return "$TRUST_SMOKE_INFRA_FAILURE"
  fi

  local app_process_status=0
  TRUST_SMOKE_LAST_OUTPUT="$(
    "$ADB" shell "CLASSPATH='$remote_dex' app_process /system/bin TrustSmoke https://braze-images.com/ https://firebaseinstallations.googleapis.com/" 2>&1
  )" || app_process_status=$?
  [[ -n "$TRUST_SMOKE_LAST_OUTPUT" ]] && printf '%s\n' "$TRUST_SMOKE_LAST_OUTPUT"
  "$ADB" shell "rm -f '$remote_dex'" >/dev/null 2>&1 || true
  return "$app_process_status"
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
  local java_status=0
  local attempt
  for attempt in $(seq 1 12); do
    TRUST_SMOKE_LAST_OUTPUT=""
    if run_java_https_smoke_checks; then
      echo "Verified emulator HTTPS trust through app_process."
      return 0
    fi
    java_status=$?
    if [[ "$TRUST_SMOKE_LAST_OUTPUT" == *"UnknownHostException"* && "$attempt" -lt 12 ]]; then
      echo "Android DNS is not ready after framework restart; retrying trust probe in 5 seconds ($attempt/12)..." >&2
      sleep 5
      continue
    fi
    break
  done
  if [[ "$java_status" == "127" || "$java_status" == "$TRUST_SMOKE_INFRA_FAILURE" ]]; then
    echo "App-process trust probe infrastructure was unavailable; trying an emulator shell HTTPS client." >&2
    if run_shell_https_smoke_checks; then
      echo "Verified emulator HTTPS trust through shell HTTPS client."
      return 0
    fi
    local shell_status=$?
    if [[ "$shell_status" == "127" ]]; then
      echo "No emulator HTTPS smoke-check mechanism is available. Install a JDK and Android build-tools so app_process trust proof can run." >&2
      return 1
    fi
  fi
  echo "Emulator HTTPS trust smoke check failed" >&2
  return 1
}

if [[ "${1:-}" == "--compile-smoke-only" ]]; then
  compile_java_https_smoke_probe
  echo "Android HTTPS trust probe compilation passed."
  exit 0
fi

if [[ "${1:-}" == "--probe-only" ]]; then
  PROBE_ONLY=1
elif [[ -n "${1:-}" ]]; then
  fail "Unsupported argument: ${1:-}"
fi

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

REMOTE="/system/etc/security/cacerts/$HASH.0"
APEX_CERT_DIR="/apex/com.android.conscrypt/cacerts"
APEX_TMP="/data/local/tmp/lumo-conscrypt-cacerts"
LOCAL_SHA256="$(shasum -a 256 "$HASHED" | awk '{print $1}')"

remote_cert_matches() {
  local remote="$1"
  local remote_sha256
  remote_sha256="$("$ADB" shell "sha256sum '$remote' 2>/dev/null" 2>/dev/null | tr -d '\r' | awk '{print $1}' || true)"
  [[ -n "$remote_sha256" && "$remote_sha256" == "$LOCAL_SHA256" ]]
}

conscrypt_mount_present() {
  "$ADB" shell "grep -F ' $APEX_CERT_DIR ' /proc/mounts" >/dev/null 2>&1
}

SYSTEM_READY=0
APEX_READY=0
remote_cert_matches "$REMOTE" && SYSTEM_READY=1
if "$ADB" shell "[ -d '$APEX_CERT_DIR' ]" >/dev/null 2>&1 \
  && remote_cert_matches "$APEX_CERT_DIR/$HASH.0" \
  && conscrypt_mount_present; then
  APEX_READY=1
fi

if [[ "$SYSTEM_READY" == "1" && "$APEX_READY" == "1" ]]; then
  echo "Zscaler certificate fingerprint and Conscrypt bind mount already match."
  if run_https_smoke_checks; then
    echo "Android trust is healthy; no remount, framework restart, or reboot required."
    exit 0
  fi
  if [[ "$TRUST_REPAIR" != "1" ]]; then
    fail "Trust files are present but HTTPS proof failed. Retry with TRUST_MODE=repair from the emulator wrapper."
  fi
  echo "Explicit trust repair requested after a failed HTTPS proof."
  APEX_READY=0
fi

if [[ "$PROBE_ONLY" == "1" ]]; then
  fail "Android trust is not ready (system=$SYSTEM_READY conscrypt=$APEX_READY)."
fi

if [[ "$SYSTEM_READY" != "1" ]]; then
  require_adb_root "system CA installation"
  REMOUNT_LOG="$WORK_DIR/adb-remount.log"
  if ! "$ADB" remount >"$REMOUNT_LOG" 2>&1; then
    cat "$REMOUNT_LOG" >&2
    FLASH_LOCKED="$("$ADB" shell getprop ro.boot.flash.locked 2>/dev/null | tr -d '\r' || true)"
    if [[ "$FLASH_LOCKED" == "1" ]] || grep -qi "bootloader unlocked" "$REMOUNT_LOG"; then
      fail "adb remount is blocked by the emulator bootloader. Repair or reprovision only the dedicated demo AVD."
    fi
    if [[ "$TRUST_REPAIR" != "1" ]]; then
      fail "adb remount requires a reboot/verity repair. Rerun explicitly with TRUST_MODE=repair."
    fi
    echo "Explicit repair: disabling verity and rebooting once before system CA install..."
    "$ADB" disable-verity || true
    "$ADB" reboot
    wait_for_boot
    require_adb_root "system CA remount after disable-verity"
    if ! "$ADB" remount >"$REMOUNT_LOG" 2>&1; then
      cat "$REMOUNT_LOG" >&2
      fail "adb remount failed after explicit disable-verity repair"
    fi
  fi
  require_system_ca_writeable

  echo "Installing changed certificate fingerprint to $REMOTE..."
  "$ADB" push "$HASHED" "$REMOTE"
  "$ADB" shell chmod 644 "$REMOTE"
  "$ADB" shell chown root:root "$REMOTE" || true
  "$ADB" shell 'command -v chcon >/dev/null && chcon u:object_r:system_file:s0 '"$REMOTE"' || true'
  verify_remote_cert "$REMOTE" "system CA install"
  remote_cert_matches "$REMOTE" || fail "System CA fingerprint did not match after install"
else
  verify_remote_cert "$REMOTE" "system CA install"
  echo "System CA fingerprint already matches; skipping remount and install."
fi

if ! "$ADB" shell "[ -d '$APEX_CERT_DIR' ]" >/dev/null 2>&1; then
  fail "Conscrypt APEX CA directory not found at $APEX_CERT_DIR"
fi

if [[ "$APEX_READY" != "1" ]]; then
  echo "Restoring the volatile Conscrypt CA bind mount..."
  require_adb_root "Conscrypt APEX CA bind mount"
  "$ADB" shell "rm -rf '$APEX_TMP' && mkdir -p '$APEX_TMP' && cp '$APEX_CERT_DIR'/* '$APEX_TMP'/"
  "$ADB" push "$HASHED" "$APEX_TMP/$HASH.0"
  "$ADB" shell "chmod 755 '$APEX_TMP' && chmod 644 '$APEX_TMP'/* && chown root:root '$APEX_TMP'/* || true"
  "$ADB" shell "command -v chcon >/dev/null && chcon u:object_r:system_file:s0 '$APEX_TMP' '$APEX_TMP'/* || true"
  "$ADB" shell "mount --bind '$APEX_TMP' '$APEX_CERT_DIR'"
  verify_remote_cert "$APEX_CERT_DIR/$HASH.0" "Conscrypt APEX CA bind mount"
  if ! conscrypt_mount_present; then
    fail "Conscrypt APEX bind mount was not visible in /proc/mounts"
  fi

  echo "Restarting Android framework once so services reload the restored Conscrypt mount..."
  "$ADB" shell stop
  sleep 3
  "$ADB" shell start
  wait_for_boot
  verify_remote_cert "$APEX_CERT_DIR/$HASH.0" "Conscrypt APEX CA after framework restart"
else
  verify_remote_cert "$APEX_CERT_DIR/$HASH.0" "Conscrypt APEX CA bind mount"
  echo "Conscrypt CA fingerprint and bind mount already match; skipping framework restart."
fi

if ! run_https_smoke_checks; then
  fail "Emulator HTTPS trust smoke check failed after trust preparation"
fi

echo "Done. Android trust is ready without an app reinstall or unconditional reboot."
