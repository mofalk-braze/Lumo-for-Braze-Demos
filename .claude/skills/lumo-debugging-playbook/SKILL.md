---
name: lumo-debugging-playbook
description: >-
  Symptom-to-fix regression triage for the Lumo Braze Demo Shells repo. Use
  when something that worked before is now broken: Android push/FCM, Zscaler
  trust, emulator/AVD startup, Android/web/iOS builds, blank WebViews, pack
  apply or runtime-hash drift, Content Cards, IAM, Control Room, or stale
  branding. Typical triggers include "debug", "push stopped arriving", "no
  token", "blank screen", "emulator won't boot", "build failed", "cards not
  showing", "IAM not showing", "hash mismatch", or "why is this failing".
  For first-time machine or push bring-up, use lumo-build-and-env or
  lumo-push-readiness-campaign instead.
---

# Lumo Debugging Playbook

Symptom → triage → fix for this repo's known failure modes. Every branch ends in
either a fix with a verification command, or a route to a sibling skill.

Terms used below (defined once):

- **Pack** — a demo definition (`demo-pack.json` + assets + local `secrets.properties`)
  under `demo-packs/` (public) or `.demo-packs/` (local). Applying a pack generates
  all runtime config.
- **Control Room** — the presenter cockpit served by `npm run lumo:cockpit`
  (`tools/demo-launcher.mjs`, default `http://127.0.0.1:4177`).
- **Shell** — the native Android (`android-shell/`) or iOS (`ios-shell/`) app that
  hosts the web UI in a WebView and owns the real Braze SDK.
- **Bridge** — the JS↔native message channel (`window.__brazeBridge` /
  `brazeBridge` handler) between web UI and shell.
- **AVD** — Android Virtual Device, the emulator profile (default `Braze_Demo_API_36`).
- **FCM token** — Firebase Cloud Messaging registration token; the Android push
  address for one specific app install.
- **SDK key vs REST key** — the SDK API key identifies the app to a Braze workspace
  (lives in the pack's `secrets.properties`); the REST key authorizes host-side API
  calls (lives in env vars, never in files).
- **configHash** — 16-char hash of the pack content, stamped into every generated
  artifact so drift is detectable.

## The triage loop

Run this loop for every incident. Do not skip to a fix you remember.

1. **Reproduce once** — confirm it fails the same way twice.
2. **Read the actual error** — from the right instrument (table below), not from memory.
3. **Locate the layer** — pack/apply → web build → bridge → native shell →
   network/trust → Braze cloud. Errors surface at the layer boundary above the cause.
4. **Run ONE discriminating experiment** — from the matching table below.
5. **Fix** the confirmed cause only.
6. **Re-verify with a command** — every fix below names one.

### Where to read errors (instruments)

| Layer | Instrument | How |
|---|---|---|
| Control Room / launcher | Job log, Activity Feed, blocker chips | Open the URL the launcher printed; raw state: `.demo-launcher/state.json` |
| Android app | Debug drawer | **Long-press anywhere in the app's WebView** — shows pack id, `Hash:`, source URL, profile, endpoint, push permission, FCM token preview, last 40 log lines |
| Android app | Logcat | `adb logcat -d -s BrazeDemoShell:V BrazeDemoApplication:V \| tail -30` |
| Android emulator | Emulator log | `tail -50 /tmp/lumo-demo-emulator.log` |
| iOS app | Console | `xcrun simctl launch --console booted com.braze.masquerade` (bridge lines print live) |
| Web in browser | Browser console | Harness bridge logs `[harness] <action>` lines |
| Generated runtime | Manifest | `python3 -m json.tool web-template/public/demo-runtime.json` |

Deep interpretation of these instruments (doctor, validate, Control Room panels)
belongs to `lumo-diagnostics-and-tooling`.

In Guided Control Room, open **05 Help & Troubleshooting** and begin with the
cards for Android launch,
selected-pack credentials, runtime identity, rendered source, Content Cards,
Banners, IAM, trust/clock, push delivery, and active persona. Each separates
placement or trigger evidence from actual message-delivery proof and offers
one safe next action. If escalation needs a file, use **Download
redacted bundle** (`GET /api/diagnostics/bundle`); never share raw launcher
state or copied credential-bearing logs.

## 1. Android push token not arriving

The shell requests the FCM token on launch/resume/user-change
(`refreshPushReadiness` in `android-shell/.../MainActivity.kt`) and hands it to
Braze via `braze.registeredPushToken`. Triage in this order:

| Observation | Most likely cause | Discriminating experiment | Fix / route |
|---|---|---|---|
| Control Room trust chip red; drawer log says `HTTPS trust diagnostics failed.`; `trust_diagnostics` telemetry `status: error` | Zscaler/TLS trust failure — corporate proxy CA not trusted inside the emulator | Run Control Room preset **Verify Android HTTPS trust** (checks `https://braze-images.com/` and `https://firebaseinstallations.googleapis.com/` from inside the app); note which check fails and its `errorType` (SSL errors ⇒ trust) | Relaunch through `node tools/lumo.mjs android start --pack <id>` so normal `TRUST_MODE=auto` probes the stores and restores a missing volatile Conscrypt mount. If it reports missing/broken persistent trust, run the wrapper once with explicit `TRUST_MODE=repair`, then return to the canonical launcher. Verify: preset again → `HTTPS trust diagnostics passed.` Full bring-up: `lumo-push-readiness-campaign` |
| Telemetry: `FCM token retry scheduled` (warning), error text contains `SERVICE_NOT_AVAILABLE` | Transient FCM outage/network blip | Wait: the app retries up to 4 times with 2s/5s/10s/20s backoff (`FCM_TOKEN_RETRY_DELAYS_MS`), each attempt visible in telemetry | If a later attempt logs `FCM token registered with Braze: …`, done. If it ends in `FCM token failed` (error), treat as trust failure (row 1) — `SERVICE_NOT_AVAILABLE` is how TLS interception often presents |
| Drawer shows `Profile: none` / `Endpoint: -`; logcat: `Braze API key/endpoint missing. Add a workspace in the Lumo setup screen.`; actions log `… skipped: Braze is not configured.` | Missing/blank Braze SDK key or endpoint. **The app deliberately runs without the SDK when they are blank** (`DemoApplication.kt` skips `Braze.configure` and only warns) — nothing crashes, everything Braze silently no-ops | `grep -E '^braze\.(apiKey\|endpoint)=' android-shell/local.properties` — blank values confirm it | Put `braze.apiKey` / `braze.endpoint` in the pack's `secrets.properties`, re-apply the pack, rebuild + reinstall (the seed profile is baked in at build time). Verify: `adb logcat -d -s BrazeDemoApplication \| tail -3` → `Braze runtime configuration applied: true` |
| Gradle prints: `android-shell/app/google-services.json is missing. The app can compile, but FCM token generation requires adding your Firebase config file …` | `google-services.json` deleted/moved (it IS committed — public Firebase client config for `com.braze.demoshell`) | `ls android-shell/app/google-services.json` | `git checkout -- android-shell/app/google-services.json`, rebuild. Verify: `npm run validate:demo-runtime` passes |
| Telemetry says `FCM token registered` and drawer shows a token, but pushes sent from Braze never arrive | Push reaches Braze but the wrong plumbing behind it: Firebase **service-account JSON not uploaded into the presenting workspace**, SDK key/endpoint pointing at a different workspace, or the token belongs to a different install | In the Braze dashboard, check the user profile for the active external ID (drawer `External ID:` line): does it show a push-enabled Android device with a token matching the drawer preview (use the drawer **FCM Copy** button)? | This is workspace setup, not app debugging → `lumo-push-readiness-campaign` |

> **Trap: Zscaler/TLS trust.** IAM media and FCM once failed *silently* on the
> corporate network — no crash, no obvious error — until the Zscaler Root CA was
> installed into the Android system + Conscrypt trust stores on a rootable
> Google-APIs image. Lesson: on a corporate Mac, treat every silent
> media/token failure as a trust failure first, and always launch through the
> canonical Android command. It probes trust on every run, restores only the
> volatile Conscrypt mount after cold boot, and requires an explicit repair
> mode before changing persistent system trust.

> **Trap: per-workspace FCM.** Push "not arriving" has repeatedly been one of:
> service-account JSON not uploaded into the *presenting teammate's own* Braze
> workspace, wrong SDK key/endpoint pair, or a token that belongs to a different
> install. Lesson: the token you see in the drawer must appear on the user
> profile in the *same workspace you are sending from*. Each install generates
> its own token — never assume a teammate's token or an old install's token is yours.

Also note: never wipe app data to "fix" push. `RESET_APP_DATA=1` / uninstall
destroys the Braze SDK device identity and push-token continuity; it is an
explicit recovery action only.

## 2. Emulator / AVD problems

Scripts: `android-shell/tools/provision-demo-avd.sh` (create),
`android-shell/tools/run-demo-emulator.sh` (launch; the Control Room calls this).
Emulator stdout/stderr goes to `/tmp/lumo-demo-emulator.log`.

| Observation | Most likely cause | Discriminating experiment | Fix / route |
|---|---|---|---|
| `Android AVD 'Braze_Demo_API_36' does not exist.` | AVD never provisioned on this machine | `~/Library/Android/sdk/emulator/emulator -list-avds` | `android-shell/tools/provision-demo-avd.sh`, then relaunch. First-time SDK setup → `lumo-build-and-env` |
| `Refusing Google Play image. Use a rootable google_apis image.` | Play-Store system image requested — rejected by design (`adb root` needed for Zscaler CA install) | — (message is definitive) | Use the default `google_apis` image; do not override `API_LEVEL`/`ABI` toward a `playstore` image |
| `AVD already exists but does not match the dedicated demo profile.` (prints current vs expected device/image) | An AVD named `Braze_Demo_API_36` exists but with the wrong device profile or system image | Read the printed `current device` / `current image` lines | `RECREATE_AVD=1 android-shell/tools/provision-demo-avd.sh` — **warning: this deletes the AVD, destroying all app data inside it, including the Braze SDK device identity and push-token continuity.** One-time setup correction only, never a routine launch step |
| Emulator starts but launch hangs, then: `Emulator booted, but user 0 did not unlock. Unlock the AVD once or use an AVD without a lock screen.` | Lock screen set inside the AVD. The wrapper waits for boot, then tries wake/dismiss-keyguard/swipe for ~2 minutes before giving up | Watch the emulator window during the wait | Unlock manually once and remove the lock screen in the AVD's Android settings; relaunch |
| Emulator window never appears / crashes at start | Emulator process died | `tail -50 /tmp/lumo-demo-emulator.log` — read the real error | Fix per log (disk, HAXM/hypervisor, image missing). Environment repair → `lumo-build-and-env` |
| Launch aborts with the "Android emulator system trust could not be prepared" block | Zscaler CA present on host but persistent system trust is missing/broken, or volatile Conscrypt restoration failed | Read the message and the preceding probe. Confirm the AVD is the rootable `google_apis` profile; a cold start uses `-writable-system` | If persistent trust needs mutation, run `TRUST_MODE=repair android-shell/tools/run-demo-emulator.sh` once with the launcher's normal install inputs, then return to `node tools/lumo.mjs android start --pack <id>`. Recreate the AVD only for profile drift; see Trap: Zscaler/TLS in section 1 |
| Need a different AVD | — | — | Set `BRAZE_DEMO_ANDROID_AVD=<name>` (respected by the launcher and both scripts) or `--avd <name>` on the launcher CLI — rootable Google-APIs images only |

Verification after any emulator fix:
`node tools/lumo.mjs android start --pack <id>` completes to `Ready`; the
wrapper reports the warm/cold launch mode, and
`node tools/lumo.mjs android status` shows the persistent authority healthy.

## 3. iOS blank screen / WKWebView load failures

The iOS shell has **no bundled web assets** (M2 pending — see
`ios-shell/README.md`): it always loads the Vite dev server at
`http://localhost:5173`. No dev server ⇒ white screen.

| Observation | Most likely cause | Discriminating experiment | Fix / route |
|---|---|---|---|
| White/blank screen in simulator | Vite dev server not running | `curl -sI http://localhost:5173 \| head -1` → expect `HTTP/1.1 200 OK` | `cd web-template && npm run dev`, then relaunch the app (`xcrun simctl launch booted com.braze.masquerade`) |
| Console line `[webview] load failed: <description>` (run with `xcrun simctl launch --console booted com.braze.masquerade`) | Main-frame load failure; same failure also reaches the web layer as `loadError` in the `connection` bridge payload | Read the description (connection refused ⇒ dev server; DNS/ATS ⇒ URL override) | Start the dev server or fix the profile's `webURL` override; relaunch |
| App missing entirely / `xcodebuild` can't find project | `.xcodeproj` is git-ignored and was never generated | `ls ios-shell/BrazeDemoShell.xcodeproj` | `cd ios-shell && xcodegen generate` — see section 5 |
| Web loads but SDK actions no-op | `Sources/Config.swift` empty (blank `brazeAPIKey`/`brazeEndpoint`) — same silent leniency as Android | Console shows bridge traffic but no Braze activity | Seed credentials via a pack apply (`Config.swift` is upserted if the file exists) or `cp Config.example.swift Sources/Config.swift` and fill locally. Never commit values |

Push on iOS simulator additionally requires an org-signed build: unsigned
simulator builds (`CODE_SIGNING_ALLOWED=NO`, which is how the launcher always
builds iOS) run everything EXCEPT push — they never receive an APNs token, by
design, not as a bug to chase. This is not in scope for
`lumo-push-readiness-campaign` (Android-only). For the mechanics (APNs
registration flow, `signedBuildRequired` diagnostics flag, what an org-signed
build would need) see `braze-integration-reference` section 8.

## 4. Pack apply errors

Apply-time validation lives in `tools/demo-pack-utils.mjs`; cross-pack checks in
`tools/validate-demo-runtime.mjs`. Exact messages (verbatim catalog with sources:
`references/error-messages.md`):

| Error (verbatim shape) | Cause | Fix |
|---|---|---|
| `Demo pack not found: <id>` | No directory under `demo-packs/` or `.demo-packs/` whose dir name or `demo-pack.json` `id` matches | `node tools/demo-launcher.mjs --list` to see known packs; fix the id or move the pack into `.demo-packs/<id>/demo-pack.json` |
| `Duplicate demo pack id: <id>` (from `npm run validate:demo-runtime`) | Same `id` exists in both `demo-packs/` and `.demo-packs/` (or twice locally) | Rename one pack's `id` (and directory) |
| `<file> id must be kebab-case: <id>` | `id` has uppercase/underscores/spaces | Lowercase letters, digits, single hyphens: `my-brand-demo` |
| `<file> is missing required field: <key>` | One of `id`, `name`, `brand`, `content` absent | Add it — schema details: `lumo-demo-pack-authoring` |
| `<file> has an incomplete brand section` / `… incomplete content section` | `brand.colors`/`brand.tabs`/`brand.demoUser` or `content.hero`/`content.categories`/`content.rails` missing | Fill the section — `lumo-demo-pack-authoring` |
| `… content.contentCardSurfaces[N] …` messages | Surface entry missing a required string field, or unsupported `surface`/`variant`/`emptyBehavior` value | Allowed values are listed in the error; fix the entry |
| Pack applies fine but an asset doesn't show up | Asset sync is **full replacement**: apply deletes `web-template/public/demo-assets/<id>/` and re-copies the pack's `assets/` dir. Files placed in the generated dir by hand are wiped | Put the file in `<pack>/assets/` and re-apply. Never hand-edit generated files (standing rule) |

Verification after any apply fix: `npm run lumo:apply && npm run validate:demo-runtime`
→ `Demo runtime validation passed.`

## 5. Build breaks

| Observation | Cause | Fix |
|---|---|---|
| Gradle: `Missing <dist>/index.html. Apply a demo pack or build the configured web app before building Android.` | Android packages `web-template/dist/` (or the pack's `web.distDir`) into assets at build time; the web app was never built | `npm run lumo:apply && (cd web-template && npm run build)`, then rebuild Android. The Control Room **Launch** button runs the whole chain for you |
| Gradle: `Generated demo runtime does not match selected pack <id>.` or `… selected hash <hash>.` | The built web dist belongs to a different pack/hash than `android-shell/local.properties` says — apply and build got out of sync | Re-apply the active pack, rebuild web, rebuild Android (same command as above). This is the preBuild drift gate doing its job — do not work around it |
| `cd web-template && npm run build` fails | `tsc -b` type errors or Vite errors — usually a hand-edited generated file or a broken pack field | Read the first TS error. If it points into `src/brand/activeDemoConfig.generated.ts`, fix the *pack* and re-apply — never the generated file |
| iOS: `BrazeDemoShell.xcodeproj` missing | Project file is git-ignored; generated from `project.yml` | `cd ios-shell && xcodegen generate` |
| iOS: Braze Swift SDK resolution/compile errors | SDK version drift. Pinned `from: "11.9.0"` in `ios-shell/project.yml` — **do not bump past it**: 15.1.0+ fails to compile under Xcode 26.5 / Swift 6.3 (BrazeUI↔BrazeKit mismatch inside Braze's SDK, per the comment in `project.yml`) | Reset the pin to 11.9.0, delete `ios-shell/DerivedData` if needed, `xcodegen generate`, rebuild |
| Toolchain-level failures (JDK, sdkmanager, brew, Xcode license) | Environment, not this repo's logic | → `lumo-build-and-env` |

Verification: `cd android-shell && ./gradlew :app:compileDebugKotlin` (Android),
`cd web-template && npm run build` (web) both exit 0.

## 6. Stale runtime drift mid-demo

**Symptom:** Control Room launch blocker like
`android reported hash <x>, expected <y>` (or `… reported pack <a>, expected <b>`),
warning chips on the runtime panel, or plain old branding on the device while
the Control Room shows the new pack.

**Cause:** apply / web build / native build / install got out of sync — the
installed app carries an older pack or configHash than the generated runtime.

**Fix (always the same):** re-apply + rebuild + reinstall as one chain — press
**Launch** in the Control Room, or:

```sh
node tools/lumo.mjs android start --pack <id>
# apply → web build → Gradle → hash-aware install/reuse → launch → correlated proof
```

**Verify runtimeHash agreement (the definition of "fixed"):**

1. Expected: `node -e "const m=require('./web-template/public/demo-runtime.json');console.log(m.id,m.runtimeHash)"`
2. On device: long-press the WebView → deployment hash must match; the
   Control Room device chip shows the same `hash …`.
3. `npm run validate:demo-runtime` passes (it also compares the packaged Android
   asset manifest under `android-shell/app/build/generated/assets/demoWeb/`).

For a scripted end-to-end drift check, see `lumo-diagnostics-and-tooling` and
its check-runtime-drift script.

> **Trap: stale runtime drift.** An installed app once showed an old
> pack/runtimeHash *mid-demo* because apply, build, and install had drifted
> apart. Lesson: never demo from an un-applied or stale pack — re-apply and
> confirm runtimeHash plus rendered-source agreement as the
> last step before presenting. The hash check takes ten seconds; the on-stage
> surprise does not.

## 7. Content Cards or IAM not showing

Cards route into UI surfaces by an exact **placement** string: the Braze
dashboard key/value pair `placement` on the card must equal the pack surface's
`placement` (Android defaults a card with no `placement` extra to `inbox`;
web filters with strict string equality — `cardsForPlacement` in
`web-template/src/braze/BrazeBridgeProvider.tsx`).

| Observation | Most likely cause | Discriminating experiment | Fix / route |
|---|---|---|---|
| Card visible in Braze dashboard, drawer log says `Content Cards updated: N` with N>0, but the surface is empty | Placement string mismatch pack↔dashboard | Compare the card's `placement` key/value in the dashboard with the pack's `contentCardSurfaces[].placement` / `contentCardRail.placement` — must match character-for-character | Fix whichever side is wrong; placement design → `lumo-demo-pack-authoring` |
| Drawer log: `Content Cards updated: 0` | Card filtered before reaching the web: the Android shell drops control-variant, removed, and dismissed cards; or the card targets a different user | Check the drawer `External ID:` — is the card's segment matching *that* user? Was the card dismissed earlier in the session? | Send to the active external ID; re-send a fresh (non-dismissed) card |
| Cards show in the **browser** but not the shell (or vice versa) | The browser runs the harness bridge and shows **local fixtures only** (`web-template/src/harness/fixtures.ts`) — real Braze cards require a shell | Browser console shows `[harness] …` lines ⇒ you are not looking at real data | Judge Content Cards only in the Android/iOS shell |
| Cards arrive late / only after reopening | Refresh never requested since the send | Drawer **Cards** button (or Control Room card-refresh action) forces `requestContentCardsRefresh`; the web also requests one automatically at handshake | Use the refresh button during demos after sending |
| A whole surface is missing, not empty | Surface `emptyBehavior: "hide"` — zero cards removes the section entirely | Check the surface definition in the pack | Expected behavior; send a matching card or set `emptyBehavior: "empty-state"` |

**IAM (in-app messages) not showing:**

| Observation | Cause | Fix |
|---|---|---|
| IAM never triggers | IAM manager registers on activity resume — drawer log should say `IAM manager registered.`; if it says `IAM manager registration failed: …` read that error | Relaunch the app; if triggered by an event, fire it via the drawer **IAM Event** button (logs `demo_iam_trigger`) and confirm the campaign triggers on that event |
| First IAM shows, rapid re-trigger doesn't | The shell sets a 5-second minimum interval between trigger actions (`com_braze_trigger_action_minimum_time_interval_seconds` = 5) | Wait 5+ seconds between triggers when rehearsing |
| IAM appears but images/media are blank | Trust failure — IAM media loads from `braze-images.com` | Run **Verify Android HTTPS trust** (section 1, row 1); this was the original Zscaler trap |

## 8. Control Room quirks

| Observation | Cause | What to do |
|---|---|---|
| Control Room not at `http://127.0.0.1:4177` | Port auto-increments when 4177 is busy (up to +20); launcher logs `Port 4177 is in use; using 4178.` With an explicit `PORT`/`--port` it instead errors: `Port <n> is already in use. Stop the existing process or choose --port <port>.` | Always open the URL the launcher actually printed |
| Device panel stuck on `Launch the selected app and wait for native runtime telemetry.` even though the app is clearly running | Device telemetry is **silently lost** when the baked-in `callbackUrl` is unreachable: the shells post to `http://10.0.2.2:<port>/api/device-events` (Android) / `http://localhost:<port>/api/device-events` (iOS) with a 1.5s timeout, and failures are only debug-logged, never surfaced. Classic trigger: the launcher restarted on an auto-incremented port, but the installed app still carries the old port from build time | Relaunch through the Control Room **Launch** button — it re-applies the pack with the *current* callback URL and rebuilds/reinstalls |
| Android launch job ends **Failed** at step `Waiting for Android trust telemetry`, error `Native Android trust diagnostics did not report before launch readiness timeout.` | The launcher waits up to 15s (`BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS`, default 15000) for on-device trust telemetry, then writes a **synthetic** `trust_diagnostics` error entry (`Android HTTPS trust diagnostics timed out`). The emulator and app were already installed and launched by then — the app may be perfectly fine, its telemetry just never arrived (often the lost-callback row above) | Check the app directly (drawer). If trust actually passes there, fix the callback path (row above); the synthetic entry clears when real telemetry lands. Run the **Verify Android HTTPS trust** preset to force a fresh report |
| Activity looks duplicated | Device and bridge telemetry repeated the same exact/correlated evidence inside one session | Expected duplicates merge into one row with a count. If separate rows remain, compare correlation IDs and payloads before treating them as the same action |
| Need a clean rehearsal feed | Old sessions make the story hard to read | Filter to **Current session**, or use **Clear**; Clear archives first and creates a new session boundary |
| Need to share diagnostics | Raw state/logs may contain keys, tokens, identifiers, or private pack metadata | Use Help & Troubleshooting → **Download redacted bundle** (`GET /api/diagnostics/bundle`), never send raw `.demo-launcher/state.json` |

## When NOT to use this skill

- **The environment never worked on this machine** (fresh Mac, missing SDK/JDK/
  xcodegen, doctor failures) → `lumo-build-and-env`.
- **Full Android push bring-up** for a teammate/workspace (service account,
  keys, end-to-end verified push) → `lumo-push-readiness-campaign`.
- **Reading/interpreting the instruments** (doctor, validate, Control Room
  diagnostics panels, drift scripts) when nothing is known-broken →
  `lumo-diagnostics-and-tooling`.
- **Pack schema and authoring questions** (fields, placements, presets) →
  `lumo-demo-pack-authoring`.
- **How the Braze SDK/REST/token machinery works** conceptually →
  `braze-integration-reference`.
- **Normal operation** (run a demo, trigger campaigns) → `lumo-run-and-operate`.
- **Building/altering demo stories** (screens, pack content) → the
  `braze-demo-builder` plugin / `braze-demo-app-builder` skill.

## Open questions / candidates

- `demo-studio/` is a prebuilt Electron artifact (dist only, no source) —
  experimental; not covered by this playbook and not a supported debug surface.
- iOS bundled web assets ("M2") would remove the section-3 dev-server dependency;
  until it lands, the Vite requirement stands.

## Provenance and maintenance

Verified 2026-07-03 against repo sources (not docs alone):
`android-shell/app/src/main/java/com/braze/demoshell/{MainActivity,DemoApplication,CredentialStore}.kt`,
`android-shell/app/build.gradle.kts`,
`android-shell/tools/{provision-demo-avd,run-demo-emulator}.sh`,
`ios-shell/Sources/WebViewController.swift`, `ios-shell/project.yml`, `ios-shell/README.md`,
`tools/{demo-pack-utils,demo-launcher,validate-demo-runtime}.mjs`,
`web-template/src/braze/{bridge.ts,BrazeBridgeProvider.tsx}`,
`web-template/src/components/ContentCardSlot.tsx`.

Re-verification one-liners for facts that may drift:

- FCM retry count/backoff: `grep -n "FCM_TOKEN_RETRY_DELAYS_MS\|FCM_TOKEN_MAX_RETRIES" android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`
- Trust smoke URLs: `grep -n "braze-images.com\|firebaseinstallations" android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`
- Silent-no-SDK leniency: `grep -n "Braze API key/endpoint missing" android-shell/app/src/main/java/com/braze/demoshell/DemoApplication.kt`
- Gradle preBuild gate messages: `grep -n "Apply a demo pack\|does not match selected" android-shell/app/build.gradle.kts`
- AVD default / Play-image rejection / RECREATE_AVD: `grep -n "Braze_Demo_API_36\|Refusing Google Play\|RECREATE_AVD" android-shell/tools/*.sh`
- Emulator log path: `grep -rn "lumo-demo-emulator.log" android-shell/tools/run-demo-emulator.sh`
- iOS SDK pin: `grep -n "from:" ios-shell/project.yml`
- iOS load-failure line: `grep -n "load failed" ios-shell/Sources/WebViewController.swift`
- Pack apply error strings: `grep -n "not found\|kebab-case\|missing required" tools/demo-pack-utils.mjs`
- Port default / auto-increment / trust timeout: `grep -n "4177\|findAvailablePort\|trustDiagnosticsTimeoutMs" tools/demo-launcher.mjs`
- Card filtering + placement default: `grep -n "isControl\|placement" android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`
- npm script names: `python3 -c "import json;print(list(json.load(open('package.json'))['scripts']))"`
