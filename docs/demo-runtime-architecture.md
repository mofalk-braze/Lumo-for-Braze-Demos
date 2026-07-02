# Unified Demo Runtime Architecture

The demo pack is the source of truth. Applying a pack generates the web config,
public runtime manifest, Android seed metadata, iOS runtime defaults, and synced
demo assets from a committed `demo-packs/<pack>/demo-pack.json` or ignored local
`.demo-packs/<pack>/demo-pack.json`.

## Ownership

- Braze Demo Control Room owns setup, orchestration, event presets, staged demo
  controls, REST triggers, validation, build/run actions, and the Activity Feed.
- Browser/web renders the active demo only. It may use the phone frame, but it
  does not expose setup or presenter controls.
- Android renders packaged web assets from `file:///android_asset/demo/index.html`
  and keeps a hidden diagnostics drawer for demo id/hash/source, SDK state, push
  permission/token, bridge logs, reload/reset-style recovery, and explicit local
  source override visibility.
- iOS renders Vite at `http://localhost:5173` during development until bundled
  iOS assets are added. It reports the same runtime id/hash/source in the bridge
  connection and surfaces WebView load failures.

## Control Room IA

The Control Room is the only product control surface. Its default view is
setup-first and cockpit-like rather than a preset wall:

- Demo Cockpit: active pack, user, actionable readiness, pinned story controls,
  latest Activity Feed, and apply/build/run actions.
- Activity Feed: audience-readable proof for meaningful SDK and REST actions,
  message display, user actions, profile updates, triggers, and launch outcomes.
  Bridge handshakes, runtime reports, token registration, refresh chatter, hashes,
  and raw telemetry belong in Diagnostics. The launcher normalizes feed rows into
  `category`, `severity`, `displayTitle`, `displaySummary`, and `primaryContext`
  from demo pack, launcher, Android, iOS, REST, and callback telemetry before the
  Control Room renders them. Categories are `launcher`, `sdk`, `rest`, `message`,
  `profile`, `content_cards`, `push`, `diagnostics`, and `error`; severities are
  `success`, `error`, `warning`, and `info`. Feed rows remain strictly newest
  first by timestamp in v1; related events are not grouped or reordered.
- Control Templates: compact template overview for standard brand-agnostic
  templates, pack controls, staged demo controls, visibility controls, and
  promotion into reusable pack presets. Tailoring happens in an embedded editor
  with payload preview and validation feedback, so operators do not leave the
  template overview to edit a staged control.
- Diagnostics: runtime contract, expected render sources, native SDK device ID,
  native diagnostic boundary, advanced override visibility, bridge/debug events,
  job logs, and REST response history.

Preset cards remain available, but they are shortcuts. New controls should only
be added when they provide clear operating value in a live demo.

## Runtime Manifest

`web-template/public/demo-runtime.json` contains:

- `id`, `name`, `description`
- `configHash`
- `generatedAt`
- `assetBase`
- `sourceMode`
- `expectedSources.browser`
- `expectedSources.android`
- `expectedSources.ios`

Browser, Android, iOS, and Control Room should report the same id/hash unless an
explicit local override is active and visible in diagnostics.

## Bridge Sync Contract

Native/web identity sync uses a small metadata envelope on top of the existing
`brazeBridge` / `window.__brazeBridge` contract. The protocol is
`braze-demo-sync/v1` and every identity handoff carries `sessionId`,
`runtimeId`, `configHash`, `authority`, `reason`, and `timestamp`.

The web bridge owns browser-origin identity requests through one helper. It
trims external IDs, never lowercases them, dedupes repeated identity signatures,
and suppresses native echo loops. Android and iOS remain the only Braze SDK
owners: they execute `changeUser`, events, purchases, push, and Content Cards,
then echo runtime id/hash and sync metadata back through connection diagnostics.

Native launch flows preserve SDK storage by default so a repeated demo on the
same emulator or simulator reports the same Braze SDK device ID for the active
external user. Destructive resets are explicit recovery/testing actions only.
Android exposes this through `RESET_APP_DATA=1`; iOS simulator installs already
preserve app data unless the simulator/app data is erased outside the launcher.

Control Room commands use `authority=control_room` and `reason=command`. The
Control Room remains the only presenter/operator surface; app UI stays product
focused and only sends identity changes when they are real in-product actions.

## Runtime, Trust, And Push Readiness

The Control Room blocks live controls until the selected native surface reports
the active runtime. The selected platform must echo the expected pack id, config
hash, source URL, and applied External User ID. A stale installed app, stale
pack hash, wrong source override, or un-applied user is a readiness blocker, not
only a diagnostic warning.

Applying identity sends `changeUser`, requests a Content Cards refresh, and
requests native trust and push readiness. Android runs HTTPS diagnostics against
Braze image media and Firebase-relevant endpoints on launch, web-ready, user
changes, and explicit readiness commands. Failed Android TLS diagnostics block
IAM media validation and push-dependent controls because the SDK may be able to
track an event while media fetches or Firebase token services still fail.

When the host has a Zscaler root CA, `android-shell/tools/run-demo-emulator.sh`
requires the dedicated rootable Google APIs emulator by default:
`Braze_Demo_API_36`, or `BRAZE_DEMO_ANDROID_AVD` when deliberately overridden.
`android-shell/tools/provision-demo-avd.sh` creates this AVD from a
Pixel 10 Pro hardware profile on a rootable Android 36.1 `google_apis` system
image and rejects Google Play images. The wrapper starts with a writable system
partition, runs `install-zscaler-system-ca.sh`, and fails before app
install/launch if Android system trust, Conscrypt trust, or the Android-side
HTTPS smoke checks fail. Google Play/production images are not supported for
this corporate-network push/IAM validation path because they cannot run
`adb root` or remount the system trust store. Preserving app data remains the
default; clearing SDK storage is an explicit recovery action only.

Android refreshes the current Firebase token on launch, resume, web-ready, user
changes, and explicit readiness commands; it rebinds the current token to Braze
and retries transient `SERVICE_NOT_AVAILABLE` failures with visible telemetry.
iOS uses the same command surface for APNs: when notification permission allows
it, the shell calls remote-notification registration and reports the APNs
callback state.

Push token readiness is tracked by platform, SDK device ID, and external user.
Controls can opt into `requiresPushToken: true`; those controls are blocked
until native token telemetry is successful for the active user. Generic campaign
and Canvas REST triggers are still runnable because the Control Room cannot know
their message channel from the Braze ID alone, but the editor warns that push
readiness will not block them unless the control is marked push-dependent.

## Drift Prevention

Use the host Control Room or CLI:

```sh
node tools/demo-launcher.mjs --pack wolt-food-delivery --apply-only
npm run validate:demo-runtime
```

Validation checks pack ids, required fields, active pack consistency, generated
web config, runtime manifest, Android seed metadata, iOS runtime defaults, built
web output, packaged Android assets, and stale legacy generated assets.

SDK secrets stay in ignored `secrets.properties`, native local config, or user
defaults. REST API keys are host-only session or environment values by default;
legacy pack-stored REST keys are ignored unless explicitly enabled. Firebase
service account JSON stays outside Git and is uploaded manually into a Braze
workspace when Android push must be configured there. Secrets are never
generated into web assets.
