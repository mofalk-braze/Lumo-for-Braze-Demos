# Braze Android Demo Shell

Native Kotlin Android shell for the active Braze demo pack. The app opens full
screen into packaged React/Vite web assets, initializes the Braze Android SDK, registers
Firebase Cloud Messaging when the emulator supports it, and exposes Android-only
diagnostics through a hidden drawer.

## What This Proves

- The active demo renders from packaged Android assets at `file:///android_asset/demo/index.html`.
- The same web bridge contract works on Android via `window.brazeBridge` and on
  iOS via `window.webkit.messageHandlers.brazeBridge`.
- Workspace profiles use the shared JSON shape:
  `id`, `name`, `apiKey`, `endpoint`, `externalId`, optional advanced `webURL`, `active`.
- `changeUser`, custom attributes, custom events, purchases, IAM trigger events,
  normalized Content Cards, Content Card clicks/impressions, launch-time push
  permission requests, and manual push permission requests route through the
  Android SDK.
- Foreground push payloads can be forwarded into the branded demo banner;
  background push remains native Android notification behavior.

## Local Setup

1. Build the web app:

   ```sh
   cd ../web-template
   npm install
   npm run build
   ```

2. Open `android-shell/` in Android Studio.
3. Copy `local.properties.example` to `local.properties`.
4. Fill:
   - `sdk.dir`, if Android Studio does not write it automatically.
   - `braze.apiKey`: Braze Android SDK app identifier API key.
   - `braze.endpoint`: SDK endpoint, for example `sdk.iad-03.braze.com`.
   - `firebase.senderId`: Firebase project number / FCM sender ID.
5. Register the Android app in Firebase with package name `com.braze.demoshell`.
6. Download `google-services.json` and place it at `android-shell/app/google-services.json`.
7. In Google Cloud, enable Firebase Cloud Messaging API.
8. Create an FCM service account with Firebase Cloud Messaging send permission.
9. Upload the service account JSON to Braze under the Android app's Push
   Notification Settings, then delete or secure the local JSON.
10. Create or start a Google Play / Google APIs emulator. The current target is
    the existing `Pixel_10_Pro` AVD.
11. Run the app, grant the launch-time notification permission prompt, and test
    from the Control Room.

The Gradle build copies `../web-template/dist` into generated Android assets
under `demo/`. If `dist/index.html` is missing, `assembleDebug` fails with a
setup message instead of producing a blank WebView.

## Demo Pack Launcher

From the repo root, start the host-side launcher:

```sh
npm run demo:launcher
```

Open the printed local URL, choose a demo pack, then use the control room to
build, launch, fire SDK actions, trigger Braze-created messages, and watch the
live event ledger. The launcher:

- Generates the active web demo config from `demo-packs/<pack-id>/demo-pack.json`.
- Generates ignored Android seed config from `demo-packs/<pack-id>/secrets.properties`
  while preserving existing local Braze/Firebase values when a pack has no secrets.
- Writes a local Android telemetry callback URL so the emulator can POST
  structured events back to the launcher at `http://10.0.2.2:<port>`.
- Runs the web build.
- Starts the configured AVD with a writable system partition.
- Applies the Zscaler trust pattern when the Zscaler root exists in the macOS
  System keychain.
- Installs and launches the Android shell while preserving app data and Braze
  SDK device identity by default.

Normal launcher runs intentionally do not uninstall the app, because uninstalling
clears SDK storage and can create another Braze device for the same external
user. Use an explicit destructive reset only for recovery or clean-state testing:

```sh
RESET_APP_DATA=1 node tools/demo-launcher.mjs --pack example-retail --run
```

CLI fallback:

```sh
node tools/demo-launcher.mjs --list
node tools/demo-launcher.mjs --pack example-retail --apply-only
node tools/demo-launcher.mjs --pack example-retail --run
```

All demo packs share the Firebase Android app at
`android-shell/app/google-services.json`. SDK credentials and active user setup
belong in the Control Room. A saved `webURL` is now an explicit advanced local
source override and is shown in diagnostics when active.

REST API keys are only read by the host launcher from a session entry,
`BRAZE_REST_API_KEY_<PACK_ID>`, or `BRAZE_REST_API_KEY`. Legacy
`demo-packs/<pack-id>/secrets.properties` REST keys are ignored unless
`BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY=1` is set. REST keys are never written
into Android resources or bundled web assets.

Message creation still happens in Braze. The launcher only fires SDK events or
calls API-triggered campaign/canvas endpoints with an external user ID and
optional trigger properties.

## Hidden Debug Drawer

Long-press the demo WebView content to open the Android debug drawer. It shows:

- Active demo id, name, config hash, source mode, source URL, and override state.
- Active workspace profile, endpoint, and external ID.
- Last reported Braze SDK device ID in the Control Room Diagnostics view.
- Push permission state.
- FCM token preview/copy once available. FCM token success and failure both post
  structured Control Room telemetry.
- Buttons for IAM trigger event, Content Card refresh, notification permission,
  active profile selection, and recent native logs.

Keep this drawer for Android diagnostics and emergency recovery. The Control Room
is the only normal control surface.

## Braze Dashboard Checks

- Find user `lumo-demo-user` unless your active profile uses another external ID.
- Confirm the Android app install appears on the profile.
- Confirm default demo attributes and focused SDK or REST demo calls arrive.
- Create a test IAM campaign triggered by custom event `demo_iam_trigger`.
- Create Content Cards targeted to the demo user:
  - `extras.placement=home_feed` for the Home recommendation rail.
  - `extras.placement=inbox` for the Inbox tab.
- Confirm the profile becomes push registered after the FCM token is generated.
- Send a push to the same external ID/device after notification permission is granted.

## Pixel 10 Smoke Test

Run on `Pixel_10_Pro` and check:

- Demo screens render without clipping.
- Bottom navigation and Android system bars do not overlap content.
- Horizontal rails scroll without page-level horizontal overflow.
- Keyboard entry in Setup remains usable.
- Hidden debug drawer opens with a long press and dismisses cleanly.
- A foreground push renders through the branded demo banner.

## FCM Troubleshooting

- `google-services.json` must match `applicationId = "com.braze.demoshell"`.
- `firebase.senderId` in `local.properties` must match the Firebase project
  number in `google-services.json`.
- The emulator must have current enough Google Play services. If Logcat says
  `Google Play services out of date` and token retrieval fails with
  `FCM Registration failed!`, use the pinned Firebase Messaging dependency in
  this project or update Play services through the emulator Play Store.
- Use an emulator with Google APIs or Google Play services; plain AOSP images
  cannot complete FCM registration.
- If Logcat shows `net::ERR_CERT_AUTHORITY_INVALID` from `Finsky` or Google Play
  services and FCM fails with `SERVICE_NOT_AVAILABLE`, the emulator cannot trust
  the HTTPS path to Google services. On a Google APIs image launched with a
  writable system partition, run:

  ```sh
  ~/Library/Android/sdk/platform-tools/adb emu kill
  ~/Library/Android/sdk/emulator/emulator -avd Pixel_10_Pro -writable-system -no-snapshot-load -no-snapshot-save
  android-shell/tools/install-zscaler-system-ca.sh
  cd android-shell
  ./gradlew installDebug
  ```

  The helper extracts the Zscaler root from the macOS System keychain, installs
  it into the emulator system CA store, adds the runtime Conscrypt APEX bind
  mount required by newer Android images, and restarts Android framework so
  Google Play services reloads trust. If you fully quit/reboot the emulator,
  rerun the helper before testing FCM again. Alternative fallbacks are a
  different network/hotspot, disabling VPN or TLS-inspection tools, or creating
  a fresh stable Google Play/Google APIs AVD image.

For the usual local demo loop, use the wrapper:

```sh
android-shell/tools/run-demo-emulator.sh
```

It starts `Pixel_10_Pro` with a writable system partition, applies the Zscaler
trust pattern when the root CA exists in the macOS System keychain, installs the
debug APK, and launches the app. Override the AVD with `AVD=Pixel_10_Pro_v36`.

## Repo Hygiene

Do not commit:

- `android-shell/local.properties`
- `android-shell/.active-demo-pack`
- `.demo-launcher/`
- `android-shell/app/google-services.json`
- `demo-packs/*/secrets.properties`
- `web-template/src/brand/activeDemoConfig.generated.ts`
- Firebase service account JSON credentials
- Braze REST keys or workspace keys
- Keystores
- Prospect-private screenshots or brand assets

The checked-in examples are templates only. Real local values are read from
`local.properties` and generated into Android resources at build time.
