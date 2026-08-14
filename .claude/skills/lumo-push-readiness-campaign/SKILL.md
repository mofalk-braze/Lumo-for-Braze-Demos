---
name: lumo-push-readiness-campaign
description: >-
  Executable, decision-gated campaign that takes a teammate's Mac from "fresh
  or broken" to a verified end-to-end Android push from their own Braze
  workspace, including the corporate Zscaler network path. Use for
  BRING-UP/setup, not "it worked before and broke": "set up push", "test
  push", "push has never worked", "push not working on a fresh/new machine",
  "no notification", "push token missing", "FCM token", "FCM error",
  "SERVICE_NOT_AVAILABLE", "Zscaler", "corporate network", "TLS/trust error
  on the emulator", "teammate can't get push", "service account", "Android
  push in my workspace", "verify push readiness", or "Braze says sent but the
  emulator is silent". Also use before any live demo that depends on Android
  push, and whenever an AI agent must prove push works rather than assume it.
  If push worked before on this machine and just stopped, use
  `lumo-debugging-playbook` instead. iOS push is out of scope (needs
  org-signed builds) — see `braze-integration-reference`.
---

# Lumo Push Readiness Campaign (Android)

Goal: a notification sent from **the teammate's own Braze workspace** renders on
**their local Android emulator**, proven at every step by an observable check.
Never judge a gate "by eye" — every gate below has a command or a UI string you
can verify.

Run phases in order. Each phase has PURPOSE, EXACT COMMANDS, EXPECTED
OBSERVATION (what pass looks like), and BRANCHES (if you see X instead → go to
step Y or skill Z). If you are here because "push broke on a machine that
worked before", jump to the [ranked solution menu](#ranked-solution-menu) —
it points back into the phases.

**Jargon (defined once):**

- **Pack** — a demo definition (`demo-pack.json` + assets + local
  `secrets.properties`); applying a pack generates all runtime config.
- **Control Room** — the launcher web UI (`npm run lumo:cockpit`, default
  `http://127.0.0.1:4177`), the only presenter/operator surface.
- **AVD / emulator** — Android Virtual Device profile / the running virtual
  phone. The dedicated demo AVD is `Braze_Demo_API_36`.
- **FCM token** — Firebase Cloud Messaging registration token; the per-install
  device address that Braze pushes to. Generated on-device, never shared.
- **SDK key vs REST key** — the Braze SDK API key identifies the app to a
  Braze workspace (goes on-device); the REST key authorizes host-side API
  calls (session-only in Control Room, never saved to disk).
- **Firebase service account JSON** — server credential Braze needs to send
  FCM pushes for the shared Firebase project. Secret, never in Git.
- **Zscaler** — corporate TLS-intercepting proxy. Its root CA must be trusted
  inside the emulator or FCM and Braze media silently fail.
- **configHash / runtimeHash** — public-pack fingerprint / v2 deployment
  identity covering configuration, active assets, and any private app surface.
  Runtime agreement requires both.

> **iOS status (v1):** iOS push is explicitly out of scope. Unsigned simulator
> builds work for everything EXCEPT push — push needs an org-signed build and
> APNs setup that does not exist yet (`npm run doctor` prints
> `- iOS push: pending Apple Developer team signing / APNs setup`). For the
> architectural background see `lumo-architecture-contract` (known-weak
> points). Everything below is Android-only.

---

## Phase 0 — Preconditions gate

PURPOSE: prove the machine can build and launch the Android shell at all
before touching push. If this phase fails, fix environment first — that is
`lumo-build-and-env` territory (bootstrap anatomy, fresh-Mac flow).

EXACT COMMANDS (repo root):

```sh
node tools/lumo.mjs android doctor
# direct equivalent: ./bootstrap-lumo.sh --check --target android
```

EXPECTED OBSERVATION: a `SolCon capability status` block, then `Checks` lines.
Required for this campaign:

```
- Android shell: ready after pack apply/build
- Android push: client config ready; requires local Braze SDK credentials and Braze-side Firebase setup
...
[PASS] Java - Java 17
[PASS] adb - .../platform-tools/adb
[PASS] Android emulator - .../emulator/emulator
[PASS] Dedicated Android AVD - Braze_Demo_API_36
[PASS] Firebase client config - braze-sc-demo-shell / com.braze.demoshell
```

Exit code 0 (any `[FAIL]` line makes doctor exit 1). Known-acceptable WARNs
for this campaign: `Web dependencies`, `Generated demo runtime` (fixed by
Phase 2's apply), and `Zscaler root CA` **only when the machine is NOT on the
corporate network**. The Android-targeted doctor does not run Xcode/iOS checks.

Two sub-gates:

1. **Dedicated AVD exists.**
   ```sh
   ~/Library/Android/sdk/emulator/emulator -list-avds | grep -x Braze_Demo_API_36
   ```
   Prints `Braze_Demo_API_36` → pass.
2. **Zscaler CA present IF on corporate network.**
   ```sh
   security find-certificate -a -c "Zscaler Root CA" /Library/Keychains/System.keychain >/dev/null && echo ZSCALER_CA_PRESENT || echo ZSCALER_CA_ABSENT
   ```
   On the corporate network you want `ZSCALER_CA_PRESENT` (the launch wrapper
   only installs the CA into the emulator when it finds it in the macOS System
   keychain). Doctor's matching WARN reads: `Android launch can continue, but
   corporate TLS interception may break IAM media or FCM.`

BRANCHES:

- `[WARN] Dedicated Android AVD - Braze_Demo_API_36 not found.` → run
  `node tools/lumo.mjs android setup` (its AVD step uses
  `./bootstrap-lumo.sh --android-avd --target android` and provisions a rootable
  `pixel_10_pro` / `android-36.1;google_apis;arm64-v8a` AVD; it **refuses
  Google Play images by design**). Expected tail: `Ready: Braze_Demo_API_36`.
- Any `[FAIL]` (Java, adb, emulator, sdkmanager, Firebase client config) →
  stop, run `node tools/lumo.mjs android setup` and see
  `lumo-build-and-env`. The Android target cannot be blocked by Xcode.
- AVD exists but provision script says `AVD already exists but does not match
  the dedicated demo profile` → follow its printed instruction
  (`RECREATE_AVD=1 android-shell/tools/provision-demo-avd.sh`) knowing that
  recreation wipes that AVD's app data — see Phase 7 warning first.

## Phase 1 — Braze workspace prerequisites (dashboard-side, per teammate)

PURPOSE: Braze can only push to this app if the teammate's OWN workspace holds
the Firebase service-account credential for the shared Firebase project
(`braze-sc-demo-shell`, Android package `com.braze.demoshell`). This is the
single most common root cause of "Braze says sent, device silent".

STEPS (no repo commands — dashboard work):

1. Obtain the Firebase service-account JSON **outside Git** (password manager
   preferred; Slack only as last resort with a short-lived SolCon key,
   rotated/deleted after setup). Handoff protocol details:
   `lumo-secrets-and-sanitization`.
2. In the teammate's Braze workspace, upload that JSON in the Android Push
   Settings for the app (Braze dashboard → Settings → App Settings → Android →
   Push, "Firebase" credentials). This is per-workspace: a colleague's working
   setup does nothing for yours.
3. Collect from the same workspace: the **Android SDK API key** and the **SDK
   endpoint** (cluster, e.g. `sdk.iad-03.braze.com`). Optionally the REST
   endpoint + a REST key if you want to trigger sends from Control Room in
   Phase 6.

GATE (checkable proxy — the repo cannot verify dashboard state): the Braze
dashboard Android Push Settings page for THIS workspace shows Firebase
credentials configured (service account uploaded / "connected", not empty).
Screenshot-free rule: the teammate confirms the settings page state verbally
or over screen share; do not proceed on "I think it's set up".

BRANCHES:

- Can't get the service-account JSON → stop; only the handoff protocol in
  `lumo-secrets-and-sanitization` is acceptable. Never ask for it in a commit,
  a pack, or a pasted chat blob that persists.
- Teammate has no workspace admin access to upload → escalate to whoever owns
  the workspace; the campaign cannot continue without step 2.

## Phase 2 — Local credential entry

PURPOSE: put the teammate's SDK key + endpoint on THIS machine so the Android
shell talks to THEIR workspace. Credentials live only in the pack's ignored
`secrets.properties`; applying the pack seeds them into
`android-shell/local.properties` (also ignored).

EXACT COMMANDS — Path A (Control Room, recommended for non-engineers):

```sh
npm run lumo:cockpit
```

Open the printed URL → Session & Profile card → expand **"SDK and REST
configuration"** → fill **SDK API key**, **SDK endpoint** (the **Braze
cluster** dropdown fills both endpoints), optionally **REST endpoint** +
**REST API key** (placeholder says `Session only, never saved` — REST keys
are held in memory only) → click **Save config**. Saving writes the pack's
`secrets.properties` AND automatically re-applies the pack.

Path B (file + apply):

```sh
# Edit <pack dir>/secrets.properties (e.g. demo-packs/Lumo/secrets.properties):
#   braze.apiKey=<YOUR_ANDROID_SDK_API_KEY>
#   braze.endpoint=<YOUR_SDK_ENDPOINT e.g. sdk.iad-03.braze.com>
npm run lumo:apply                                   # lumo-default pack
# or: node tools/demo-launcher.mjs --pack <id> --apply-only
```

EXPECTED OBSERVATION (gate):

1. Control Room credential status chip (next to Save config) reads
   **`SDK ready`** (chip turns green). `SDK missing` = key or endpoint absent.
2. Seeds reached the Android build input — check presence WITHOUT printing
   values:
   ```sh
   grep -q '^braze.apiKey=.' android-shell/local.properties && echo SDK_KEY_SEEDED || echo SDK_KEY_MISSING
   grep -q '^braze.endpoint=.' android-shell/local.properties && echo ENDPOINT_SEEDED || echo ENDPOINT_MISSING
   ```
   Both `*_SEEDED` → pass.

BRANCHES:

- `SDK_KEY_MISSING` after Save config → the wrong pack was selected in
  Control Room; credentials are per-pack. Select the pack you will demo, save
  again. (Key names/index: `lumo-config-and-flags`.)
- Tempted to type the key straight into `local.properties` or any generated
  file → NO. Generated files get overwritten on next apply and hand-edits are
  a standing-rule violation. Always go pack → apply.
- Wrong endpoint format: SDK endpoint has no `https://` (e.g.
  `sdk.iad-03.braze.com`); REST endpoint does (e.g.
  `https://rest.iad-03.braze.com`) — the Control Room placeholders show both.

## Phase 3 — Launch through the wrapper

PURPOSE: the launch wrapper is what makes push survivable on the corporate
network — never launch the emulator by hand for push work.

EXACT COMMANDS:

```sh
node tools/lumo.mjs android start --pack lumo-default
# other pack: node tools/lumo.mjs android start --pack <id>
# or Control Room: select pack -> Launch (Android)
```

The command returns after the job, but the detached Control Room authority
stays alive to own telemetry and continuous clock coverage. Inspect it with
`node tools/lumo.mjs android status`; stop it deliberately with
`node tools/lumo.mjs android stop`.

What runs, in order (Control Room job steps use these exact names):
`Applying demo pack` → `Preparing web assets` → `Refreshing Android package`
(`./gradlew :app:validateDemoWebAssets :app:assembleDebug`) →
either `Starting emulator and refreshing app` or `Reusing emulator and
installed app` (runs `android-shell/tools/run-demo-emulator.sh`) → `Ensuring
launcher-owned Android clock coverage` → `Applying runtime identity` →
correlated native runtime/render/trust proof.

`run-demo-emulator.sh` itself reuses exactly one healthy expected AVD without
stopping it, or cold-starts the dedicated AVD once with `-writable-system` if
none is connected. It fails closed on a wrong, offline, physical, or extra
device. It proves Swipe/keyguard readiness, quiesces the old app, and runs
`TRUST_MODE=auto`: healthy Zscaler trust is only probed; after a cold boot,
healthy persistent system trust can restore the volatile Conscrypt bind mount
and restart the framework once. Missing/broken persistent trust requires an
explicit repair. The wrapper then installs the launcher's prebuilt APK only
when its hash changed, with one `adb install -r`, checks the foreground clock,
and launches the app without clearing data. The launcher owns the continuous
clock watcher. Mechanics and every failure message:
`references/zscaler-trust-mechanics.md`.

EXPECTED OBSERVATION (gate): the script/job completes WITHOUT a trust failure.
Representative stdout lines in a passing corporate-network run:

```
Warm launch: reusing emulator-5554 (Braze_Demo_API_36); no emulator stop or reboot.
Zscaler certificate fingerprint and Conscrypt bind mount already match.
Verified emulator HTTPS trust through app_process.
Android trust is healthy; no remount, framework restart, or reboot required.
Launching the installed demo shell without clearing data...
Ready. launchMode=warm ...
```

If the APK changed, the launcher reports one `adb install -r`; if it is
identical, the install is skipped. Both preserve app data.

Off-network you instead see
`No Zscaler Root CA found in macOS System keychain; skipping CA install.` —
also a pass. In Control Room, the job ends `Ready` and logs
`Android HTTPS trust telemetry is ready.`

BRANCHES:

- `Android AVD 'Braze_Demo_API_36' does not exist.` → Phase 0 AVD sub-gate.
- `Android emulator system trust could not be prepared.` (plus remediation
  text) → read the probe output. If persistent trust is missing/broken, run
  `TRUST_MODE=repair android-shell/tools/run-demo-emulator.sh` once, then rerun
  the canonical start command. Recreate via Android setup only if the AVD
  profile itself is wrong.
- `FAIL https://... javax.net.ssl.SSLHandshakeException...` in the smoke
  check, or job error `Android HTTPS trust diagnostics failed` → Zscaler
  branch: run the guided Trust/clock diagnostic card, then follow
  `references/zscaler-trust-mechanics.md`; do not keep rebooting or reinstalling.
- Job step `Waiting for Android trust telemetry` times out (default 15 s,
  env `BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS`) → check the emulator boot
  log `/tmp/lumo-demo-emulator.log`, then rerun the launch.
- Gradle build failure → not a push problem; `lumo-debugging-playbook`.

## Phase 4 — Notification permission on the device

PURPOSE: Android 13+ requires the runtime `POST_NOTIFICATIONS` permission; no
permission → notifications silently dropped even with a valid token.

The app auto-prompts ~900 ms after first launch — but only **once per
install** (it records the attempt in app prefs). If the prompt was dismissed
or denied, re-request via either:

- On-device: **long-press anywhere on the app's WebView** → diagnostics
  drawer → **Push** button.
- Control Room: run the **"Request push permission"** preset (Story controls,
  messaging templates).

EXPECTED OBSERVATION (gate):

```sh
~/Library/Android/sdk/platform-tools/adb shell dumpsys package com.braze.demoshell | grep POST_NOTIFICATIONS
```

Shows `android.permission.POST_NOTIFICATIONS: granted=true`. The diagnostics
drawer summary shows `Push permission: granted`, and the Control Room activity
ledger logs `Notification permission granted`.

BRANCH: `granted=false` and no prompt appears → the one-shot auto-prompt was
already consumed; use the drawer Push button or the Control Room preset (both
re-trigger the system dialog unless the user chose "Don't allow" twice — then
enable notifications in emulator Settings → Apps → the demo app).

## Phase 5 — Token verification gate

PURPOSE: prove an FCM token exists, is registered with Braze, and belongs to
the ACTIVE external ID. This is the gate that catches every trust and
credential failure before you waste time sending campaigns.

EXACT COMMANDS / ACTIONS:

1. Control Room → run the **"Verify push readiness"** preset (description:
   `Refreshes native push-token registration for the active user.`). There is
   also **"Verify Android HTTPS trust"** for trust alone.
2. Read the readiness rail: the Push chip must read **`Push token ready`**
   (not `Push token unknown` / `Push token pending`), and the Trust chip
   **`Android trust ready`**. The Device Identity panel shows the last native
   runtime report and SDK device ID. Push readiness is keyed to
   platform + device + **active external ID** — a token for a different user
   does not satisfy it.
3. On-device cross-check: long-press the WebView → drawer summary shows
   `FCM token: <first 24 chars>...` (not `pending`) plus the active
   `External ID:`. The app log line is
   `FCM token registered with Braze: <first 18 chars>...`.

EXPECTED OBSERVATION (gate): `Push token ready` for the intended external ID,
`Android trust ready`, drawer token not `pending`.

BRANCHES (discriminate by what the telemetry says):

| Observation | Meaning | Action |
|---|---|---|
| No token AND Trust chip failing (`Android HTTPS trust is failing (...)`) | Zscaler/TLS trust broken | Run the Trust/clock guided card, then relaunch with `node tools/lumo.mjs android start --pack <id>` so auto mode probes/restores trust. If persistent trust needs repair, follow `references/zscaler-trust-mechanics.md`. Confirm the AVD is rootable `google_apis`; Play images cannot work. |
| No token, telemetry shows `FCM token retry scheduled` / error containing `SERVICE_NOT_AVAILABLE` | Transient FCM backend/network hiccup | Wait: the app retries 4 times at 2 s / 5 s / 10 s / 20 s. Still failing after that → relaunch through the wrapper (Phase 3). |
| Rail says `Push token was reported for <X>, expected <Y>` | Token is real but bound to a stale user | Re-apply the user: Control Room Session & Profile → **Apply user** (this triggers `changeUser`, which refreshes push readiness), then re-run "Verify push readiness". |
| Telemetry `FCM unavailable` | Firebase client init failed | Check doctor's `Firebase client config` line (Phase 0); `android-shell/app/google-services.json` must exist with package `com.braze.demoshell`. |
| Rail says `Waiting for native push-token telemetry.` forever | App not running / not the selected platform | Relaunch Phase 3; confirm the emulator app is foregrounded and Control Room platform is Android. |

## Phase 6 — End-to-end proof

PURPOSE: the only real definition of done — a push sent from the teammate's
Braze workspace renders on this emulator for the active user.

ACTIONS (either):

- Braze dashboard (teammate's workspace): send a test push (campaign test
  send) targeting the **active external ID** shown in Control Room Session &
  Profile / the drawer.
- Control Room: a `campaign_trigger` preset with the session REST key entered
  in Phase 2 (recipients are required; broadcast is blocked by design — see
  `lumo-run-and-operate` for safe REST usage).

EXPECTED OBSERVATION (gate):

- App in background: a system notification renders in the emulator's shade.
- App in foreground: the push appears as the branded in-app banner; app log
  says `Forwarded foreground push to demo banner.` and the Control Room
  activity ledger logs **`Foreground push received`**.

BRANCHES — Braze shows "sent" but the device is silent (classic trap; work
top to bottom):

1. **Wrong workspace credential**: the SENDING workspace lacks (or has a
   different project's) Firebase service account → Phase 1 gate. Symptom
   pattern: Braze marks sent, zero device activity, token still valid.
2. **Token registered to a different install**: the dashboard user profile's
   registered device is not this emulator (someone copied a token, or the app
   was reinstalled after reset). Compare the drawer's token preview
   (drawer **FCM Copy** button copies the full token locally) with the device
   shown on the user's profile in the Braze dashboard. Fix: re-run Phase 5 so
   THIS install's token registers, and target the right external ID.
3. **Notification permission denied**: Phase 4 check (`granted=false` drops
   background pushes silently). Foreground banner still working while the
   shade stays empty is the tell.
4. Only foreground banner missing while shade works → not a push problem;
   web runtime issue → `lumo-debugging-playbook`.

## Phase 7 — Rehearsal persistence

PURPOSE: keep the proof valid until demo day.

Normal launches preserve app data. An identical APK is not reinstalled; a
changed APK gets one `adb install -r`. Either way the Braze SDK device identity
and FCM token stay stable across relaunches.
Therefore:

- Do **NOT** reset app data, uninstall the app, or recreate the AVD between
  the proof and the demo.
- Relaunching via `node tools/lumo.mjs android start --pack <id>` is the
  recommended pre-demo warm-up. It reuses the expected AVD, verifies trust,
  and restores the volatile mount only when required.
- If someone DID run `RESET_APP_DATA=1` or `RECREATE_AVD=1`: the install is
  new → expect a **new FCM token** and a re-fired permission prompt. Redo
  Phase 4 and the Phase 5 gate before trusting push again.
- Before presenting, also confirm the pack is freshly applied and both
  configHash and runtimeHash agree in native/runtime/render evidence — never
  demo from a stale pack; see `lumo-run-and-operate`.

---

## WRONG PATHS — do not do these

| Wrong path | Why it breaks |
|---|---|
| Using a Google Play / production AVD image | No `adb root` → the Zscaler CA cannot be installed into the system/Conscrypt stores → TLS to FCM and Braze media is permanently broken on the corporate network. Both `provision-demo-avd.sh` and the launch wrapper reject/flag this on purpose. |
| Copying an FCM token from another machine | Tokens are per-install device addresses. A foreign token targets someone else's emulator; Braze will "send" and nothing arrives here. |
| Committing or pasting the Firebase service-account JSON anywhere in the repo | It is a live server credential. It goes dashboard-side only, handed off outside Git (`lumo-secrets-and-sanitization`). `npm run security:scan` exists to catch exactly this. |
| Setting `RESET_APP_DATA=1` casually | Destroys the Braze SDK device identity and token continuity; every downstream gate (5–7) is invalidated. Explicit recovery action only. |
| Bumping `firebase-messaging` past 25.0.1 | The emulator image's GMSCore is below the 25.1.0 Play Services floor — pinned with an explanatory comment in `android-shell/app/build.gradle.kts`. Verify before ever touching it. |
| Disabling Zscaler instead of installing the CA | Non-durable (IT re-enables it), leaves teammates unfixed, and hides the failure until demo day. The wrapper's CA install is the supported pattern. |
| Hand-editing generated files (`local.properties`, `activeDemoConfig.generated.ts`, ...) to force credentials | Overwritten on next apply; breaks runtime identity agreement. Pack `secrets.properties` → apply is the only path. |

## Ranked solution menu

For the recurring case "push is broken on a teammate's machine that should
work" — try in this order, cheapest and least destructive first:

1. **Rerun the canonical launch**:
   `node tools/lumo.mjs android start --pack <id>` — reuses the correct AVD,
   probes/restores trust safely, skips an identical APK (or uses one
   data-preserving install), re-binds runtime identity, and re-proves native
   runtime/render/trust. Re-check the Phase 5 gate.
2. **Verify workspace-side service account** (Phase 1 gate) — the teammate's
   OWN workspace must hold the Firebase credential.
3. **Re-enter SDK credentials and re-apply** (Phase 2) — wrong key/endpoint
   or wrong pack selected; confirm the `SDK ready` chip and seeded
   `local.properties` keys.
4. **Re-check notification permission** (Phase 4) — one `adb shell dumpsys`
   line settles it.
5. **Last resort**: `RECREATE_AVD=1 android-shell/tools/provision-demo-avd.sh`
   and/or `RESET_APP_DATA=1` through the wrapper — WARNING: both destroy SDK
   device identity and the FCM token; you must redo Phases 3–6 completely.

## Validation and promotion protocol

- Any code or doc change you discover is necessary during this campaign (a
  script fix, a doc correction, a new flag) routes through
  `lumo-change-control-and-qa` — run its commit gates; never commit from the
  middle of a debugging session without them.
- Workspace-side fixes (service account uploaded, cluster confirmed, external
  IDs used) get recorded in the pack's notes so the pack stays durable and
  the next presenter doesn't rediscover them — see `lumo-demo-pack-authoring`
  (durable-pack doctrine).
- If the machine's environment itself was broken, capture what fixed it for
  `lumo-build-and-env` follow-up rather than leaving it tribal knowledge.

## When NOT to use this skill

- General "something is broken" triage, IAM/Content Cards/web issues, or
  stale-pack drift → `lumo-debugging-playbook`.
- Understanding how the token lifecycle / bridge / key taxonomy works
  conceptually → `braze-integration-reference`.
- Fresh-machine environment setup beyond Phase 0's gate →
  `lumo-build-and-env`.
- Day-of-demo operation (packs, users, triggers) → `lumo-run-and-operate`.
- Secret handling questions or a suspected leak →
  `lumo-secrets-and-sanitization`.
- iOS push: not supported in v1 (org-signed builds required) →
  `lumo-architecture-contract` known-weak points.

## Provenance and maintenance

Verified 2026-07-03 against the repo (Apple Silicon macOS path). Re-verify
before trusting drifting facts:

- npm scripts (`lumo:launch:android`, `lumo:apply`, `doctor`):
  `grep -n '"lumo:' package.json`
- Launch wrapper behavior + expected stdout:
  `sed -n '1,165p' android-shell/tools/run-demo-emulator.sh`
- Zscaler CA install + smoke-check URLs:
  `grep -n 'https://' android-shell/tools/install-zscaler-system-ca.sh`
- AVD name/profile and Play-image rejection:
  `grep -nE 'AVD_NAME|playstore|pixel_10_pro' android-shell/tools/provision-demo-avd.sh`
- firebase-messaging pin + comment:
  `grep -n -B2 'firebase-messaging' android-shell/app/build.gradle.kts`
- FCM retry schedule / auto-prompt delay / drawer:
  `grep -nE 'FCM_TOKEN_RETRY_DELAYS_MS|}, 900|setOnLongClickListener' android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`
- Control Room presets and readiness-rail strings:
  `grep -nE 'Verify push readiness|Push token ready|Android trust ready' tools/demo-launcher.mjs tools/control-room-template.mjs`
- Trust-telemetry wait timeout env:
  `grep -n 'BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS' tools/demo-launcher.mjs`
- Dashboard-side steps of record: `docs/lumo-public-quickstart.md`
  ("Android Push In Your Own Braze Workspace", "Zscaler And Pixel 10
  Emulator").

### Open questions / candidates (unproven — do not present as fact)

- Exact Braze dashboard navigation labels for Android Push Settings may vary
  with dashboard releases; the doc of record only says "Braze Android Push
  Settings". Confirm in the live dashboard during Phase 1.
- Whether a second system permission dialog is possible after two explicit
  denials varies by Android version; the Settings-app fallback in Phase 4 is
  the safe route.
