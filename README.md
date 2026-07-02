# Lumo Braze Demo Shells

Local-first demo tooling for Braze app demos. A demo pack generates a shared
web runtime and native shell metadata, then the Control Room applies packs,
launches Android/iOS, triggers SDK actions, and sends safe host-side Braze REST
requests.

## Architecture

- `demo-packs/` contains the sanitized public `Lumo` pack. Keep
  customer/private packs and local credentials out of the shared distribution.
- `.demo-packs/` is the ignored local workspace for Claude-created, imported, or
  customer-specific packs.
- `web-template/` renders the product demo UI. It does not contain presenter
  controls; all real demo controls live in the Control Room.
- `android-shell/` packages the built web app as Android assets and owns the
  Braze Android SDK bridge.
- `ios-shell/` hosts the web template in `WKWebView` during development and owns
  the Braze Swift SDK bridge.
- `tools/demo-launcher.mjs` starts the local Control Room, applies packs, runs
  builds, launches devices, and keeps REST API keys host-only.

## Lumo First Run

Supported v1 host: Apple Silicon macOS.

```sh
./bootstrap-lumo.sh --check
./bootstrap-lumo.sh --install
./bootstrap-lumo.sh --android-avd
npm run lumo:cockpit
```

Open the Control Room URL printed by the launcher, choose `Lumo`, and launch
Android or iOS. Detailed setup and troubleshooting live in
`docs/lumo-public-quickstart.md`.

## Diagnostics

```sh
npm run doctor
npm run lumo:apply
npm run validate:demo-runtime
```

## Agent Demo Build Workflow

`plugins/braze-demo-builder/` is the source-distributed Codex/Claude plugin for
guided demo app builds. Load it with `claude --plugin-dir ./plugins/braze-demo-builder`
and use `/braze-demo-builder:demo-build`. Claude-created or imported packs should
live in `.demo-packs/` unless you are deliberately preparing a sanitized public
pack.

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
npm run check:precommit
npm run public:check
cd web-template && npm run build
```

For native changes, also run the relevant Android Gradle build and/or iOS
`xcodegen generate` plus simulator build.
