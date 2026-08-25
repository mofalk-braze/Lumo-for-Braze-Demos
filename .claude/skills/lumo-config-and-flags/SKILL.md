---
name: lumo-config-and-flags
description: >-
  Expert/manual lookup for exact Lumo configuration names, defaults, readers,
  and wiring across CLI flags, environment variables, npm scripts, Android
  local properties, iOS config fields, and pack secrets. Invoke it directly
  for a specific configuration fact or when a lifecycle skill points here. It
  is an index, not a setup, operation, or troubleshooting workflow.
disable-model-invocation: true
---

# Lumo Configuration and Flags Index

Expert index of configuration axes in this repo: what each does, its default,
where it is read, and how to add a new one. Sibling workflows link here for
fact tables; this skill does not explain workflows (see "When NOT to use").

Jargon used below, defined once:

- **Pack** — a demo definition (`demo-pack.json` + optional `assets/` + local
  `secrets.properties`) under `demo-packs/` (committed) or `.demo-packs/`
  (local, ignored). Applying a pack generates all runtime config.
- **Control Room** — the local web UI served by `tools/demo-launcher.mjs`
  (default `http://127.0.0.1:4177`); the only presenter/operator surface.
- **AVD** — Android Virtual Device, the emulator profile
  (default `Braze_Demo_API_36`).
- **SDK key vs REST key** — the Braze SDK API key identifies the app to the
  Braze SDK (lives in local secrets files); the REST API key authorizes
  server-side Braze REST calls (lives ONLY in env vars or a Control Room
  session, never in files, except a legacy path that is off by default).
- **configHash** — 16-hex-char SHA-256 prefix of the pack's public JSON; used
  everywhere to detect stale runtime config.
- **Shell** — the native Android (`android-shell/`) or iOS (`ios-shell/`) app
  that hosts the web UI in a WebView/WKWebView and owns the real Braze SDK.
- **Bridge** — the message channel between the web UI and the native shell
  (`window.brazeBridge` / `window.__brazeBridge`); demo commands run "in the
  shell via the bridge" means the Control Room sends a command that the
  native app executes as a real SDK call.

## 1. CLI commands and flags

### Canonical `lumo` surface

| Command | Valid options | Effect |
|---|---|---|
| `node tools/lumo.mjs android setup` | `--check-only`, `--skip-install`, `--skip-avd` | Android-targeted install/AVD/doctor flow; excludes Xcode |
| `node tools/lumo.mjs android doctor` | none | Android-only readiness doctor |
| `node tools/lumo.mjs android start` | `--pack <id>`, `--avd <name>`, `--port <port>` | Start/attach one persistent launcher authority, run the Android job through it, then return while authority + clock guard remain alive |
| `node tools/lumo.mjs android status` | none | Inspect the discovered healthy authority |
| `node tools/lumo.mjs android stop` | none | Stop only the verified authority and its owned clock guard |
| `node tools/lumo.mjs pack new <id>` | `--name`, `--description`, `--json` | Create an ignored local pack plus `notes.md` |
| `node tools/lumo.mjs pack duplicate <source-id> <new-id>` | `--name`, `--description`, `--json` | Copy portable config/assets, omit credentials, regenerate notes |
| `node tools/lumo.mjs pack validate [<id> \| --all]` | `--json` | Validate one or every pack |
| `node tools/lumo.mjs pack open <id>` | `--config`, `--notes`, `--print`, `--json` | Open or print pack config/handoff notes |

`--pack`, `--avd`, and `--port` are valid only with `android start`; the setup
flags are valid only with `android setup`. New/duplicated packs always live in
ignored `.demo-packs/`.

### Low-level launcher compatibility flags

`node tools/demo-launcher.mjs [flags]` (parsed in `parseArgs`, ~line 207).
Use this directly for the foreground Control Room or apply-only automation;
agents launch Android through the canonical surface above so persistent
authority and clock ownership are explicit.

| Flag | Effect | Default without it |
|---|---|---|
| *(none)* | Start the Control Room server on `127.0.0.1:<port>` | — |
| `--list` | Print all packs (committed + local) as JSON and exit | server mode |
| `--pack <id>` | Run a one-shot job for pack `<id>`: apply pack, then build web assets, then stop (status `Built`). No device launch unless `--run` | server mode |
| `--apply-only` | With `--pack`: stop after applying the pack (status `Applied`); skips web build and device launch | build web too |
| `--run` | Low-level compatibility path for the Android pipeline; canonical callers delegate the same job through the persistent authority | stop after web build |
| `--port N` | Bind exactly port N; **error if busy** (strict, no auto-increment) | 4177 (or `PORT`), auto-increments up to +20 if busy |
| `--avd NAME` | AVD to use for `--run` (also exported as `AVD` to the emulator script) | `BRAZE_DEMO_ANDROID_AVD` env, else `Braze_Demo_API_36` |

Notes:
- Setting the `PORT` env var also makes the port strict (treated like `--port`).
- Port auto-increment only happens in default server mode; if you see
  `Port 4177 is in use; using 4178.`, your Control Room URL changed —
  device callback URLs are derived from the actual bound port.
- CLI `--pack` jobs print the job log and set exit code 1 on failure.

## 2. Environment variables

One table; grouped. "Where read" is the file that resolves the default.

### Control Room server (`tools/demo-launcher.mjs`)

| Variable | Effect | Default | Tier |
|---|---|---|---|
| `PORT` | Server port base; setting it makes the port strict (no auto-increment) | `4177` | load-bearing |
| `BRAZE_CONTROL_ROOM_BODY_LIMIT` | Max HTTP request body accepted by the Control Room, in bytes | `262144` (256 KiB) | advanced |
| `BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY` | `1` allows reading the legacy `braze.restApiKey` from a pack's `secrets.properties` as REST key of last resort | unset (legacy key ignored) | legacy escape hatch — avoid; see `lumo-secrets-and-sanitization` |
| `BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS` | Timeout for Android HTTPS trust diagnostics | `15000` | diagnostic |
| `BRAZE_DESIGN_SYSTEM_DIR` | Directory served read-only under `/design/` for Control Room UI assets | `<repo>/Braze Design System (Collaborative)` | advanced/cosmetic |

### Braze REST keys (`tools/demo-pack-utils.mjs` + `tools/demo-launcher.mjs`)

| Variable | Effect | Default |
|---|---|---|
| `BRAZE_REST_API_KEY_<PACK_ID>` | REST key for one pack. `<PACK_ID>` = pack id uppercased, every non-alphanumeric run → `_` (e.g. pack `lumo-default` → `BRAZE_REST_API_KEY_LUMO_DEFAULT`) | unset |
| `BRAZE_REST_API_KEY` | Global REST key fallback for all packs | unset |

Resolution order (`restCredentialStatus`, demo-launcher.mjs ~line 582):
Control Room **session** entry → `BRAZE_REST_API_KEY_<PACK_ID>` →
`BRAZE_REST_API_KEY` → legacy `braze.restApiKey` in `secrets.properties`
**only if** `BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY=1`.

### Android tooling (doctor, launcher, shell scripts)

| Variable | Effect | Default | Where read |
|---|---|---|---|
| `BRAZE_DEMO_ANDROID_AVD` | Default AVD name everywhere | `Braze_Demo_API_36` | `tools/demo-launcher.mjs`, `tools/doctor-solcon.mjs`, both `android-shell/tools/*.sh` |
| `ANDROID_HOME` | Android SDK root | `~/Library/Android/sdk` | `tools/doctor-solcon.mjs`, `android-shell/tools/*.sh` |
| `ADB` | Path to `adb` | `$ANDROID_HOME/platform-tools/adb` (launcher hardcodes `$HOME/Library/Android/sdk/platform-tools/adb`) | `tools/doctor-solcon.mjs`, `tools/demo-launcher.mjs`, `run-demo-emulator.sh`, `install-zscaler-system-ca.sh` |
| `EMULATOR` | Path to `emulator` binary | `$ANDROID_HOME/emulator/emulator` | `tools/doctor-solcon.mjs`, `run-demo-emulator.sh`, `provision-demo-avd.sh` (not read by `install-zscaler-system-ca.sh`) |
| `SDKMANAGER` | Explicit path to `sdkmanager` | auto-discovered under `$ANDROID_HOME/cmdline-tools` or Android Studio | `provision-demo-avd.sh` |
| `AVDMANAGER` | Explicit path to `avdmanager` | same auto-discovery | `provision-demo-avd.sh` |
| `APP_ID` | Android application id targeted by launch/adb commands | `com.braze.demoshell` | `tools/demo-launcher.mjs`, `run-demo-emulator.sh` |
| `ANDROID_USER` | Android user id for `am`/`pm` commands | `0` | `run-demo-emulator.sh` |

### Emulator scripts (`android-shell/tools/`)

| Variable | Effect | Default | Script |
|---|---|---|---|
| `AVD` | AVD to boot (launcher sets this from `--avd`/state) | `BRAZE_DEMO_ANDROID_AVD`, else `Braze_Demo_API_36` | `run-demo-emulator.sh` |
| `INSTALL_APP` | `1` = install the already-built `APK_PATH` once with `adb install -r`; the wrapper never invokes Gradle | `0` | `run-demo-emulator.sh` |
| `APK_PATH` | Absolute APK path; required when `INSTALL_APP=1` | empty | `run-demo-emulator.sh` |
| `LAUNCH_APP` | `1` = launch the verified installed app after preparation | `1` | `run-demo-emulator.sh` |
| `RESET_APP_DATA` | **DESTRUCTIVE.** `1` = uninstall before installing `APK_PATH`; requires `INSTALL_APP=1` | `0` | `run-demo-emulator.sh` |
| `TRUST_MODE` | `auto` probes trust and only restores a missing volatile Conscrypt mount; `repair` explicitly permits system-CA/remount/verity repair; `skip` leaves trust unchanged | `auto` | `run-demo-emulator.sh` |
| `TRUST_INSTALLER` | Trust installer/probe script path | `android-shell/tools/install-zscaler-system-ca.sh` | `run-demo-emulator.sh` |
| `TIME_SYNC_GUARD` | `1` = run one foreground Android clock check before launch; continuous coverage remains launcher-owned | `1` | `run-demo-emulator.sh` |
| `TIME_SYNC_GUARD_SCRIPT` | One-shot clock-check script path | `android-shell/tools/ensure-time-sync-guard.sh` | `run-demo-emulator.sh` |
| `BRAZE_DEMO_ANDROID_BOOT_TIMEOUT_SECONDS` | Boot/activity-manager/unlock timeout | `180` | `run-demo-emulator.sh` |
| `BRAZE_DEMO_EMULATOR_LOG` | Detached emulator output path | `/tmp/lumo-demo-emulator.log` | `run-demo-emulator.sh` |
| `BRAZE_DEMO_EMULATOR_PID_FILE` | Cold-start emulator PID file | `${TMPDIR:-/tmp}/lumo-demo-emulator.pid` | `run-demo-emulator.sh` |
| `AVD_NAME` | AVD to create/verify | `BRAZE_DEMO_ANDROID_AVD`, else `Braze_Demo_API_36` | `provision-demo-avd.sh` |
| `API_LEVEL` | Android platform/system-image version | `36.1` | `provision-demo-avd.sh` |
| `ABI` | System-image ABI | `arm64-v8a` on Apple Silicon, else `x86_64` | `provision-demo-avd.sh` |
| `DEVICE` | AVD hardware profile | `pixel_10_pro` | `provision-demo-avd.sh` |
| `RECREATE_AVD` | **DESTRUCTIVE.** `1` = delete and recreate the AVD | `0` | `provision-demo-avd.sh` |
| `D8` | Explicit path to `d8` for the HTTPS trust smoke check | newest `$ANDROID_HOME/build-tools/*/d8` | `install-zscaler-system-ca.sh` |

**Danger flags — explicit recovery only, never a routine step:**

- `RESET_APP_DATA=1` uninstalls `com.braze.demoshell`, destroying the Braze
  SDK device identity and FCM push-token continuity. Every push previously
  targeted at that install stops working; the new install is a new device in
  Braze. It is rejected unless `INSTALL_APP=1` and an absolute `APK_PATH` are
  also supplied. Only use when deliberately recovering a broken SDK identity.
- `TRUST_MODE=repair` may remount `/system`, disable verity, and reboot the
  dedicated AVD. Use it only when normal `auto` mode reports that persistent
  trust is missing or broken; healthy warm launches and volatile-mount
  restoration do not need it.
- `RECREATE_AVD=1` deletes the whole AVD, losing all app data inside it —
  the same identity loss, plus emulator state. One-time setup correction only.
- `provision-demo-avd.sh` refuses Google Play images by design (rootable
  `google_apis` image required for Zscaler system-CA install). Do not override
  `AVD`/`BRAZE_DEMO_ANDROID_AVD` to a Play-image AVD.

## 3. npm script surface

### Root `package.json` (23 scripts)

| Script | Runs | Notes |
|---|---|---|
| `demo:cockpit` | `node tools/demo-launcher.mjs` | Control Room server |
| `demo:launcher` | `node tools/demo-launcher.mjs` | Control Room server |
| `bootstrap:check` | `node tools/doctor-solcon.mjs` | environment doctor |
| `doctor` | `node tools/doctor-solcon.mjs` | alias |
| `demo:apply:starter` | `node tools/demo-launcher.mjs --pack lumo-default --apply-only` | apply base pack |
| `lumo` | `node tools/lumo.mjs` | canonical guided CLI root |
| `lumo:doctor` | `node tools/doctor-solcon.mjs` | all-target doctor alias |
| `lumo:android:doctor` | `node tools/lumo.mjs android doctor` | Android-only readiness doctor |
| `lumo:android:setup` | `node tools/lumo.mjs android setup` | target-aware dependencies + AVD + doctor |
| `lumo:android:start` | `node tools/lumo.mjs android start` | launch active pack through one persistent authority |
| `lumo:android:status` | `node tools/lumo.mjs android status` | inspect persistent authority |
| `lumo:android:stop` | `node tools/lumo.mjs android stop` | stop verified authority and owned clock guard |
| `lumo:pack` | `node tools/lumo.mjs pack` | Pack Manager CLI (`new`/`duplicate`/`validate`/`open`) |
| `lumo:apply` | same as `demo:apply:starter` | alias |
| `lumo:cockpit` | `node tools/demo-launcher.mjs` | Control Room server alias |
| `lumo:launch:android` | `node tools/lumo.mjs android start --pack lumo-default` | compatibility alias using canonical Android authority |
| `validate:demo-runtime` | `node tools/validate-demo-runtime.mjs` | configHash/runtimeHash agreement checks |
| `test:ios-contracts` | `node ios-shell/tools/run-contract-tests.mjs` | iOS bridge/runtime contract tests |
| `test:capabilities` | capability runner plus Node test suites | launcher, pack, doctor, Android wrapper, remote, and HTTP contracts |
| `security:scan` | `node tools/secret-scan.mjs` | secret scanner |
| `check:agent-skills` | `node tools/check-agent-skills.mjs` | skill inventory, sanitization, link, ignore, and plugin-drift gate |
| `public:check` | `node tools/public-readiness-check.mjs` | public-distribution gate |
| `check:precommit` | capabilities + runtime validation + secret scan + agent-skill check | **Does not include `public:check`** — run that separately before anything public-facing |

### `web-template/package.json`

| Script | Runs | Notes |
|---|---|---|
| `dev` / `build` / `preview` | `vite` / `tsc -b && vite build` / `vite preview` | standard Vite |
| `predev` / `prebuild` / `prepreview` | `node ../tools/ensure-active-demo-config.mjs` | auto pre-hooks: regenerate `activeDemoConfig.generated.ts` + `public/demo-runtime.json` from the active pack **only if either file is missing** (it does not refresh stale ones — re-apply the pack for that) |

## 4. `android-shell/local.properties` key index

Generated by `writeAndroidSeedConfig` (`tools/demo-pack-utils.mjs`) on every
pack apply; read by `localValue()` in `android-shell/app/build.gradle.kts`.
Local-only file, never commit. Values below are placeholders; the real file
holds live credentials.

| Key | Semantics | Becomes (build.gradle.kts) |
|---|---|---|
| `sdk.dir` | Android SDK path for Gradle | Gradle SDK location (no BuildConfig field) |
| `braze.apiKey` | Braze **SDK** API key, e.g. `braze.apiKey=<YOUR_SDK_API_KEY>` | `BuildConfig.BRAZE_API_KEY` + resValue `com_braze_api_key` |
| `braze.endpoint` | Braze SDK endpoint host (no scheme) | `BuildConfig.BRAZE_ENDPOINT` + resValue `com_braze_custom_endpoint` |
| `firebase.senderId` | FCM sender id | `BuildConfig.FIREBASE_SENDER_ID` + resValue `com_braze_firebase_cloud_messaging_sender_id` |
| `demo.packId` | Active pack id | `BuildConfig.DEMO_PACK_ID` (fallback `lumo-default`) |
| `demo.packName` | Active pack display name | `BuildConfig.DEMO_PACK_NAME` (fallback `Lumo`) |
| `demo.profileName` | Seed profile display label | `BuildConfig.DEMO_PROFILE_NAME` (fallback `Seed (local.properties)`) |
| `demo.externalId` | Seed Braze external id | `BuildConfig.DEMO_EXTERNAL_ID` (fallback `lumo-demo-user`) |
| `demo.configHash` | configHash of the applied pack | `BuildConfig.DEMO_CONFIG_HASH` |
| `demo.runtimeHash` | runtimeHash v2 of active config + assets + private app surface | `BuildConfig.DEMO_RUNTIME_HASH` (falls back to configHash only for legacy input) |
| `demo.generatedAt` | ISO timestamp of the apply | `BuildConfig.DEMO_GENERATED_AT` |
| `demo.sourceMode` | Android web source mode (written as `bundled-asset`) | `BuildConfig.DEMO_SOURCE_MODE` |
| `demo.browserUrl` | Expected browser web source | `BuildConfig.DEMO_BROWSER_URL` (fallback `http://localhost:5173`) |
| `demo.androidUrl` | Expected Android web source | `BuildConfig.DEMO_ANDROID_URL` (fallback `file:///android_asset/demo/index.html`) |
| `demo.iosUrl` | Expected iOS web source | `BuildConfig.DEMO_IOS_URL` (fallback `http://localhost:5173`) |
| `demo.webDist` | Web dist directory to package as Android assets | `demoWebDist` file input for asset packaging tasks (no BuildConfig field) |
| `launcher.callbackUrl` | Control Room device-events callback (`http://10.0.2.2:<port>/api/device-events`) | `BuildConfig.LAUNCHER_CALLBACK_URL` |

Also fixed (not from local.properties): resValues enabling Braze FCM
registration, on-new-token registration, automatic push deep links, and a 5s
trigger-action minimum interval (`build.gradle.kts` ~lines 73–77).

`braze.apiKey`, `braze.endpoint`, `firebase.senderId` are re-seeded from the
pack's `secrets.properties`, falling back to the existing local.properties
value — so they survive re-applies. A pre-existing hand-written
local.properties (no generated header) is backed up to
`local.properties.backup.<timestamp>` before the first generated overwrite.

## 5. `ios-shell/Sources/Config.swift` field index

Field NAMES only (this file holds live credential values on presenter
machines — never copy values). `writeIosRuntimeDefaults`
(`tools/demo-pack-utils.mjs`) regex-upserts each `static let` on pack apply,
only if the file already exists.

`brazeAPIKey`, `brazeEndpoint`, `webURL` (URL), `demoPackId`, `demoPackName`,
`demoExternalId`, `demoConfigHash`, `demoGeneratedAt`, `demoSourceMode`
(written as `vite-dev-server`), `browserWebURL`, `androidWebURL`, `iosWebURL`,
`launcherCallbackUrl` (`http://localhost:<port>/api/device-events`).

## 6. Pack-level configuration files

### Pack `secrets.properties` key names (local-only, never commit)

Written by the Control Room `saveCredentials` flow / `writeDemoPackSecrets`:

| Key | Semantics |
|---|---|
| `braze.apiKey` | Braze SDK API key, e.g. `braze.apiKey=<YOUR_SDK_API_KEY>` |
| `braze.endpoint` | SDK endpoint host |
| `braze.restEndpoint` | REST endpoint (host or full URL; `https://` prefixed if missing) |
| `firebase.senderId` | FCM sender id |
| `demo.externalId` | Demo user external id override |
| `demo.profileName` | Demo profile label override |
| `demo.displayName` | Demo user display name override |
| `sdk.dir` | Optional Android SDK path override |
| `braze.restApiKey` | **Legacy, ignored** unless `BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY=1`. Use env vars instead |

### `demo-pack.json` top-level fields (index only)

`id` (required, kebab-case), `name` (required), `description`, `android`
(`defaultExternalId`, `defaultProfileName`), `ios`, `launcher` (`presets`
array), `brand` (required: `colors`, `tabs`, `demoUser`, ...), `content`
(required: `hero`, `categories`, `rails`, optional `contentCardSurfaces`),
`web` (`distDir`, `build` — source overrides). All of these feed configHash
(`demoConfigHash` in `tools/demo-pack-utils.mjs`).

Full schema semantics, authoring, and promotion: see `lumo-demo-pack-authoring`.

## 7. Production vs experimental axes

| Axis | Tier |
|---|---|
| `PORT` / launcher flags / `BRAZE_DEMO_ANDROID_AVD` / `ANDROID_HOME` / REST key env vars | **Load-bearing defaults** — the supported demo path |
| `local.properties` + `Config.swift` seeding via pack apply | **Load-bearing** — never hand-edit generated output; change the pack and re-apply |
| `web.distDir` / `web.build` pack overrides (sourceMode `external-web-dist`) | Advanced — bring-your-own web app; default generated web template is the normal path |
| `BRAZE_CONTROL_ROOM_BODY_LIMIT`, `BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS`, `D8`, `ADB`/`EMULATOR`/`SDKMANAGER`/`AVDMANAGER` overrides | Diagnostic/advanced — only when the default discovery fails |
| `BRAZE_DESIGN_SYSTEM_DIR` | Cosmetic/advanced — Control Room UI assets only |
| `BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY` | Legacy escape hatch — prefer env-var REST keys |
| `RESET_APP_DATA`, `RECREATE_AVD` | Destructive recovery only (see section 2) |
| `demo-studio/` (prebuilt Electron artifact, dist only, no source) | Experimental/candidate — not a supported path |

## 8. How to add a new configuration axis

Pick the row that matches what you are adding; do every step in it.

| Adding a... | Thread it through |
|---|---|
| **Pack field** | 1. Add to `demo-pack.json` (in `.demo-packs/` first). 2. Validate it in `validatePack` (`tools/demo-pack-utils.mjs`). 3. If it is a NEW top-level field, add it to the `publicPack` object in `demoConfigHash` so it is hash-covered (nested fields under existing top-level keys are covered automatically). 4. Thread through generators as needed: `createRuntimeManifest`, `generateWebConfig`, `writeAndroidSeedConfig`, `writeIosRuntimeDefaults`. 5. Update consumers (web template / shells). 6. If schema-checked, extend `tools/validate-demo-runtime.mjs`. Schema doc lives in `lumo-demo-pack-authoring`. |
| **Env var** | 1. Read via `process.env.X` (or `${X:-default}` in shell) with an explicit default at the top of the reading tool. 2. Add a row to the table in section 2 of THIS skill. 3. If setup-relevant (a wrong value breaks first run), add a doctor check in `tools/doctor-solcon.mjs`. |
| **local.properties key** | 1. Emit it in `writeAndroidSeedConfig` (`tools/demo-pack-utils.mjs`). 2. Read via `localValue("your.key")` in `android-shell/app/build.gradle.kts` with a fallback; expose as `buildConfigField` and/or `resValue`. 3. Consume in Kotlin via `BuildConfig.*`. 4. **Parity (AGENTS.md):** mirror in `writeIosRuntimeDefaults` + a `Config.swift` field, or explicitly document why parity is not applicable. 5. Update sections 4–5 of THIS skill. |
| **Launcher flag** | 1. Parse in `parseArgs` (`tools/demo-launcher.mjs`). 2. Thread into `runCli`/`createJob` options. 3. Update section 1 of THIS skill. |

Re-verification after any of the above:

```sh
npm run lumo:apply
npm run validate:demo-runtime
npm run security:scan
npm run public:check
cd web-template && npm run build
```

For Android shell/build changes also:

```sh
cd android-shell && ./gradlew :app:compileDebugKotlin
```

## When NOT to use this skill

- Pack schema **semantics**, authoring workflow, promotion/sanitization →
  `lumo-demo-pack-authoring`.
- Secrets **policy**, committed-vs-local ledger, handoff protocol, what
  `public:check` enforces → `lumo-secrets-and-sanitization`.
- **Interpreting** doctor/validate/Control Room diagnostic output →
  `lumo-diagnostics-and-tooling`.
- Actually running a demo end to end → `lumo-run-and-operate`.
- Why the config system is designed this way; invariants →
  `lumo-architecture-contract`.
- Building an approved demo story, screen, or preset →
  `lumo-new-demo-campaign`, which loads focused builder mechanics as needed.

## Provenance and maintenance

All tables verified against source on 2026-07-03. These tables DRIFT; before
trusting a row, re-verify with the matching one-liner (run from repo root):

| Table | Re-verification command |
|---|---|
| 1. CLI flags | `grep -n "arg === '--" tools/demo-launcher.mjs` |
| 2. Env vars (node tools) | `grep -n "process.env" tools/*.mjs` |
| 2. Env vars (shell scripts) | `grep -n ':-' android-shell/tools/*.sh` |
| 2. REST key resolution | `grep -n "restCredentialStatus\|BRAZE_REST_API_KEY" tools/demo-launcher.mjs tools/demo-pack-utils.mjs` |
| 3. npm scripts | `cat package.json web-template/package.json` |
| 4. local.properties keys | `grep -n "localValue\|buildConfigField\|resValue" android-shell/app/build.gradle.kts` and `grep -n "'demo\.\|'braze\.\|'launcher\." tools/demo-pack-utils.mjs` |
| 5. Config.swift fields | `grep -n "upsertSwiftLet\|upsertSwiftUrlLet" tools/demo-pack-utils.mjs` (names only — do not paste file contents anywhere) |
| 6. secrets keys | `grep -n -A 12 "function saveCredentials" tools/demo-launcher.mjs` |
| 6. pack top-level fields | `grep -n "required = \|publicPack" tools/demo-pack-utils.mjs` |
| Defaults (port/AVD/timeouts) | `sed -n '28,40p' tools/demo-launcher.mjs` |

### Open questions / candidates

- `demo-studio/` ships only a prebuilt Electron dist (no source); its
  configuration surface is undocumented and unsupported here.
- `pack.ios` is accepted at top level and hash-covered but currently carries
  no verified consumer-side keys in this repo's generators.
