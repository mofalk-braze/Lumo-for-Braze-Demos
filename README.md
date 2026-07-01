# Braze Demo Shells

Local-first demo tooling for Braze app demos, packaged for SolCon colleague
distribution. A demo pack generates a shared web runtime and native shell
metadata, then the Control Room applies packs, launches Android/iOS, triggers
SDK actions, and sends safe host-side Braze REST requests.

## Architecture

- `demo-packs/` contains the sanitized `SolCon Starter` pack. Keep
  customer/private packs and local credentials out of the shared distribution.
- `web-template/` renders the product demo UI. It does not contain presenter
  controls; all real demo controls live in the Control Room.
- `android-shell/` packages the built web app as Android assets and owns the
  Braze Android SDK bridge.
- `ios-shell/` hosts the web template in `WKWebView` during development and owns
  the Braze Swift SDK bridge.
- `tools/demo-launcher.mjs` starts the local Control Room, applies packs, runs
  builds, launches devices, and keeps REST API keys host-only.

## Install Braze Demo Studio

Supported v1 host: Apple Silicon macOS.

For presenters and operators, use the packaged **Braze Demo Studio** app. It
opens the same local Control Room, creates isolated workspaces under
`~/Library/Application Support/Braze Demo Studio/workspaces/`, and shows a
first-run GUI for workspace setup, doctor checks, dependency install, kit
import, and platform readiness.

Internal preview builds can be created from source:

```sh
cd demo-studio && npm install
cd ..
npm run demo:studio:pack
```

The unsigned local `.app` build is written to:

```text
demo-studio/dist/mac-arm64/Braze Demo Studio.app
```

For a shareable internal artifact, build the unsigned DMG/zip:

```sh
npm run demo:studio:dist
```

The packaged app includes Electron, the Studio app, a sanitized source template,
the starter pack, design assets, and Firebase client app config. It does not
bundle Android Studio/SDK, Java, Xcode, xcodegen, Braze credentials, APNs
material, Firebase service accounts, native build outputs, or REST API keys.
Those stay host-local and are checked or guided by the first-run flow.

The first-run setup assistant can install Homebrew-managed tools, project npm
dependencies, Android SDK packages/AVD, and run Android/iOS verification. It
opens Android Studio, Xcode, Braze, Firebase, and Apple Developer pages for the
GUI/admin steps that should not be silently automated.

Studio users should import `.braze-demo-kit` bundles through the app. Imported
kits are installed into the selected workspace's ignored local pack area,
`.demo-packs/<pack-id>/`.

## Source SolCon First Run

Builders and contributors can still run from a source clone:

```sh
./bootstrap-solcon.sh --check
./bootstrap-solcon.sh --install
./bootstrap-solcon.sh --android-avd
npm run demo:launcher
```

Open the Control Room URL printed by the launcher, choose `SolCon Starter`, and
launch Android or iOS. Detailed setup and troubleshooting live in
`docs/solcon-onboarding.md`.

## Local Desktop Studio Development

Braze Demo Studio opens the same local Control Room UI in an Electron app and
runs each demo from an isolated workspace under
`~/Library/Application Support/Braze Demo Studio/workspaces/`.

```sh
cd demo-studio && npm install
cd ..
npm run demo:studio
npm run demo:studio:pack
npm run demo:studio:dist
```

The Studio keeps generated runtime files, Android/iOS local config, launcher
state, and imported `.braze-demo-kit` bundles local to the selected workspace.
It does not host demos, store shared user state, or sync REST API keys.

## Diagnostics

```sh
npm run doctor
npm run demo:apply:starter
npm run validate:demo-runtime
```

## Agent Demo Build Workflow

`plugins/braze-demo-builder/` is the source-distributed Codex/Claude plugin for
guided demo app builds. It exposes `/demo-build`, which grounds in this repo's
runtime docs, asks the required SolCon setup questions, recommends Content Card
placements, and finishes with validation and dashboard setup notes.

## Local Secrets

Do not commit credentials or generated local state. REST API keys should be set
only in the Control Room session or environment variables such as
`BRAZE_REST_API_KEY_<PACK_ID>` or `BRAZE_REST_API_KEY`.

The dedicated SolCon `android-shell/app/google-services.json` is committed
because it is Firebase client app config for `com.braze.demoshell` and is
embedded in the APK. Firebase service account JSON, FCM server keys, APNs
material, keystores, Braze REST keys, `local.properties`, `Config.swift`, and
pack `secrets.properties` stay local and ignored.

## Sharing With Teammates

Use the packaged Studio app for internal presenters/operators and the source repo
for builders. The packaged app is unsigned for local internal testing; broader
Braze-wide or external distribution should move to a signed and notarized DMG.

Hosted Control Room distribution is intentionally deferred because it would
require authentication, authorization, audit logging, rate limits, server-side
secret storage, and a formal deployment model.

## Commit Checks

Run these before committing:

```sh
npm run check:precommit
cd web-template && npm run build
```

For native changes, also run the relevant Android Gradle build and/or iOS
`xcodegen generate` plus simulator build.
