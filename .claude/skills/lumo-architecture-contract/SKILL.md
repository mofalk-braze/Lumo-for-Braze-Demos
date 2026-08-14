---
name: lumo-architecture-contract
description: >-
  The architecture contract for the Lumo Braze Demo Shells repo: the
  load-bearing design decisions and WHY they exist, the invariants every change
  must preserve, and the known-weak points. Use when someone asks "how does
  this repo work", "why is it built this way", "what's the architecture",
  "can I edit activeDemoConfig.generated.ts" (no — read this first),
  "where do presenter controls go", "why is google-services.json committed",
  "what are the invariants", "why can't the web app call Braze directly",
  "why is the iOS SDK pinned", "is it safe to reset app data", "what is
  configHash", "what is the bridge sync contract", or before ANY design
  decision, refactor, new feature, platform change, or review in this repo.
  Also use to check whether a proposed change violates a standing rule.
---

# Lumo Architecture Contract

Reference skill: the design decisions that hold this repo up, why each one
exists, the invariants you must not break, and the places the design is
honestly weak. **No runbooks here** — for "how do I run/build it" see
`lumo-run-and-operate` and `lumo-build-and-env`.

Docs of record (they win over this skill if there is ever a conflict):
`AGENTS.md`, `docs/demo-runtime-architecture.md`, `README.md`, `CLAUDE.md`.

## The pipeline in one picture

```
demo pack (demo-pack.json + assets + ignored secrets.properties)
      │  apply (tools/demo-launcher.mjs → tools/demo-pack-utils.mjs)
      ▼
generated runtime artifacts
  ├─ web-template/src/brand/activeDemoConfig.generated.ts   (web config)
  ├─ web-template/public/demo-runtime.json                  (runtime manifest)
  ├─ web-template/public/demo-assets/<id>/                  (synced assets)
  ├─ android-shell/.active-demo-pack + local.properties     (Android seed)
  └─ ios-shell/Sources/Config.swift                         (iOS defaults, upserted)
      │  build / launch
      ▼
native shells render the web app and OWN all Braze SDK execution
```

Field-level detail of what each generated artifact contains:
`lumo-demo-pack-authoring/references/pack-schema.md` (the owning table).

```
  ├─ android-shell/  Kotlin, loads file:///android_asset/demo/index.html
  └─ ios-shell/      Swift/WKWebView, loads http://localhost:5173 (dev-only, M1)
      │  bridge (brazeBridge / window.__brazeBridge) + device telemetry
      ▼
Control Room (tools/demo-launcher.mjs, http://127.0.0.1:4177)
  the ONLY presenter/operator surface: apply, build, launch, SDK
  commands, host-side Braze REST, Activity Feed, Diagnostics
```

Jargon, defined once: a **demo pack** is a directory with `demo-pack.json`
(plus optional assets and an ignored `secrets.properties`) describing one demo
story; a **shell** is a native app (Android/iOS) hosting the shared web UI in a
WebView; the **Control Room** is the local launcher web UI where the presenter
operates everything; the **bridge** is the JS↔native message channel
(`web-template/src/braze/bridge.ts` and its Kotlin/Swift counterparts); the
**configHash** is a hash of the applied pack stamped into every generated
artifact so all surfaces can prove they run the same config; an **SDK key**
identifies an app to Braze from the device, a **REST key** authorizes
server-side Braze API calls and is far more sensitive.

## Why each boundary exists

### 1. The pack is the single source of truth

Everything a demo needs — brand, screens, users, presets, expected sources —
lives in one `demo-pack.json`. Apply regenerates every downstream artifact
from it (`tools/demo-pack-utils.mjs` writes all five artifact groups above).

**Why:** four surfaces (browser, Android, iOS, Control Room) must agree on one
config. If any surface had its own hand-maintained config, they would drift —
and stale runtime drift is one of the three costliest failures this project
has actually hit (an installed app showing an old pack mid-demo). One input,
deterministic regeneration, one hash to compare. Stated as a standing rule in
`AGENTS.md` and `docs/demo-runtime-architecture.md` (opening paragraph).

### 2. Generated files are never hand-edited

`activeDemoConfig.generated.ts`, `demo-runtime.json`, synced assets,
`.active-demo-pack`, the seeded parts of `local.properties`, and the upserted
lets in `Config.swift` are outputs, not sources.

**Why:** a hand edit survives exactly until the next apply, then silently
vanishes — or worse, doesn't vanish because nobody re-applies, and now the
configHash lies. `npm run validate:demo-runtime` exists specifically to catch
generated-file/pack disagreement. The fix path is always: edit the pack,
re-apply. (`AGENTS.md`: "Do not hand-edit generated runtime files.")

### 3. Web renders product only; no presenter controls in the app

`web-template/` is the product UI the audience sees. Setup, presets, staged
controls, REST triggers, build/run actions all live in the Control Room
(`docs/demo-runtime-architecture.md` → "Ownership" and "Control Room IA").

**Why:** the phone screen is projected to a prospect. Any operator control
visible there breaks the illusion that this is a real product app, and every
demo-only button in the product UI is a thing that can be mis-tapped live.
Keeping the app "product-pure" also keeps the web template reusable across
brands. If you're adding a button and wondering where it goes: if the
*audience* shouldn't see it, it belongs in the Control Room.

### 4. Native shells own ALL Braze SDK execution

The web template never talks to Braze directly. It sends bridge messages;
Android (`android-shell/app/src/main/java/com/braze/demoshell/`) and iOS
(`ios-shell/Sources/BrazeManager.swift`) execute `changeUser`, events,
purchases, push, and Content Cards through their native SDKs, then echo state
back over the bridge.

**Why:** the entire point of the shells is to demo *real native* Braze
behavior — native in-app message rendering, real FCM/APNs push, real SDK
device identity. A Web SDK inside the WebView would demo the wrong product and
create two SDK identities per device. One SDK owner per platform also means
one place for credentials (native local config, never web assets). Standing
rule in `AGENTS.md`.

### 5. Control Room is the only presenter surface and the REST boundary

The launcher (`tools/demo-launcher.mjs`) is a local Node server: it applies
packs, drives builds/launches, receives device telemetry at
`/api/device-events`, and is the only component allowed to hold a Braze REST
key and make REST calls (with a validated, blocklisted request surface —
DELETE and broadcast blocked, recipients required for triggers).

**Why:** REST keys must never reach a device, a WebView, or a committed file,
so REST execution has to live on the host. Concentrating orchestration in one
process also gives one place for readiness gating (below) and one Activity
Feed the presenter can trust.

## Distribution model: public source + off-repo secrets

The repo is safe for public source distribution: teammates clone it, run the
bootstrap, and provide their own credentials locally.
`android-shell/app/google-services.json` **is** committed because it is public
Firebase *client* config for `com.braze.demoshell` — it is embedded in every
APK anyway and contains no authorizing secret. Everything that authorizes —
Braze SDK/REST keys, Firebase *service-account* JSON, APNs material,
keystores, `local.properties`, `ios-shell/Sources/Config.swift`, pack
`secrets.properties`, anything under `.demo-packs/` — stays local and ignored
(`README.md` → "Local Secrets" / "Sharing With Teammates"). The full
committed-vs-local ledger, env-var conventions, and handoff protocol live in
`lumo-secrets-and-sanitization`.

## Invariants

Every change must preserve these. Each row: the rule, why, and how to verify
it still holds.

| # | Invariant | Why | Verify |
|---|---|---|---|
| 1 | **iOS/Android parity.** Changing pack application, runtime generation, asset packaging, launch flows, bridge behavior, or Cockpit controls on one platform requires implementing the analog on the other or documenting why not applicable. | The Control Room presents both platforms with one mental model; asymmetry becomes a live-demo surprise. | `AGENTS.md` line 1 (bullet 1). In review: "where is the other platform's half of this change?" |
| 2 | **Runtime id/runtimeHash agreement.** Browser, Android, iOS, Control Room, and Presenter Remote must agree on pack id and `runtimeHash` v2. `configHash` remains the public configuration fingerprint; `runtimeHash` adds active assets and the private pack app surface. | Prevents stale config, assets, or pack-owned UI from masquerading as the active deployment. | `npm run validate:demo-runtime`; Control Room Diagnostics; manifest schema in `docs/demo-runtime-architecture.md` → "Runtime Manifest". |
| 3 | **SDK device identity preserved by default.** Launch flows must not clear app/SDK storage; destructive resets are explicit recovery actions only (Android: `RESET_APP_DATA=1` on `android-shell/tools/run-demo-emulator.sh`; iOS: only external simulator/app erase). | The Braze SDK device ID and push-token continuity live in app storage; a casual reset severs the push token and the profile the demo was rehearsed against. | `grep -n RESET_APP_DATA android-shell/tools/run-demo-emulator.sh`; `AGENTS.md` bullet 6. |
| 4 | **REST keys host-only.** Resolved from Control Room session state or environment variables; never written into web assets, Android resources, iOS source, pack JSON, or committed files. | A REST key can read/export user data and trigger sends; a device or repo leak is a real incident, not a demo bug. | `npm run security:scan`; resolution order in `tools/demo-launcher.mjs` (session → `BRAZE_REST_API_KEY_<PACK_ID>` → `BRAZE_REST_API_KEY` → legacy only with `BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY=1`). Full config axis: `lumo-config-and-flags`. |
| 5 | **Source URL overrides are visible advanced diagnostics.** Pointing a shell at a non-default web source must always be reported in runtime/connection diagnostics, and stays limited to local dev origins absent a deliberate escape hatch. | An invisible override is invariant #2's blind spot: id/hash could agree while the pixels come from somewhere else. | `AGENTS.md` bullet 7; Android diagnostics drawer shows demo id/hash/source (`docs/demo-runtime-architecture.md` → "Ownership"). |
| 6 | **Server-owned readiness gating.** The launcher blocks live controls until native telemetry proves the expected pack id, `runtimeHash`, canonical rendered source, applied external user, and selected-pack credential context. Stale install/hash/override/render/user/workspace is a blocker. Controls marked `requiresPushToken: true` additionally require successful token telemetry for the active user. | Turns stale, blank, wrong-workspace, or replayed-render failures into a pre-demo red light. | `docs/demo-runtime-architecture.md` → "Runtime, Trust, And Push Readiness"; `grep -n requiresPushToken tools/demo-launcher.mjs`. |
| 7 | **Bridge sync envelope `braze-demo-sync/v1`.** Every identity handoff carries `sessionId`, `runtimeId`, `configHash`, `runtimeHash`, `authority` (`web`\|`native`\|`control_room`), `reason`, `timestamp`. Web dedupes identity signatures and suppresses native echo loops; natives remain the only SDK owners. | Identity changes originate from three surfaces; without an envelope + dedupe, web↔native echoes loop `changeUser` calls. Binding render proof to `runtimeHash` prevents stale assets at the right URL from passing readiness. | `web-template/src/braze/sync.ts`; Android/iOS `WebReadyIdentity` helpers; `docs/demo-runtime-architecture.md` → "Bridge Sync Contract". |

## Known-weak points (stated plainly)

These are real, current, and verified — plan around them; don't be surprised
by them.

- **iOS shell is at M1 maturity, behind Android.** It loads the web app only
  from the Vite dev server (`http://localhost:5173`, hardcoded in
  `ios-shell/Sources/Config.swift`); there are **no bundled iOS web assets
  yet** (`ios-shell/README.md`, "Notes / gotchas"). Credential setup has no
  native settings UI — it goes through the web setup screen into UserDefaults
  (`ios-shell/Sources/CredentialStore.swift`), with the Control Room as the
  preferred path. **Real iOS push requires an org-signed Xcode build** — the
  `aps-environment` entitlement is rejected on ad-hoc/CLI signing, so
  `CODE_SIGNING_ALLOWED=NO` builds run everything *except* push
  (`ios-shell/README.md` → "Enable real push").
- **Braze Swift SDK pinned at 11.9.0.** 15.1.0+ fails to compile under
  Xcode 26.5 / Swift 6.3 (internal BrazeUI↔BrazeKit mismatch). Pin and
  rationale in `ios-shell/project.yml`; revisit on Braze SDK or Xcode updates.
- **`firebase-messaging` pinned at 25.0.1.** The emulator image's GMSCore
  (26.11.x on the Pixel_10_Pro Android 37 Play image) is below the Play
  Services floor that 25.1.0 requires. Comment at
  `android-shell/app/build.gradle.kts` (dependencies block).
- **`Config.swift` generation is a regex upsert, not templating.**
  `writeIosRuntimeDefaults` in `tools/demo-pack-utils.mjs` regex-replaces
  `static let` lines in the *existing, git-ignored* file (and skips entirely
  if the file doesn't exist). Fragile by construction: renaming a let,
  reformatting the file, or unexpected content can make an upsert miss or
  append oddly. Treat `Config.swift` structure as part of the contract.
- **Zscaler CA install is brittle.** Corporate-network TLS interception makes
  IAM media and FCM silently fail unless the Zscaler root CA is installed into
  Android *system + Conscrypt* trust stores — which requires the dedicated
  rootable `google_apis` AVD (`Braze_Demo_API_36`; Play images are rejected
  because they can't `adb root`). The wrapper
  (`android-shell/tools/run-demo-emulator.sh` +
  `install-zscaler-system-ca.sh`) fails closed before app launch if trust or
  the HTTPS smoke checks fail — correct behavior, but a recurring source of
  cross-machine setup pain. Triage lives in `lumo-debugging-playbook`.
- **Device telemetry is silently lost if the Control Room is unreachable.**
  `postLauncherTelemetry` in `MainActivity.kt` fires a background POST with
  1.5 s timeouts and, on failure, only `Log.d`s — no retry, no queue, no UI
  signal. If the launcher is down or the callback URL is wrong, the Activity
  Feed simply shows nothing and looks like the demo did nothing.
- **`localhost` → `10.0.2.2` translation is emulator-only.** Android rewrites
  `http://localhost`/`http://127.0.0.1` source URLs to `10.0.2.2`
  (`MainActivity.kt`), and the launcher hands Android the callback URL
  `http://10.0.2.2:<port>/api/device-events` (`tools/demo-launcher.mjs`).
  `10.0.2.2` is the emulator's alias for the host loopback — a *physical*
  Android device cannot reach it, so dev-server loading and telemetry
  callbacks assume the emulator.

## The four unwritten discipline rules

Confirmed by the project owner; treat as non-negotiable operating doctrine.

1. **Never demo from an un-applied/stale pack.** Re-apply and confirm
   `runtimeHash` plus rendered-source agreement across surfaces before presenting. *Why:* stale
   runtime drift has burned real demos; invariant #6 gates controls, but only
   discipline gates *starting the demo at all*.
2. **Never reset app data casually.** `RESET_APP_DATA=1` / simulator erase
   destroys the SDK device ID and push-token continuity; use only as an
   explicit, understood recovery step. *Why:* a "clean start" minutes before a
   push demo silently guarantees the push won't arrive (the token in Braze
   belongs to the dead install).
3. **No customer names/assets anywhere committed** — commits, branches,
   screenshots, or pack ids in the public tree. Customer work lives in
   `.demo-packs/` only (customer packs were deliberately purged from the
   public-facing tree in June 2026). *Why:* the repo is public-source by
   design; one customer artifact in history breaks the whole distribution
   model. Enforcement details: `lumo-secrets-and-sanitization`.
4. **Don't edit generated files even "just for this demo".** Go through the
   pack and re-apply, always. *Why:* the quick hack either gets overwritten
   mid-prep or desynchronizes the configHash — both failure modes surface
   during the demo, not before it.

## Open questions / candidates

Explicitly **not** commitments — ideas that exist in some form but are not
supported paths:

- **Multi-pack orchestration** (more than one active pack / fast pack
  switching in one session): candidate; today the model is one active pack.
- **Windows/Linux host support:** candidate at best; bootstrap enforces
  Apple Silicon macOS (`README.md`: "Supported v1 host").
- **demo-studio Electron app:** `demo-studio/` contains a prebuilt dist-only
  artifact (no source in-tree). Experimental; do not document or rely on it as
  a supported path.
- **iOS bundled web assets** (parity with Android's packaged
  `android_asset/demo/`): the acknowledged next maturity step for the iOS
  shell; until it lands, iOS remains dev-server-only.

## When NOT to use this skill

- Running a demo, using the Control Room, launching shells → `lumo-run-and-operate`
- Setting up a machine, bootstrap, AVD/Xcode → `lumo-build-and-env`
- Creating/editing packs, promotion, sanitization → `lumo-demo-pack-authoring`
- How SDK bridge/REST/push work mechanically in this repo → `braze-integration-reference`
- What's committed vs local, secret handoff → `lumo-secrets-and-sanitization`
- Any config key/flag/env var lookup → `lumo-config-and-flags`
- Interpreting doctor/validate output → `lumo-diagnostics-and-tooling`
- A symptom to triage → `lumo-debugging-playbook`
- Commit gates and evidence standards → `lumo-change-control-and-qa`
- Building demo *stories* (screens, presets, content) → the
  `braze-demo-app-builder` skill / `plugins/braze-demo-builder` plugin
  (routing: `lumo-plugin-workflow`)

## Provenance and maintenance

Verified 2026-07-03 against the working tree (branch `main`). Re-verify the
claims most likely to drift:

- Standing rules: `sed -n 1,12p AGENTS.md` and re-read
  `docs/demo-runtime-architecture.md` (this skill must never contradict them).
- Sync protocol + envelope fields:
  `grep -rn "braze-demo-sync" web-template/src android-shell/app/src ios-shell/Sources`
- Generated artifact paths: `sed -n 14,20p tools/demo-pack-utils.mjs`
- iOS SDK pin + reason: `sed -n 8,14p ios-shell/project.yml`
- firebase-messaging pin + reason: `grep -n -B3 firebase-messaging android-shell/app/build.gradle.kts`
- Regex upsert: `grep -n "upsertSwiftLet\|writeIosRuntimeDefaults" tools/demo-pack-utils.mjs`
- Telemetry loss behavior: `grep -n -A2 "Launcher telemetry failed" android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`
- 10.0.2.2 translation: `grep -rn "10.0.2.2" tools/demo-launcher.mjs android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`
- Readiness gating + push-gated controls: `grep -n requiresPushToken tools/demo-launcher.mjs`
- Validation coverage: `npm run validate:demo-runtime` (list of checks in
  `docs/demo-runtime-architecture.md` → "Drift Prevention").

If iOS gains bundled assets, the Swift SDK unpins, `demo-studio/` gains
source, or a non-macOS host lands, update "Known-weak points" and
"Open questions / candidates" in the same change.
