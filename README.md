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

## SolCon First Run

Supported v1 host: Apple Silicon macOS.

```sh
./bootstrap-solcon.sh --check
./bootstrap-solcon.sh --install
./bootstrap-solcon.sh --android-avd
npm run demo:launcher
```

Open the Control Room URL printed by the launcher, choose `SolCon Starter`, and
launch Android or iOS. Detailed setup and troubleshooting live in
`docs/solcon-onboarding.md`.

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

The v1 distribution model is source-based: teammates clone the private repo, run
the bootstrap script, use the committed starter pack and Firebase client config,
then provide only local Braze SDK/REST credentials when they need live Braze
workspaces. Hosted Control Room distribution is intentionally deferred because it
would require authentication, authorization, audit logging, rate limits,
server-side secret storage, and a formal deployment model.

## Commit Checks

Run these before committing:

```sh
npm run check:precommit
cd web-template && npm run build
```

For native changes, also run the relevant Android Gradle build and/or iOS
`xcodegen generate` plus simulator build.
