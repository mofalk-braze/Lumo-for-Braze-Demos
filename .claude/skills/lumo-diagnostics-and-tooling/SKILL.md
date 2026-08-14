---
name: lumo-diagnostics-and-tooling
description: >-
  The measurement layer for the Lumo Braze Demo Shells repo — how to check
  health with instruments instead of eyeballing: npm run doctor, lumo:apply,
  validate:demo-runtime, security:scan, public:check, the Control Room
  Diagnostics view, the Android on-device debug drawer, and the bundled
  check-runtime-drift.mjs script, each with an output interpretation guide.
  Use when someone says "diagnose", "is it healthy", "check status", "doctor
  output", "what does this doctor line mean", "validate failed",
  "configHash mismatch", "drift", "stale pack", "stale runtime", "is the pack
  applied", "push token status", "tokenPresent", "trust telemetry",
  "diagnostics drawer", "long-press", "where are the logs", "emulator log",
  "state.json", "REST response history", or wants to MEASURE what the demo
  stack is actually doing before or during a session. Also use before any
  demo to confirm nothing is stale.
---

# Lumo Diagnostics and Tooling

How to measure the health of this repo instead of guessing. Every instrument
below is read-only or regenerates only derived files. For each one: what it
checks, how to run it, how to read the output, and what to do next.

Jargon used throughout: a **pack** is a demo definition (`demo-pack.json` +
assets) that is the source of truth; **applying** a pack regenerates runtime
files from it; the **configHash** is a short fingerprint of the pack content
stamped into every generated file so staleness is detectable; the **Control
Room** is the local web cockpit at `http://127.0.0.1:4177` started by
`npm run lumo:cockpit`; the **bridge** is the JavaScript channel between the
embedded web app and the native shell; an **FCM token** is the per-install
Android push address; an **AVD** is the Android emulator device definition.

## Instrument index

| Question | Instrument | Command |
|---|---|---|
| Is my machine set up? | Doctor | `npm run doctor` |
| Is the runtime freshly generated from the pack? | Apply | `npm run lumo:apply` |
| Do all generated/built artifacts agree? | Runtime validator | `npm run validate:demo-runtime` |
| Did a credential leak into the tree? | Secret scan | `npm run security:scan` |
| Is the repo safe to publish/push? | Public readiness | `npm run public:check` |
| Same two, batched (commit gate) | Precommit | `npm run check:precommit` |
| Which pack/hash is in each location right now? | Drift script | `node .claude/skills/lumo-diagnostics-and-tooling/scripts/check-runtime-drift.mjs` |
| What is the live device actually reporting? | Control Room → Diagnostics | `npm run lumo:cockpit`, view 05 |
| What does the Android app itself think? | On-device debug drawer | long-press the app's WebView |

Note: `check:precommit` runs capability tests, runtime validation, the secret
scan, and the agent-skill distribution check; it does NOT include
`public:check` — run that separately before any commit (see
`lumo-change-control-and-qa` for the full gate list).

## 1. `npm run doctor` — environment health

Source: `tools/doctor-solcon.mjs` (aliases: `bootstrap:check`, `lumo:doctor`,
and `./bootstrap-lumo.sh --check`). Read-only; safe to run any time.

It prints two blocks. First the capability summary:

```
SolCon capability status
- Web shell: ready
- Android shell: ready after pack apply/build
- Android push: client config ready; requires local Braze SDK credentials and Braze-side Firebase setup
- iOS shell: ready for unsigned simulator builds
- iOS push: pending Apple Developer team signing / APNs setup
```

Read these as "which demo surfaces this machine can serve." `blocked` on a
line means at least one of the checks it depends on failed. `iOS push:
pending ...` is hardcoded and expected — iOS push is not yet supported.

Then the check table, one line per check, remediation indented under any
non-pass:

```
Checks
[PASS] Host platform - Apple Silicon macOS
[WARN] Dedicated Android AVD - Braze_Demo_API_36 not found.
      ./bootstrap-solcon.sh --android-avd
[FAIL] Java - Missing java.
      Install Java 17: brew install openjdk@17.
```

Exit-code semantics: **any FAIL → exit 1**; WARN-only runs exit 0. So in
scripts/agents, `npm run doctor && ...` gates on hard failures only — read
the WARN lines yourself.

| Status | Meaning | Do next |
|---|---|---|
| PASS | Verified working, detail shows what was found | Nothing |
| WARN | Degraded but launchable (e.g. AVD missing, Zscaler CA absent, runtime not yet generated) | Follow the printed remediation before the affected feature is needed |
| FAIL | A required tool/config is missing; capability lines above will show `blocked` | Follow the printed remediation, re-run doctor |

Checks covered (in order): Host platform (Apple Silicon macOS required),
Homebrew, Node/npm, Java (17+), Xcode command line tools, Xcode first
launch/license, xcodegen, iOS simulator runtime, Android SDK directory,
sdkmanager, avdmanager, adb, Android emulator, Dedicated Android AVD
(`Braze_Demo_API_36`, override with `BRAZE_DEMO_ANDROID_AVD`), Zscaler root
CA in the macOS System keychain, Firebase client config
(`android-shell/app/google-services.json` must contain package
`com.braze.demoshell`; project `braze-sc-demo-shell` expected), Web
dependencies (`web-template/node_modules`), Generated demo runtime
(apply artifacts present).

For fixing a failed environment check, see `lumo-build-and-env`.

## 2. `npm run lumo:apply` — regenerate the runtime from the pack

Runs `node tools/demo-launcher.mjs --pack lumo-default --apply-only`.
Success output is short:

```
Applied demo pack: Lumo
```

(Exit code 0. On failure the job log is printed and the exit code is 1.)

One apply regenerates six artifacts across web, Android, and iOS (synced
assets, the runtime manifest, the generated web config, the active-pack
marker, Android seed metadata, iOS runtime defaults) — full table with exact
file contents: `lumo-demo-pack-authoring/references/pack-schema.md` (verified
against `tools/demo-pack-utils.mjs` `applyDemoPack`). Never hand-edit any of
them.

How to CONFIRM an apply took, instead of trusting the one-liner:

```sh
node .claude/skills/lumo-diagnostics-and-tooling/scripts/check-runtime-drift.mjs
npm run validate:demo-runtime
```

Both must agree on one pack id, `configHash`, and `runtimeHash`. Owner rule:
never demo from an un-applied/stale pack — re-apply and confirm deployment hash
plus rendered-source agreement before presenting.

## 3. `npm run validate:demo-runtime` — artifact agreement

Source: `tools/validate-demo-runtime.mjs`. Read-only. Success output:

```
Demo runtime validation passed.
```

Failures print `error: ...` lines and exit 1; warnings print `warning: ...`
and do not fail the run. Validation groups, in execution order:

1. **Pack schema** — every pack under `demo-packs/` and `.demo-packs/` has
   id/name/description/brand/content, kebab-case unique ids.
2. **google-services.json shape** — present, valid JSON, right package, no
   service-account material.
3. **Generated runtime agreement** — marker, generated config, manifest, the
   Android seed, and iOS defaults match the active pack's freshly recomputed
   `configHash` and `runtimeHash` v2.
4. **Built outputs agreement** — built web dist and packaged Android assets
   carry the same id/configHash/runtimeHash and only active-pack assets.
5. **Bridge contract source patterns** — greps web/Android/iOS/launcher
   sources for required code patterns (the sync protocol, telemetry hooks,
   trust-CA installer safeguards, Control Room UI contracts).

Most common failure messages verbatim, and what they actually mean:

| Message (verbatim) | Meaning | Do next |
|---|---|---|
| `Generated config configHash: expected <X>, got <Y>` | Stale apply: the pack changed after the last apply | `npm run lumo:apply`, re-validate |
| `Runtime manifest configHash: expected <X>, got <Y>` | Same stale-apply condition, seen in `public/demo-runtime.json` | `npm run lumo:apply` |
| `Missing generated web config. Apply a demo pack first.` / `Missing public/demo-runtime.json. Apply a demo pack first.` | Fresh clone or cleaned tree; no apply has run | `npm run lumo:apply` |
| `Missing android-shell/.active-demo-pack marker.` | Apply never ran (or marker deleted) | `npm run lumo:apply` |
| `Android seed demo.packId: expected <X>, got <Y>` (also `demo.configHash`, `demo.androidUrl`, `demo.webDist`) | `android-shell/local.properties` seed is from an older apply or was hand-edited | `npm run lumo:apply`; never hand-edit generated keys |
| `web-template/dist runtime configHash: expected <X>, got <Y>` | The BUILT web app is older than the applied pack — a demo from this dist shows stale content | `cd web-template && npm run build` |
| `Android packaged runtime configHash: expected <X>, got <Y>` | The assets packaged into the Android APK build dir are stale — the installed app will show an old pack | Relaunch via Control Room (rebuilds), or `cd android-shell && ./gradlew :app:assembleDebug` |
| `Active web dist is missing index.html: <dir>` | Pack points at a web dist that was never built | Build the web app or fix `web.distDir` in the pack |
| `iOS Config.swift demoConfigHash does not match the active pack.` (also `demoPackId`, `still references localhost:5174`) | iOS runtime defaults are stale | `npm run lumo:apply` (upserts Config.swift when present) |
| `<pack-id> must be kebab-case` / `Duplicate demo pack id: <id>` / `<id> is missing required field: <key>` | Pack authoring error | See `lumo-demo-pack-authoring` |
| `android-shell/app/google-services.json must contain Android package com.braze.demoshell. Found: ...` | Wrong Firebase client config committed | Restore the shared Lumo client config |
| `android-shell/app/google-services.json appears to contain service-account material. ...` | Someone pasted a Firebase SERVICE ACCOUNT (secret) where the public CLIENT config belongs | Remove immediately; see `lumo-secrets-and-sanitization` |
| `Bridge sync contract file missing: <path>` / `<label>: missing <regex>` | A source file was deleted/refactored and no longer carries a required contract pattern | This is a code regression, not staleness — see `lumo-architecture-contract` before "fixing" the validator |
| `<label>: identity sync path must not lowercase external IDs` / `Direct bridge.changeUser calls outside BrazeBridgeProvider: <files>` | A code change violated the identity-sync invariant | Revert/fix the code; the rule is load-bearing (`lumo-architecture-contract`) |
| `warning: Old generated Android lumoWeb assets still exist; they are no longer used and will be ignored.` | Leftover legacy build dir (`android-shell/app/build/generated/assets/lumoWeb/`) | Optional cleanup; harmless |

Rule of thumb: hash/id disagreements → re-apply (and rebuild if the mismatch
is in `dist`/packaged assets); missing-pattern failures → a code change broke
a contract, do not paper over it.

## 4. `npm run security:scan` and `npm run public:check`

`security:scan` (`tools/secret-scan.mjs`) hunts for credential material in
the working tree: it first runs an installed `gitleaks` (else `trufflehog`,
else neither, just a warning) as a supplemental external pass, then **always**
also runs its own built-in lightweight detectors — private key blocks, bearer
tokens, Braze REST/SDK key assignments, and credential-shaped filenames —
regardless of whether an external scanner ran, while skipping the known
local-only credential files (`android-shell/local.properties`,
`secrets.properties`, `ios-shell/Sources/Config.swift`, `.demo-packs/`,
`.env*`). Success prints
`Secret scan passed.`; findings print `- <file>:<line> <detector name>` and
exit 1. A finding means "this looks like a secret in a file that could be
committed" — remove or relocate the value, don't allowlist around it.

`public:check` (`tools/public-readiness-check.mjs`) answers "is the repo safe
to publish?": it re-runs `validate:demo-runtime` and `security:scan`, then
additionally checks git-tracked paths for sensitive filenames, scans tracked
file CONTENT for key assignments, flags sensitive UNTRACKED files that are
visible to git (not ignored), and asserts `.demo-packs/` is git-ignored.
Failures print `Public readiness check failed:` with a bullet list, exit 1;
success prints `Public readiness check passed.`. For the policy behind both
(what may be committed, handoff protocol, incident response), see
`lumo-secrets-and-sanitization`.

## 5. Control Room Diagnostics view (live device truth)

Start the Control Room (`npm run lumo:cockpit`, prints
`Braze Demo Control Room running at http://127.0.0.1:<port>`), open it, and
click **05 Diagnostics** in the left nav. Start with:

- **Guided Troubleshooting** — cards derived from current blockers and native
  evidence for Android launch, selected-pack credentials, runtime identity,
  rendered source, trust/clock, push, and persona. Each card includes one safe
  next action and an agent-readable hint.
- **Download redacted bundle** — `GET /api/diagnostics/bundle` returns a
  no-store JSON attachment with credentials, tokens, personal identifiers,
  private-pack names, and user-specific paths redacted. Use this instead of
  sharing raw `.demo-launcher/state.json` or copied logs.

Then inspect the evidence panels (verified in
`tools/control-room-template.mjs`):

- **Runtime Contract** — the applied pack's manifest: `id`, `name`,
  `configHash`, `runtimeHash`, `assetBase`, and `expectedSources` per platform (browser
  `http://localhost:5173`, Android `file:///android_asset/demo/index.html`,
  iOS `http://localhost:5173`). This is what the runtime SHOULD be.
- **Device Identity** — what the device ACTUALLY reported: selected platform,
  the last native runtime handshake (`deviceRuntime`: pack id, runtimeHash,
  source URL, SDK device id, external id, push/trust readiness), parity
  `warnings` (e.g. `android reported user X, expected Y.`), and the REST
  credential status (`configured`, `source`, `envName`, `legacyKeyIgnored` —
  never the key itself). **Compare this panel to Runtime Contract; any
  pack-id/runtimeHash or rendered-source difference = stale installed app.**
- **Launcher Logs** — raw build/install/emulator/recovery output of the
  current job (`Refreshing Android package`, gradle output, etc.).
- **Debug Events** — the last 30 diagnostics-category ledger entries with raw
  JSON (bridge actions, runtime handshakes, token telemetry).
- **REST Responses** — host-side Braze REST response history: endpoint,
  HTTP status tag, full response JSON. Capped at 40 entries (the activity
  ledger itself is capped at 240).

The Activity Feed marks launcher/clear session boundaries and can filter to
the current session. Exact or correlated telemetry repeated inside the dedupe
window merges with a duplicate count. **Archive** writes and downloads a
redacted copy; **Clear** archives first, clears feed/REST history, and starts a
new session. These are evidence-management tools, not device resets.

**Push token status.** The launcher tracks push readiness per
`platform|sdkDeviceId|externalId` key (`pushReadinessKey` in
`tools/demo-launcher.mjs`). Each entry records `permission`, `tokenPresent`,
`ready` (= success status AND token present), `tokenPreview`, `tokenLength`,
`retryScheduled`, and `registrationError`. Cockpit controls that need a push
token stay blocked until `ready` is true for the ACTIVE platform + device +
user; the "Verify push readiness" template re-requests it. If `tokenPresent`
is false: check the on-device drawer (section 6) and see
`braze-integration-reference` for the token lifecycle.

**Android trust telemetry.** After an Android launch, the launcher waits for
the app's native HTTPS trust diagnostics (probes of
`https://braze-images.com/` and
`https://firebaseinstallations.googleapis.com/`). Default wait: 15 s
(`BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS` overrides). On timeout it records
a synthetic failure entry (`Android HTTPS trust diagnostics timed out`,
`errorType: "Timeout"`) in state and the ledger, and the launch JOB is marked
Failed — note the app itself was already installed and launched by that step,
so it stays on screen; only readiness reporting failed. A failed/timed-out
trust check on a corporate network usually means the Zscaler CA is not in the
emulator's trust stores — that triage lives in `lumo-debugging-playbook`.
You can re-run the probe any time with the "Verify Android HTTPS trust"
control template.

## 6. On-device diagnostics

**Android debug drawer** — long-press anywhere on the app's WebView
(verified: `webView.setOnLongClickListener { showDebugDrawer() }` in
`android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`).
A bottom sheet shows:

- Demo pack name + id, configHash/runtimeHash, source mode → active URL, override
  active/off, credential profile name, endpoint, external ID, push
  permission state, FCM token preview (first 24 chars or `pending`)
- The last 40 in-app debug log lines (live-updating)
- Buttons: **IAM Event** (logs `demo_iam_trigger` with source
  `android_debug_drawer`), **Cards** (Content Cards refresh), **Push**
  (request notification permission), **FCM Copy** (copies the full FCM token
  to the clipboard — treat it as private, never commit it), **Profile**
  (re-sends connection + profiles payloads to the web layer), **Close**.

Use it when Control Room and the device disagree: the drawer is ground truth
for what the installed APK contains (`Hash:` line) and which credential
profile the SDK initialized with.

**iOS equivalent** — there is no drawer yet. The bridge reports connection
diagnostics on `webReady` (push status, device diagnostics payload, sync
envelope — visible in Control Room Debug Events), and for raw logs launch
with the console attached:

```sh
xcrun simctl launch --console booted com.braze.masquerade
```

Bridge traffic is printed as `[bridge ←] <action> ...` lines
(`ios-shell/Sources/WebViewController.swift`).

## 7. Where the logs and state live

| Location | Contents | How to read |
|---|---|---|
| `.demo-launcher/state.json` | Control Room state: activePackId/platform/externalId, pinned controls, `pushReadiness`, `trustDiagnostics`, activity `ledger` (cap 240), `restResponses` (cap 40), last `deviceRuntime` | `cat .demo-launcher/state.json \| npx json` or open in an editor; safe to read, do not hand-edit while the launcher runs |
| `.demo-launcher/activity-archives/` | Redacted, mode-0600 Activity Feed archives created manually or before Clear | Prefer the archive returned by the Control Room; never substitute a raw state dump |
| `/tmp/lumo-demo-emulator.log` | Android emulator stdout/stderr from `android-shell/tools/run-demo-emulator.sh` | `tail -f /tmp/lumo-demo-emulator.log` during a launch that hangs |
| `adb logcat` | App + SDK runtime logs; the shell logs under tag `BrazeDemoShell` (verified `TAG` in MainActivity.kt) | `adb logcat -s BrazeDemoShell` for shell events; `adb logcat \| grep -i braze` to include Braze SDK internals |
| `${TMPDIR:-/tmp}/lumo-android-ca/` | Working dir of the Zscaler CA installer (`android-shell/tools/install-zscaler-system-ca.sh`): exported cert, hashes, smoke-check artifacts | Inspect after a failed trust install; on macOS `TMPDIR` is usually a per-user path, so check both |
| Control Room → Diagnostics → Launcher Logs | The same job output the CLI would print, kept per job | Browser |

## 8. Bundled script: `scripts/check-runtime-drift.mjs`

Read-only ESM Node script, no dependencies. Answers in one shot: "which pack
id, configHash, and runtimeHash does every location currently hold?" — the fast test for
the classic mid-demo failure of an installed app showing an old pack.

```sh
node .claude/skills/lumo-diagnostics-and-tooling/scripts/check-runtime-drift.mjs
```

It reads (and only reads):

- `web-template/public/demo-runtime.json`
- `web-template/src/brand/activeDemoConfig.generated.ts`
- `android-shell/.active-demo-pack` (id only, no hash)
- `android-shell/local.properties` — ONLY the `demo.packId` /
  `demo.configHash` lines; it never reads or prints `braze.*` / `firebase.*`
  credential values
- if present: `web-template/dist/demo-runtime.json` (built web) and
  `android-shell/app/build/generated/assets/demoWeb/demo/demo-runtime.json`
  (packaged Android asset)

Example healthy output:

```
Location                                              Pack id       configHash
----------------------------------------------------  ------------  ----------------
web-template/public/demo-runtime.json                 lumo-default  7ee8b0d21e4f6aa2
web-template/src/brand/activeDemoConfig.generated.ts  lumo-default  7ee8b0d21e4f6aa2
android-shell/.active-demo-pack                       lumo-default  n/a
android-shell/local.properties (demo.* seed)          lumo-default  7ee8b0d21e4f6aa2
...
Verdict: OK — every present location agrees on pack id, configHash, and runtimeHash.
```

Interpretation:

| You see | Meaning | Do next |
|---|---|---|
| `Verdict: OK`, exit 0 | All present locations agree | Nothing; note the built/packaged rows may say `(not built yet — skipped)` — that only means no build has run |
| `Verdict: DRIFT` + `configHash disagreement: X vs Y`, exit 1 | At least one generated/built artifact is from an older apply | `npm run lumo:apply`; if the odd one out is `dist` or the packaged Android asset, also rebuild/relaunch that shell; re-run the script |
| `Verdict: DRIFT` + `... is missing — run: npm run lumo:apply` | Required generated files absent (fresh clone) | `npm run lumo:apply` |
| exit 2 | Repo root not found | Run from inside the repo or set `LUMO_REPO_ROOT=/path/to/repo` |

Difference from `validate:demo-runtime`: the validator recomputes the
EXPECTED hash from the pack and checks code contracts (slower, authoritative);
this script only cross-compares what is on disk (instant, presenter-friendly).
Before a demo, run the script; before a commit, run the validator. Neither
sees inside a device — for the installed app's actual hash use the Android
debug drawer or Control Room Device Identity.

## Pre-demo 60-second health check

```sh
npm run doctor                       # exit 0, read any WARN lines
npm run lumo:apply                   # "Applied demo pack: <name>"
node .claude/skills/lumo-diagnostics-and-tooling/scripts/check-runtime-drift.mjs   # Verdict: OK
npm run validate:demo-runtime        # "Demo runtime validation passed."
```

Then launch via Control Room and confirm in Diagnostics that Device Identity
matches Runtime Contract and push `tokenPresent` is true (if the story needs
push).

## When NOT to use this skill

- You have DIAGNOSED a fault and need to fix it (push not arriving, IAM
  images broken, Zscaler trust, wrong user) → `lumo-debugging-playbook`.
- You want the policy behind `security:scan` / `public:check`, what may be
  committed, or key handoff → `lumo-secrets-and-sanitization`.
- Doctor fails and you need to BUILD the environment (install tools,
  provision the AVD) → `lumo-build-and-env`.
- You are presenting/operating a demo (cockpit usage, triggering actions) →
  `lumo-run-and-operate`.
- You need every config axis, flag, or env var defined → `lumo-config-and-flags`.
- Which checks gate a commit/push and what evidence counts →
  `lumo-change-control-and-qa`.
- What a pack field means or how to author one → `lumo-demo-pack-authoring`.

## Provenance and maintenance

Verified 2026-07-03 against the repo at
the repository root by reading
`tools/doctor-solcon.mjs`, `tools/validate-demo-runtime.mjs`,
`tools/secret-scan.mjs`, `tools/public-readiness-check.mjs`,
`tools/demo-launcher.mjs`, `tools/control-room-template.mjs`,
`tools/demo-pack-utils.mjs`,
`android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`,
`android-shell/tools/run-demo-emulator.sh`,
`android-shell/tools/install-zscaler-system-ca.sh`, and
`ios-shell/Sources/WebViewController.swift`, and by executing
`npm run lumo:apply`, `npm run validate:demo-runtime`, and
`scripts/check-runtime-drift.mjs` (OK and synthetic-DRIFT paths both tested).

Re-verification one-liners if this skill looks stale:

- npm script names/aliases: `cat package.json`
- Doctor checks + exit semantics: `grep -n "process.exit(1)\|capability status" tools/doctor-solcon.mjs`
- Validator failure strings: `grep -n "fail(\|assertEqual(" tools/validate-demo-runtime.mjs`
- Trust timeout default: `grep -n "trustDiagnosticsTimeoutMs" tools/demo-launcher.mjs`
- Ledger/REST caps: `grep -n "activityLedgerLimit\|slice(0, 40)" tools/demo-launcher.mjs`
- Drawer trigger + log tag: `grep -n "setOnLongClickListener\|TAG =" android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`
- Emulator log path: `grep -n "lumo-demo-emulator.log" android-shell/tools/run-demo-emulator.sh`
- Drift script still healthy: `node .claude/skills/lumo-diagnostics-and-tooling/scripts/check-runtime-drift.mjs`

### Open questions / candidates

- `demo-studio/` ships a prebuilt Electron artifact with no source; it is NOT
  a supported diagnostics surface and is deliberately undocumented here.
- A doctor-summary wrapper script was considered and rejected — `npm run
  doctor` already prints the summary; no second script is needed.
