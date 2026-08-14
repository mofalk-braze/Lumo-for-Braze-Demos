# Lumo Braze Demo Shells

Local-first demo tooling for Braze app demos. A demo pack generates a shared
web runtime and native shell metadata. One launcher host process owns state,
orchestration, credentials, SDK commands, builds, and device launch while its
local clients provide focused operating views.

## Architecture

- `demo-packs/` contains the sanitized public `Lumo` pack. Keep
  customer/private packs and local credentials out of the shared distribution.
- `.demo-packs/` is the ignored local workspace for Claude-created, imported, or
  customer-specific packs.
- `web-template/` renders the product demo UI. It does not contain presenter
  controls.
- `android-shell/` packages the built web app as Android assets and owns the
  Braze Android SDK bridge.
- `ios-shell/` hosts the web template in `WKWebView` during development and owns
  the Braze Swift SDK bridge.
- `tools/demo-launcher.mjs` is the sole host authority. It starts the Control
  Room and paired Presenter Remote, applies packs, runs builds, launches
  devices, executes SDK commands, and keeps REST API keys host-only.

## Lumo First Run

Supported v1 host: Apple Silicon macOS.

For the guided Android-first path, clone the repo, start Claude Code from the
repo root, and ask it to set up Lumo for Android. The committed project skills
are discovered from `.claude/skills/`; there is no skill zip to install.

```text
Read CLAUDE.md, use lumo-build-and-env, and set up this clone for the supported
Android emulator. Run every safe step yourself, pause only for manual GUI or
credential handoff steps, then launch the Control Room and verify bundled
Android runtime readiness.
```

The equivalent manual sequence is:

```sh
./bootstrap-lumo.sh --check --target android
./bootstrap-lumo.sh --install --target android
./bootstrap-lumo.sh --android-avd --target android
npm run lumo:cockpit
```

For agent automation, the target-aware Android surface can replace that manual
sequence:

```sh
node tools/lumo.mjs android setup
node tools/lumo.mjs android doctor
node tools/lumo.mjs android start --pack lumo-default
node tools/lumo.mjs android status
```

Open the Control Room URL printed by the launcher, choose `Lumo`, and launch
Android or iOS. Use the Control Room for setup, authoring, telemetry, and
diagnostics. Open Presenter Remote from the Control Room for a compact, paired
view of the active persona, readiness, and up to seven pinned story controls.
Collapsed Story Controls remain in the Control Room as fallback. Browser
extension packaging is deferred until three rehearsals show repeated window
focus or placement friction; any later side-panel wrapper remains a thin client
of the launcher rather than a new authority.
Detailed setup and troubleshooting live in `docs/lumo-public-quickstart.md`.

## Diagnostics

```sh
node tools/lumo.mjs android doctor
npm run lumo:apply
npm run validate:demo-runtime
```

## Agent Demo Build Workflow

`.claude/skills/` is the canonical source-distributed agent bundle. It includes
fresh-machine setup, Android push readiness, pack authoring, operation,
diagnostics, troubleshooting, secrets, QA, architecture, and demo-building
workflows. Claude Code discovers it automatically when started in this repo.
Other coding agents should follow `AGENTS.md`, inspect the project skill
descriptions, and read the owning `SKILL.md` before acting.

`plugins/braze-demo-builder/` remains an optional compatibility plugin for the
namespaced `/braze-demo-builder:demo-build` command:

```sh
claude --plugin-dir ./plugins/braze-demo-builder
```

Claude-created or imported packs should live in `.demo-packs/` unless you are
deliberately preparing a sanitized public pack. Validate the distributed skill
bundle with `node tools/check-agent-skills.mjs`.

## Pack Manager

Control Room → **Pack Manager** and the repo CLI expose the same safe pack
workflow:

```sh
node tools/lumo.mjs pack new sample-pack --name "Sample Pack"
node tools/lumo.mjs pack duplicate lumo-default sample-pack --name "Sample Pack"
node tools/lumo.mjs pack validate sample-pack
node tools/lumo.mjs pack open sample-pack --notes
```

New and duplicated packs go to ignored `.demo-packs/`; credentials are never
copied. Both paths generate `notes.md` mappings for Content Cards, Banners,
IAM, push, dashboard objects, proof, and fallback.

## Local Secrets

Do not commit credentials or generated local state. REST API keys should be set
only in the Control Room session or environment variables such as
`BRAZE_REST_API_KEY_<PACK_ID>` or `BRAZE_REST_API_KEY`.

The shared `android-shell/app/google-services.json` is committed because it is
Firebase client app config for `com.braze.demoshell` and is embedded in the APK.
Firebase service account JSON, FCM server keys, APNs material, keystores, Braze
SDK keys, Braze REST keys, `local.properties`, `Config.swift`, and pack
`secrets.properties` stay local and ignored.

## Sharing With Teammates

The v1 distribution model is public source plus off-repo secrets: teammates clone
the repo, run the bootstrap script, use the committed Lumo pack and Firebase
client config, then receive the Firebase service account JSON outside Git when
they need to configure Android push in their own Braze workspace.

Each teammate's emulator generates its own FCM registration token. Do not share
or commit FCM registration tokens; the Control Room surfaces the current token
status for the active local app install. If Slack is used as a last-resort
service-account handoff, use a short-lived SolCon key, share it only with the
small setup group, and rotate/delete it after the event.

## Commit Checks

Run these before committing:

```sh
npm run lumo:apply
node tools/check-agent-skills.mjs
npm run check:precommit
npm run public:check
cd web-template && npm run build
```

`check:precommit` runs focused launcher/operator/HTTP-boundary, pack,
Presenter Remote, and emulator-runner tests before runtime validation and the
secret scan. Android native changes also run
`./gradlew :app:testDebugUnitTest` for render-generation behavior. On macOS,
iOS native contract changes run `npm run test:ios-contracts`.

For native changes, also run the relevant Android Gradle build and/or iOS
`xcodegen generate` plus simulator build.
