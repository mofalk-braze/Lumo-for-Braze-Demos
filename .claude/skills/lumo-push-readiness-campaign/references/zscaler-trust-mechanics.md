# Zscaler / Android Emulator Trust Mechanics

Companion to `lumo-push-readiness-campaign` Phase 3 and the Phase 5 Zscaler
branch. Everything here is read from
`android-shell/tools/run-demo-emulator.sh` and
`android-shell/tools/install-zscaler-system-ca.sh` (verified 2026-08-14).

## Contents

- [Why This Exists](#why-this-exists-the-war-story)
- [Normal Launcher Behavior](#what-the-normal-launcher-does)
- [CA Installer Behavior](#what-the-ca-installer-does)
- [In-App Trust Telemetry](#in-app-trust-telemetry)
- [Triage Table](#triage-table)
- [Re-Verification](#re-verification)

## Why this exists (the war story)

On the corporate network, Zscaler intercepts TLS and re-signs traffic with the
"Zscaler Root CA". Android apps trust only the OS trust stores, so inside a
stock emulator every HTTPS call to Firebase (`firebaseinstallations.
googleapis.com`) and Braze media (`braze-images.com`) fails certificate
validation — **silently** from the app's point of view: no FCM token, broken
in-app-message images, no obvious error. The fix is installing the host's
Zscaler Root CA into the emulator's **system** trust store AND the
**Conscrypt APEX** trust store (Android 14+/GMSCore reads CAs from the
Conscrypt module, not just `/system`). That requires `adb root` + a writable
system partition — hence the mandatory rootable `google_apis` image and the
launch wrapper.

## What the normal launcher does

`run-demo-emulator.sh` is invoked by
`node tools/lumo.mjs android start --pack <id>` or Control Room Launch:

1. If exactly one connected device is the healthy expected AVD, it reuses it
   without stopping or rebooting it. If none is connected, it cold-starts the
   dedicated AVD once with `-writable-system -no-snapshot-load`, logging to
   `/tmp/lumo-demo-emulator.log`. A wrong, offline, physical, or additional
   device fails closed.
2. Waits for full boot, activity-manager readiness, a non-secure Swipe
   keyguard, and user 0 `RUNNING_UNLOCKED`; enforces lock-screen notification
   settings, then quiesces the previous app.
3. In the default `TRUST_MODE=auto`, checks the macOS System keychain:
   `security find-certificate -a -c "Zscaler Root CA" /Library/Keychains/System.keychain`
   - Found → probes the system certificate fingerprint, Conscrypt bind mount,
     and HTTPS proof. Healthy trust is left untouched. If persistent system
     trust is healthy but the cold boot lost the volatile Conscrypt mount, it
     restores only that mount and restarts Android's framework once.
   - Missing/broken persistent system trust → fails with instructions to use
     `TRUST_MODE=repair` explicitly; normal launch does not remount `/system`,
     disable verity, or reboot to mutate trust.
   - Not found → `No Zscaler Root CA found in macOS System keychain; skipping
     CA install.` (correct off-network behavior).
4. Installs only the absolute prebuilt `APK_PATH` supplied by the launcher,
   and only when `INSTALL_APP=1`, using one `adb install -r`. The launcher
   chooses this only when the built APK differs from the installed one.
5. Runs one foreground clock check and launches the installed app. The
   persistent launcher authority owns continuous clock coverage and telemetry
   after the wrapper returns.

Environment knobs (defaults): `AVD`/`BRAZE_DEMO_ANDROID_AVD`
(`Braze_Demo_API_36`), `APP_ID` (`com.braze.demoshell`), `INSTALL_APP=0`,
`APK_PATH=` (required with install), `LAUNCH_APP=1`, `RESET_APP_DATA=0`,
`TRUST_MODE=auto`, `TIME_SYNC_GUARD=1`.

## What the CA installer does

`install-zscaler-system-ca.sh`, step by step:

1. Extracts every cert from the macOS System keychains, picks the one whose
   subject contains `Zscaler Root CA`, computes the OpenSSL
   `-subject_hash_old` hash. Prints `Using cert hash: <hash>`.
2. Compares the host fingerprint with
   `/system/etc/security/cacerts/<hash>.0`, checks that the matching cert is
   visible through the Conscrypt APEX bind mount, and runs the on-device HTTPS
   probe when both are present. A healthy state exits without root, remount,
   framework restart, or reboot. `--probe-only` reports the two readiness bits
   and never mutates them.
3. If persistent system trust needs an explicit repair, `adb root` is a hard
   gate. On a non-rootable image it prints:
   ```
   adb root is required for system CA installation, but this emulator is not rootable.
   ...
   Use a rootable Google APIs AVD. Google Play/production images cannot install a
   system CA and must not be used for Zscaler-backed push/IAM validation.
   ```
   (It also prints the image's system name / build tags / fingerprint so you
   can see you're on a `playstore` image.) → Fix: recreate the AVD with
   `node tools/lumo.mjs android setup` (the provision script refuses
   `playstore` packages by construction).
4. `adb remount` is attempted. If remount requires a verity reboot, only
   `TRUST_MODE=repair` (passed to the installer as `TRUST_REPAIR=1`) permits
   `adb disable-verity` + one reboot + remount. A locked bootloader fails with
   a repair/reprovision instruction; the workflow never guesses credentials
   or silently wipes the AVD.
5. Pushes the hashed cert to `/system/etc/security/cacerts/<hash>.0`
   (chmod 644, chown root, SELinux `system_file` context) and verifies the
   fingerprint. There is no unconditional reboot; one occurs only earlier if
   the explicit verity repair was necessary.
6. **Conscrypt APEX bind mount**: copies the APEX CA dir to
   `/data/local/tmp/lumo-conscrypt-cacerts`, adds the Zscaler cert,
   `mount --bind`s it over `/apex/com.android.conscrypt/cacerts`, verifies the
   mount appears in `/proc/mounts`, then restarts the Android framework
   (`adb shell stop` / `start`) so Google Play services reloads CAs.
   The mount is runtime-only, so a cold boot loses it; the next normal launch
   restores just this mount when the persistent system CA is still healthy.
7. **HTTPS smoke checks** — the checkable proof. Preferred mechanism compiles
   a tiny Java probe and runs it on-device via `app_process` (exercises the
   same Conscrypt stack apps use) against exactly:
   - `https://braze-images.com/`
   - `https://firebaseinstallations.googleapis.com/`

   Pass output:
   ```
   OK https://braze-images.com/ <http code>
   OK https://firebaseinstallations.googleapis.com/ <http code>
   Verified emulator HTTPS trust through app_process.
   ```
   Fail output starts `FAIL <url> javax.net.ssl....` and the script exits
   with `Emulator HTTPS trust smoke check failed`. If no host JDK/build-tools
   are available it falls back to on-device curl/wget; if nothing exists it
   fails with `No emulator HTTPS smoke-check mechanism is available.`
8. Final line after preparation:
   `Done. Android trust is ready without an app reinstall or unconditional reboot.`

## In-app trust telemetry

Independently of the shell scripts, the Android app runs its own HTTPS trust
diagnostics (on launch, resume, user change, and on the Control Room
**"Verify Android HTTPS trust"** preset) and posts the result to the launcher.
App log lines: `HTTPS trust diagnostics passed.` /
`HTTPS trust diagnostics failed.` Control Room surfaces it as the Trust chip:
`Android trust ready` vs `Android trust failing` (with the failing check
named). The launcher's Android launch job also blocks on this telemetry
(`Waiting for Android trust telemetry`, timeout
`BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS`, default 15000 ms).

## Triage table

| Observation | Cause | Action |
|---|---|---|
| `adb root is required ... not rootable` | Play/production image | Recreate AVD through `node tools/lumo.mjs android setup` (or use `RECREATE_AVD=1 android-shell/tools/provision-demo-avd.sh` only if the profile drifted). Data in a recreated AVD is lost — redo campaign Phases 3–6. |
| `adb remount is blocked by the emulator bootloader` | Persistent trust repair cannot safely continue | Repair or reprovision only the dedicated demo AVD. Treat any recreation as destructive and redo campaign Phases 3–6. |
| Auto mode says persistent trust is missing/broken | Normal launch intentionally refused a system mutation | Run `TRUST_MODE=repair android-shell/tools/run-demo-emulator.sh` once against the dedicated AVD, then rerun `node tools/lumo.mjs android start --pack <id>`. |
| `FAIL https://... SSLHandshakeException` in smoke check | CA state incomplete, changed interception cert, or network issue | Confirm the host cert, use the guided Trust/clock card, and repair only if the probe specifically requires it. Do not loop reboots/reinstalls. |
| Trust was fine, broke after a manual emulator cold start | The Conscrypt bind mount is runtime-only | Rerun `node tools/lumo.mjs android start --pack <id>`; auto mode restores only the volatile mount. |
| Off-network machine, everything skipped, push still fails | Not a trust problem | Return to campaign Phase 5 branches (credentials / SERVICE_NOT_AVAILABLE / user binding). |
| `Could not find Zscaler Root CA in macOS System keychains.` while ON the corporate network | Host CA missing | Install the corporate CA into the macOS System keychain per IT guidance, then rerun. |

## Re-verification

- `node tools/lumo.mjs android start --pack <id>` reaches `Ready`.
- `node tools/lumo.mjs android status` reports one healthy authority.
- The Trust/clock guided card passes both HTTPS endpoints and the launcher-
  owned clock check.
- `grep -n 'refreshTrustDiagnostics' android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`
