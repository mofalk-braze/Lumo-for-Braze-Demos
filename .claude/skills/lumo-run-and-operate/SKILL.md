---
name: lumo-run-and-operate
description: >-
  Run Lumo Braze demos end to end as a presenter/operator — start the Control
  Room cockpit, apply and switch demo packs, launch the Android emulator or iOS
  simulator shell, change the active user, fire SDK events, trigger campaigns
  and Canvases, and send safe host-side Braze REST calls. Use when someone says
  "run the demo", "start the cockpit", "open the Control Room", "launch
  Android", "launch iOS", "apply a pack", "switch pack", "trigger a campaign",
  "trigger a Canvas", "send an event", "log a purchase", "change the active
  user", "verify the user profile", "I'm presenting in an hour", "why is this
  control disabled/blocked", or asks what lumo:cockpit / lumo:apply /
  lumo:launch:android do. Assumes the environment already works — this is the
  operating runbook, not setup or debugging.
---

# Lumo Run and Operate

Runbook for driving a live demo from the **Control Room** (the local web UI
served by `tools/demo-launcher.mjs`) — the ONLY presenter/operator surface.
The app on the device stays product-focused; everything you do as an operator
happens here or via the CLI equivalents below.

Assumptions: environment is healthy (`npm run lumo:doctor` passes), a demo
pack exists, and secrets are configured. If not, stop and use
`lumo-build-and-env` (setup) or `lumo-debugging-playbook` (broken runs).

## 1. Start the Control Room

From the repo root:

```sh
npm run lumo:cockpit
```

Expected output (the URL banner):

```
Braze Demo Control Room running at http://127.0.0.1:4177
Android telemetry callback: http://10.0.2.2:4177/api/device-events
Press Ctrl+C to stop.
```

Open the printed URL in your browser. Port rules (verified in
`tools/demo-launcher.mjs` `parseArgs`/`findAvailablePort`):

| You ran | Port behavior |
|---|---|
| `npm run lumo:cockpit` | Starts at 4177; if busy, auto-increments up to +20 and prints `Port 4177 is in use; using 4178.` |
| `node tools/demo-launcher.mjs --port 5000` | Strict: fails if 5000 is busy |
| `PORT=5000 npm run lumo:cockpit` | Also strict — a PORT env var counts as explicit |

If you see `Port X is already in use` → another cockpit is probably running;
reuse it or stop it rather than stacking servers.

## 2. Control Room tour

Five sections in the left sidebar (source: `tools/control-room-template.mjs`),
plus a **Present** toggle in the top bar that hides all operator panels and
shows only Story Controls + Activity Feed for screen-sharing.

### 01 Demo Cockpit

- **Setup panel**: demo pack selector, platform (Android/iOS), **External
  user ID** and **Display name** for the active demo user, and a collapsible
  "SDK and REST configuration" editor with Braze cluster presets (US-01…US-08,
  US-10, EU-01/02, AU-01, ID-01, JP-01, KR-01 — no US-09; fills SDK + REST
  endpoints).
  Buttons: **Save** (persist selection), **Apply user** (push identity to the
  device), **Create user** (generate a fresh external ID and apply it),
  **Apply pack** (apply-only, no build), **Launch** (full
  apply → build → install → launch), **Verify** (export the active user
  profile via REST).
- **Readiness panel**: seven live checks — Demo, Braze, Device, Trust, Push,
  User, Story — each with an observable level and a next step. The top bar
  shows `Ready` or `N blockers`.
- **Story Controls**: the pinned/ready controls for the live walkthrough.
- **Custom REST Control**: run or stage a safe ad-hoc Braze REST call.
- **Activity Feed** (latest few entries; full feed is section 02).

### 02 Activity Feed

Audience-readable proof of what happened: SDK events, attributes, purchases,
user changes, REST sends, campaign/Canvas triggers, profile exports, Content
Card interactions, push previews, and launch outcomes. Filters: free-text
search, severity (`success`/`error`/`warning`/`info`), category, and current
session. Launcher start and clear operations add visible session boundaries.
Exact or correlated telemetry repeated inside the dedupe window merges into
one row with a duplicate count instead of flooding the story.

Use **Archive** to download a redacted JSON copy and retain a local archive.
Use **Clear** only when you want a clean rehearsal: it archives first, clears
REST response history, and starts a new session. Category values are
(`launcher`, `sdk`, `rest`, `message`, `profile`, `content_cards`, `push`,
`diagnostics`, `error`). Rows are strictly newest-first; the ledger is capped
at **240 entries** (`tools/demo-launcher.mjs`, `activityLedgerLimit`).

What does NOT belong here: bridge handshakes, runtime-ready reports, FCM token
registration chatter, trust diagnostics, raw device commands. Those are
filtered to **Diagnostics → Debug Events** (`diagnosticsOnlyTypes` in the
template). If you expect a row in the feed and don't see it → check Debug
Events before assuming the action failed. Full type/category tables:
`references/control-room-reference.md`.

### 03 Control Templates

Every runnable control in one overview: built-in standard templates (change
user, log event/attribute/purchase, IAM trigger, Content Cards refresh, push
permission/readiness, trust check, foreground push preview, navigate, REST
templates, campaign/Canvas trigger, profile export, custom REST), plus the
active pack's `launcher.presets` library, plus your staged controls.

- **Tailor** any control → creates an editable **staged** copy in the embedded
  editor (label, action type, transport, platform, payload JSON, live payload
  preview, validation chip). Staged controls are per-pack and live in launcher
  state, not in the pack file.
- **Pin** puts a control in Story Controls; **hide** removes it from view;
  **lock** prevents accidental edits mid-demo.
- **Promote** writes a staged control into the pack's `demo-pack.json` under
  `launcher.presets` — this is the only Control Room action that edits a pack
  file. Promote only repeatable, brand-appropriate structures.
- Mark campaign/Canvas controls that send push with **"Require native push
  token before running"** so readiness gating protects them.

### 04 Pack Manager

Create a clean local starter pack or duplicate an existing pack into ignored
`.demo-packs/`. Both operations generate `notes.md`; duplicate copies portable
assets and app-source but deliberately excludes credentials, local state, and
the source notes. The library shows committed/local source, configHash,
runtimeHash, notes presence, validation errors, and warnings. Use **Open pack**,
**Open config**, or **Open notes** to hand authoring back to the source files.

The safe sequence shown in the UI is: create → complete dashboard mappings in
`notes.md` → validate → apply → launch Android in bundled mode. Pack Manager
does not apply a pack or put secrets into it.

### 05 Diagnostics

- **Guided Troubleshooting**: evidence-backed cards for launch, selected-pack
  credentials, runtime identity, rendered source, Android trust/clock, push,
  and active persona. Each card states the observation, safest next step, and
  an agent-readable hint.
- **Download redacted bundle**: downloads `GET /api/diagnostics/bundle` with
  credentials, tokens, personal identifiers, private-pack names, and
  user-specific filesystem paths removed.
- **Runtime Contract**: expected pack `id`, `configHash` (fingerprint of the
  applied public config), `runtimeHash` v2, source mode, and expected render
  sources per platform.
- **Device Identity**: last native runtime report — SDK device ID, reported
  pack/hash/source/user, plus push-token and trust telemetry.
- **Launcher Logs**: live job output (apply/build/install/launch).
- **Debug Events**: the non-audience telemetry stream.
- **REST Responses**: history of Braze REST responses, capped at **40**,
  secrets redacted.

## 3. Applying packs

A **demo pack** (`demo-pack.json` + assets) is the source of truth. Applying
it regenerates six runtime artifacts across web, Android, and iOS (activeDemoConfig,
demo-runtime.json, synced assets, Android seed metadata, iOS runtime
defaults, the active-pack marker) — full table:
`lumo-demo-pack-authoring/references/pack-schema.md`. Never hand-edit these;
change the pack and re-apply. CLI equivalents:

```sh
npm run lumo:apply                                  # apply the lumo-default pack
node tools/demo-launcher.mjs --pack <id> --apply-only   # apply any pack
node tools/demo-launcher.mjs --list                 # list packs (JSON)
```

Expected apply output ends with `Applied demo pack: <Pack Name>`. Note:
`--pack <id>` without `--apply-only` or `--run` applies AND builds web assets,
then stops at `Built`.

### The stale-pack rule (non-negotiable)

**Never demo from an un-applied or stale pack.** After editing a pack, or when
in doubt: re-apply, relaunch or wait for the app handshake, and confirm the
Device readiness check is green. The Control Room enforces this — live
controls are **disabled** until the selected platform's app echoes back the
expected pack id, `runtimeHash`, canonical rendered source, selected-pack
credential context, and applied External User ID
(`runtimeBlockReason`/`identityBlockReason` in the template; documented in
`docs/demo-runtime-architecture.md`). Hover a disabled control to see the
exact blocking reason.

| You see | It means | Do |
|---|---|---|
| `Launch the selected app and wait for native runtime telemetry.` | App not running or hasn't reported yet | Launch, or open the app and wait a few seconds |
| `android reported hash X, expected Y.` | Installed app has a stale pack build | Relaunch (full build/install), don't present |
| `android reported user A, expected B.` | Device still on the old user | Click **Apply user**, wait for the echo |
| `Apply this user before running demo controls.` | You typed a new external ID but didn't apply it | Click **Apply user** |

Verify pack/hash agreement from the CLI at any time:

```sh
npm run validate:demo-runtime
```

## 4. Launching devices

### Android

Keep the persistent Control Room running, pick **Android**, and click
**Launch**. The canonical agent-oriented CLI is:

```sh
node tools/lumo.mjs android setup
node tools/lumo.mjs android doctor
node tools/lumo.mjs android start --pack lumo-default
node tools/lumo.mjs android status
node tools/lumo.mjs android stop
```

Use `--avd <name>` only for an intentional AVD override on `android start`.
The npm `lumo:launch:android` alias targets `lumo-default`, but agents should
prefer the explicit command above so pack and authority ownership stay clear.

Job steps you'll see in Launcher Logs (from `runApplyBuildLaunch`):
`Applying demo pack` → `Preparing web assets` → `Refreshing Android package`
(`./gradlew :app:validateDemoWebAssets :app:assembleDebug`) → either `Starting
emulator and refreshing app` or `Reusing emulator and installed app` →
`Ensuring launcher-owned Android clock coverage` → `Applying runtime identity`
→ runtime/render/trust proof → `Ready`.

The emulator step runs `android-shell/tools/run-demo-emulator.sh`, which:

1. Reuses one already-running, healthy instance of the expected AVD (default
   `Braze_Demo_API_36`) without stopping or rebooting it. With no connected
   device it cold-starts that AVD once with `-writable-system`; a wrong,
   offline, physical, or additional device fails closed instead of guessing.
2. Proves boot, activity-manager readiness, the non-secure Swipe keyguard,
   lock-screen notification settings, and unlocked user state; then
   force-stops the previous app before preparation.
3. With `TRUST_MODE=auto`, probes the Zscaler system + Conscrypt stores and
   HTTPS. Healthy trust causes no remount/restart. A cold boot with healthy
   persistent system trust restores only the volatile Conscrypt mount and
   restarts the framework once. Missing/broken persistent trust fails with an
   explicit `TRUST_MODE=repair` remediation instead of silently mutating it.
4. Installs only the prebuilt APK supplied by the launcher, and only when its
   hash differs, using one `adb install -r`. App data and SDK identity are
   preserved. `RESET_APP_DATA=1` is explicit destructive recovery only.
5. Runs one foreground clock check, launches the installed app, and returns.
   The persistent launcher authority—not this wrapper—owns continuous clock
   coverage, telemetry, and the remaining runtime/render/trust proof.

After launch, the launcher applies identity (changeUser + Content Cards
refresh + trust + push readiness commands via adb intent) and waits up to 15 s
(`BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS`) for trust telemetry. A trust
timeout fails the job — that's a signal, not noise.

### iOS

**The iOS shell requires the Vite dev server to be running — the launcher
does not start it for you.** Verified: `runIosBuildInstallLaunch` in
`tools/demo-launcher.mjs` only runs xcodegen/xcodebuild/simctl; the shell
loads its web content from `http://localhost:5173`
(`ios-shell/Sources/Config.swift`, `ios-shell/README.md`). Before launching:

```sh
cd web-template && npm run dev     # keep this terminal running (port 5173)
```

Then Control Room → platform **iOS** → **Launch**. Job steps: `Generating iOS
project` (xcodegen, if `ios-shell/project.yml` exists) → `Building iOS
simulator app` (xcodebuild, scheme `BrazeDemoShell`, default simulator
`iPhone 17`, `CODE_SIGNING_ALLOWED=NO`) → `Booting iOS simulator` →
`Installing iOS app` → `Launching iOS app` (bundle id `com.braze.masquerade`)
→ identity apply. If the simulator shows a blank/failed WebView → Vite isn't
running. Unsigned simulator builds support everything **except real push**
(APNs needs an org-signed build). There is no `npm run lumo:launch:ios`
script — use the Control Room.

## 5. Safe host-side REST

REST-transport controls run from the launcher process (never the device) and
are deliberately caged (`validateBrazeRestRequest` in `demo-launcher.mjs`).
Endpoints used by presets: `/users/track` (events, attributes, purchases),
`/campaigns/trigger/send`, `/canvas/trigger/send`, `/users/export/ids`, plus
validated custom requests. The three rails a presenter actually runs into
live: **DELETE is always blocked**, **`broadcast: true` is always blocked**,
and campaign/Canvas triggers **must include explicit `recipients`** (presets
always target the active user, so this only bites hand-built custom
requests). Full guard table (methods, destructive-path blocklist, size cap,
redaction): `braze-integration-reference` §6. Blocked calls fail with the
validation error in the Activity Feed — nothing is sent.

**REST key entry**: session key typed into Cockpit → "SDK and REST
configuration" → REST API key ("Session only, never saved") wins first; the
Control Room never persists it to disk. Full resolution order (env var
names, legacy fallback): `lumo-config-and-flags` §2. For env-based keys,
export before `npm run lumo:cockpit`. The credential chip shows which source
is active (`session` / `pack env` / `global env` / `legacy ignored`). Key
conventions and handoff: `lumo-secrets-and-sanitization`.

## 6. Where output and state land

| Thing | Location |
|---|---|
| Launcher state (active pack/user/platform, staged controls per pack, ledger, push/trust telemetry, REST history) | `.demo-launcher/state.json` |
| Redacted Activity Feed archives | `.demo-launcher/activity-archives/` (mode 0600) |
| Emulator boot/system log | `/tmp/lumo-demo-emulator.log` |
| Apply/build/launch job logs | Control Room → Diagnostics → Launcher Logs (in-memory, last 10 jobs; gone on restart) |
| Device → launcher telemetry | Android posts to `http://10.0.2.2:<port>/api/device-events` (emulator's alias for the host); iOS simulator posts to `http://localhost:<port>/api/device-events` |
| REST response history | Control Room → Diagnostics → REST Responses (cap 40, redacted) |
| Redacted support bundle | Control Room → Diagnostics → **Download redacted bundle**, or `GET /api/diagnostics/bundle` |

`.demo-launcher/state.json` is a safe cache — deleting it resets cockpit
selections and staged controls but touches nothing on the device or in packs.

## 7. Operator etiquette (the unwritten rules)

1. **Never reset app data casually.** `RESET_APP_DATA=1` (Android) or erasing
   the simulator destroys the Braze SDK device identity and push-token
   continuity — the device becomes a new install in Braze. Use only as a
   deliberate, explicit recovery for a broken SDK identity, never as a
   pre-demo "cleanup".
2. **Identity changes go through the Control Room** (Apply user / Create
   user), never by hand-editing files or in-app hacks. That keeps the
   launcher, SDK, and readiness gating in agreement.
3. **Never demo stale** — re-apply and confirm runtimeHash plus rendered-source agreement before
   presenting (§3).
4. **Don't edit generated files**, even for a quick tweak mid-prep. Change
   the pack, re-apply.
5. Use **Present** mode when screen-sharing: operator panels hide, staged
   payloads and credentials chips disappear from view.
6. Pre-demo check, in order: cockpit up → pack applied → device launched →
   Readiness panel all green (Demo, Braze, Device, Trust, Push, User, Story) →
   run **Verify** once and confirm the profile export succeeds.

## When NOT to use this skill

- Environment doesn't exist or doctor/bootstrap fails → `lumo-build-and-env`.
- Something is failing mid-run (trust errors, push not arriving, hash
  mismatch you can't clear) → `lumo-debugging-playbook`; interpretation of
  doctor/validate output → `lumo-diagnostics-and-tooling`.
- Creating or editing demo packs, screens, presets-as-content →
  `lumo-demo-pack-authoring` (pack anatomy) or the build tooling covered in
  `lumo-plugin-workflow` / the `braze-demo-app-builder` skill.
- Getting push working on a fresh teammate machine end to end →
  `lumo-push-readiness-campaign`; how the SDK/push/token plumbing works →
  `braze-integration-reference`.
- Full config axis reference (every flag, env var, properties key) →
  `lumo-config-and-flags`.
- Secrets handling and handoff → `lumo-secrets-and-sanitization`.

## Reference

Full built-in control catalog, action-type/transport matrix, activity
categories, readiness checks, and launcher HTTP API:
`references/control-room-reference.md`.

## Provenance and maintenance

Verified 2026-08-14 against `tools/lumo.mjs`, `tools/lumo-android-cli.mjs`,
`tools/demo-launcher.mjs`,
`tools/control-room-template.mjs`, `tools/demo-pack-utils.mjs`,
`package.json`, `docs/demo-runtime-architecture.md`,
`android-shell/tools/run-demo-emulator.sh`,
`android-shell/tools/install-zscaler-system-ca.sh`, `ios-shell/README.md`,
`ios-shell/Sources/Config.swift`.

Re-verification one-liners for facts that may drift:

```sh
npm run                                                    # script names still lumo:cockpit / lumo:apply / lumo:launch:android
grep -n "4177\|findAvailablePort" tools/demo-launcher.mjs   # default port + auto-increment rule
grep -n "activityLedgerLimit\|slice(0, 40)" tools/demo-launcher.mjs  # ledger/REST caps
grep -n "blockedPatterns\|DELETE requests" tools/demo-launcher.mjs  # REST safety rails
grep -n "BRAZE_REST_API_KEY" tools/demo-launcher.mjs        # key resolution order
grep -n "runIosBuildInstallLaunch\|localhost:5173" tools/demo-launcher.mjs docs/demo-runtime-architecture.md  # iOS Vite requirement
grep -n "RESET_APP_DATA\|lumo-demo-emulator.log\|Braze_Demo_API_36" android-shell/tools/run-demo-emulator.sh
```

### Open questions / candidates

- `demo-studio/` (prebuilt Electron artifact) is experimental and NOT a
  supported operating surface; the Control Room remains the only presenter
  surface.
- iOS bundled web assets are planned (M2); until then the Vite dev-server
  requirement in §4 stands.
