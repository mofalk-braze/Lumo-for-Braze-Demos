# Braze Android Demo Shell

Native Kotlin Android shell for the active Braze demo pack. The app opens full
screen into packaged React/Vite web assets, initializes the Braze Android SDK, registers
Firebase Cloud Messaging when the emulator supports it, and exposes Android-only
diagnostics through a hidden drawer.

## What This Proves

- The active demo renders from packaged Android assets at `file:///android_asset/demo/index.html`.
- The bundled `demo/demo-runtime.json` is Android's canonical runtime identity.
  Missing, malformed, non-v2, incomplete-source metadata, or a noncanonical
  Android bundled URL fails readiness closed;
  `BuildConfig` values remain visible diagnostic context, not a readiness
  fallback.
- Source readiness is real render proof: main-frame completion and JavaScript
  `webReady` must agree on the same canonical document generation, and the
  `webReady` protocol/runtime id/config hash/runtime hash must match the
  canonical packaged manifest. A URL or runtime handshake alone does not mark
  the source ready, and an identity mismatch fails the generation.
- The same web bridge contract works on Android via `window.brazeBridge` and on
  iOS via `window.webkit.messageHandlers.brazeBridge`.
- Workspace profiles use the shared JSON shape:
  `id`, `name`, `apiKey`, `endpoint`, `externalId`, optional advanced `webURL`, `active`.
- `changeUser`, custom attributes, custom events, purchases, IAM trigger events,
  normalized Content Cards, Content Card clicks/impressions, launch-time push
  permission requests, and manual push permission requests route through the
  Android SDK.
- Real Braze push display is native Android notification behavior in foreground,
  background, and locked states. Diagnostics-only previews are explicitly not
  proof of Braze push delivery.

## Lumo Setup

Use the top-level bootstrap path first:

```sh
./bootstrap-lumo.sh --check
./bootstrap-lumo.sh --install
./bootstrap-lumo.sh --android-avd
npm run lumo:cockpit
```

The public distribution commits the shared Firebase Android client config at
`android-shell/app/google-services.json`. Real push in a teammate's own Braze
workspace still requires local Braze SDK credentials for the active pack and the
Firebase service account JSON uploaded into that Braze workspace. The service
account JSON is distributed outside Git.

Each local emulator/app install generates its own FCM registration token. The
Control Room and Android debug drawer surface token readiness for the active
user; FCM registration tokens are not shared or committed.

## Manual Setup Fallback

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
6. Confirm the committed `android-shell/app/google-services.json` exists and
   matches package `com.braze.demoshell`.
7. In Google Cloud, enable Firebase Cloud Messaging API if the shared Firebase
   project has not already been prepared.
8. Create or use the shared Firebase service account with Firebase Cloud
   Messaging send permission.
9. Upload the service account JSON to your Braze workspace under the Android
   app's Push Notification Settings, then delete or secure the local JSON.
10. Provision the dedicated rootable Google APIs emulator:

    ```sh
    android-shell/tools/provision-demo-avd.sh
    ```

    The default target is `Braze_Demo_API_36`, provisioned as a Pixel 10 Pro
    hardware profile on a rootable Android 36.1 `google_apis` image. It does
    not use a Google Play image because Zscaler trust must be installed into
    Android system and Conscrypt trust stores for IAM media and FCM reliability.
11. Run the app, grant the launch-time notification permission prompt, and test
    from the Control Room.

The Gradle build copies `../web-template/dist` into generated Android assets
under `demo/`. Generated and packaged assets contain only the active pack. If
`dist/index.html` is missing, `assembleDebug` fails with a setup message instead
of producing a blank WebView.

## Demo Pack Launcher

From the repo root, start the host-side launcher:

```sh
npm run demo:launcher
```

Open the printed local URL, choose a demo pack, then use the Control Room to
build, launch, author controls, trigger Braze-created messages, and inspect full
telemetry. Open its paired Presenter Remote for the active persona, readiness,
up to seven pinned controls, pre-approved variants, and latest execution result.
Presenter Remote never exposes raw payloads, credentials, pack switching,
custom REST, or raw logs.

The launcher host is the sole state, orchestration, credential, and SDK-command
authority. The CLI, Control Room, and Presenter Remote delegate to that process.
The launcher:

- Generates the active web demo config from `demo-packs/<pack-id>/demo-pack.json`.
- Generates `configHash` as the public configuration fingerprint and
  `runtimeHash` v2 from active configuration, active assets, and the private
  pack app surface when present.
- Generates ignored Android seed config from `demo-packs/<pack-id>/secrets.properties`.
  It retains machine/callback settings, but clears generated SDK key, endpoint,
  and FCM sender values when the selected pack does not provide them; credentials
  never bleed across packs.
- Writes a local Android telemetry callback URL so the emulator can POST
  structured events back to the launcher at `http://10.0.2.2:<port>`.
- Runs at most one web build and one Gradle build per launcher job, reusing
  unchanged output when its inputs match.
- Reuses one healthy expected AVD and cold-boots it only when none is running.
  A wrong, multiple, or offline device fails closed. The default is
  `BRAZE_DEMO_ANDROID_AVD` or `Braze_Demo_API_36`.
- Probes cached Zscaler system and Conscrypt trust during normal `auto` runs.
  Healthy trust requires no restart; restoring only the volatile Conscrypt mount
  restarts Android's framework once and then re-proves boot, Swipe/keyguard,
  and unlocked-user health. First-time or broken persistent trust requires
  explicit repair.
- Compares local and installed APK hashes, skips an identical install, or runs
  one `adb install -r` with the prebuilt APK.
- Force-stops the target package immediately after device selection, before
  boot/trust preparation, so a failed run cannot leave an old app visible.
- Enforces and verifies shown, private, silent, non-minimal lock-screen
  notification settings while retaining non-secure Swipe keyguard behavior. It
  also enables and verifies the expected AVD's exposed tap-to-wake setting;
  physical double-tap gesture proof remains a manual smoke check.
- Performs one foreground network-clock check, then lets the persistent
  launcher authority own and reuse one non-detached watcher for the selected
  emulator. A one-shot CLI run keeps that coverage through readiness and stops
  it before exit. Native runtime preparation remains one correlated command,
  and launch preserves app data and Braze SDK device identity by default.
- Reports correlated source success only after the requested document has both
  completed main-frame navigation and emitted `webReady`; load failure or a
  source mismatch fails the transition instead of reusing stale evidence.

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

All demo packs share the Firebase Android client app at
`android-shell/app/google-services.json`. SDK credentials and active user setup
belong to the host launcher and are administered through the Control Room.

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

- Active demo id, name, config hash, runtime hash, source mode, source URL, and
  override state.
- Active workspace profile, endpoint, and external ID.
- Last reported Braze SDK device ID in the Control Room Diagnostics view.
- Push permission state.
- FCM token preview/copy once available. FCM token success and failure both post
  structured Control Room telemetry.
- Buttons for IAM trigger event, Content Card refresh, notification permission,
  active profile selection, and recent native logs.

Keep this drawer for Android diagnostics and emergency recovery. Use the Control
Room for administration and Presenter Remote for the approved live-story
controls; neither client bypasses the launcher authority.

## Braze Dashboard Checks

- Find the active pack user external ID from the Control Room or pack defaults.
- Confirm the Android app install appears on the profile.
- Confirm default demo attributes and focused SDK or REST demo calls arrive.
- Create a test IAM campaign triggered by custom event `demo_iam_trigger`.
- Create Content Cards targeted to the demo user with `extras.placement` values
  declared by the active pack's `content.contentCardSurfaces`; `inbox` remains
  the default inbox-style placement and legacy packs may still use `home_feed`.
- Confirm the profile becomes push registered after this emulator's FCM token is generated.
- Send a push to the same external ID/device after notification permission is granted.
- For visible heads-up demo pushes, create/select Android notification channel
  `braze_demo_high_v1` in the Braze push composer. Android may otherwise fall
  back to Braze's default `com_appboy_default_notification_channel`, which can
  post to the notification shade without appearing over the current screen.
- If the latest push diagnostics report
  `com_appboy_default_notification_channel`, the Braze push step is still using
  the wrong Android channel for a heads-up/lock-screen demo. The app uses
  `braze_demo_high_v1` as its FCM fallback channel and for foreground native
  display, but an explicit channel selected in Braze wins for background and
  locked delivery.
- For lock-screen testing, put the emulator on an actual Android keyguard with
  lock-screen notifications enabled. Use a non-secure Swipe lock, not None. If
  no keyguard is configured, a notification can wake the screen back to the last
  app surface even though the notification has not auto-opened the app.
- If the AVD still has a PIN, password, or pattern, migrate it once through
  `Settings > Security & privacy > Device unlock > Screen lock`: authenticate,
  then select Swipe. The launcher never stores, hardcodes, guesses, or types the
  credential.

## Pixel 10 Smoke Test

Run on `Pixel_10_Pro` and check:

- Demo screens render without clipping.
- Bottom navigation and Android system bars do not overlap content.
- Horizontal rails scroll without page-level horizontal overflow.
- Keyboard entry in Setup remains usable.
- Hidden debug drawer opens with a long press and dismisses cleanly.
- A real Braze push received while the app is foregrounded renders as a native
  Android notification.
- A real Braze push received while the app is backgrounded or locked remains a
  native Android notification until the user taps it; the tap deeplink then
  routes the WebView.

## FCM Troubleshooting

- `google-services.json` must match `applicationId = "com.braze.demoshell"`.
- `firebase.senderId` in `local.properties` must match the Firebase project
  number in `google-services.json`.
- The emulator must have current enough Google Play services. If Logcat says
  `Google Play services out of date` and token retrieval fails with
  `FCM Registration failed!`, use the pinned Firebase Messaging dependency in
  this project or update Play services through the emulator Play Store.
- Use the dedicated rootable Google APIs emulator. Plain AOSP images cannot
  complete FCM registration, and Google Play images cannot be rooted/remounted
  for Zscaler system trust.
- If Logcat shows `net::ERR_CERT_AUTHORITY_INVALID` from `Finsky` or Google Play
  services and FCM fails with `SERVICE_NOT_AVAILABLE`, the emulator cannot trust
  the HTTPS path to Google services. Provision and launch the dedicated AVD:

  ```sh
  android-shell/tools/provision-demo-avd.sh
  android-shell/tools/run-demo-emulator.sh
  ```

  A normal wrapper run uses `TRUST_MODE=auto`: healthy prepared system and
  Conscrypt trust require no restart. If only the volatile Conscrypt mount is
  missing, `auto` restores it, restarts Android's framework once, then repeats
  the full boot, Swipe/keyguard, and unlocked-user checks without rebooting or
  disabling verity. If it asks for persistent repair, run once with
  `TRUST_MODE=repair`; that path repeats the same health checks after repair.
  Then return to the normal launcher. `TRUST_MODE=skip` deliberately leaves
  trust unchanged.
  Alternative fallbacks are a different network/hotspot or disabling
  VPN/TLS-inspection tools.

For the usual local demo loop, use the wrapper:

```sh
android-shell/tools/run-demo-emulator.sh
```

It reuses a healthy `Braze_Demo_API_36` or starts it once with a writable system
partition, Pixel 10 Pro skin, and rootable Google APIs image. It checks trust,
uses an explicit prebuilt `APK_PATH` only when `INSTALL_APP=1`, performs one
foreground network-clock check, and launches without clearing app data. The
wrapper never detaches a watcher. A persistent Control Room launcher owns the
single continuous watcher, reuses or replaces it by emulator serial, and stops
it on shutdown. The launcher sets install inputs after comparing APK hashes;
the wrapper does not invoke Gradle. Override the AVD only with a rootable Google
APIs image:

```sh
BRAZE_DEMO_ANDROID_AVD=Braze_Demo_API_36 android-shell/tools/run-demo-emulator.sh
```

For a deliberate one-time trust repair:

```sh
TRUST_MODE=repair android-shell/tools/run-demo-emulator.sh
```

## Diagnostics-Only Live Web

After one healthy bundled deployment, Diagnostics can point Android at the
launcher's local Vite server for a fast UI-only loop. The app and Control Room
show `DEV OVERRIDE` while this source is active. Only a validated local origin
is accepted, and the override does not change the active pack or SDK identity.

Return to packaged `file:///android_asset/demo/index.html` before rehearsal or
handoff. The normal command remains the bundled proof:

```sh
node tools/demo-launcher.mjs --pack example-retail --run
```

If an older `Braze_Demo_API_36` was created with the wrong hardware profile,
recreate only that AVD once:

```sh
RECREATE_AVD=1 android-shell/tools/provision-demo-avd.sh
```

## Validation

For Android source or launch-flow changes, run the render-state unit tests and
compile gate before device QA:

```sh
cd android-shell
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin
```

The host-side `npm run test:capabilities` suite separately covers emulator
runner fail-closed behavior, launcher/operator logic, Presenter Remote, and
HTTP request/session boundaries.

## Repo Hygiene

Do not commit:

- `android-shell/local.properties`
- `android-shell/.active-demo-pack`
- `.demo-launcher/`
- `demo-packs/*/secrets.properties`
- `web-template/src/brand/activeDemoConfig.generated.ts`
- Firebase service account JSON credentials
- FCM server keys or owner/admin service-account material
- FCM registration tokens
- Braze REST keys or workspace keys
- Keystores
- Prospect-private screenshots or brand assets

The shared demo-shell `android-shell/app/google-services.json` is committed
because it is Firebase client app config for `com.braze.demoshell`, not a
service-account credential. Real local SDK values are read from
`local.properties`, ignored pack `secrets.properties`, or Control Room session
state and generated into Android resources at build time.
