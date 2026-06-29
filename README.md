# Braze Demo Shells

Local-first demo tooling for Braze app demos. A demo pack generates a shared web
runtime and native shell metadata, then the Control Room applies packs, launches
Android/iOS, triggers SDK actions, and sends safe host-side Braze REST requests.

## Architecture

- `demo-packs/` contains public demo app concepts. Keep customer-private assets
  and local credentials out of committed packs.
- `web-template/` renders the product demo UI. It does not contain presenter
  controls; all real demo controls live in the Control Room.
- `android-shell/` packages the built web app as Android assets and owns the
  Braze Android SDK bridge.
- `ios-shell/` hosts the web template in `WKWebView` during development and owns
  the Braze Swift SDK bridge.
- `tools/demo-launcher.mjs` starts the local Control Room, applies packs, runs
  builds, launches devices, and keeps REST API keys host-only.

## First Run

1. Install prerequisites:
   - Node.js and npm.
   - Android Studio / Android SDK for Android demos.
   - Xcode and `xcodegen` for iOS demos.
2. Install web dependencies:

   ```sh
   cd web-template
   npm install
   cd ..
   ```

3. Create local credential files from examples as needed:
   - `android-shell/local.properties`
   - `android-shell/app/google-services.json`
   - `ios-shell/Sources/Config.swift`
   - `demo-packs/<pack>/secrets.properties`
4. Apply a pack and validate generated runtime state:

   ```sh
   npm run demo:launcher
   npm run validate:demo-runtime
   ```

5. Use the Control Room URL printed by the launcher to choose a pack, configure
   the active user, launch Android/iOS, and run demo controls.

## Local Secrets

Do not commit credentials or generated local state. REST API keys should be set
only in the Control Room session or environment variables such as
`BRAZE_REST_API_KEY_<PACK_ID>` or `BRAZE_REST_API_KEY`. SDK keys, Firebase files,
APNs material, service account JSON, keystores, and generated native config stay
local and are ignored.

## Sharing With Teammates

The v1 distribution model is source-based: teammates clone the private repo,
install prerequisites, provide their own local credentials, and run the Control
Room locally. Hosted Control Room distribution is intentionally deferred because
it would require authentication, authorization, audit logging, rate limits,
server-side secret storage, and a formal deployment model.

## Commit Checks

Run these before committing:

```sh
npm run check:precommit
cd web-template && npm run build
```

For native changes, also run the relevant Android Gradle build and/or iOS
`xcodegen generate` plus simulator build.
