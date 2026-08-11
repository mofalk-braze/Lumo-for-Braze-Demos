# Unified Demo Runtime Architecture

The demo pack is the source of truth. Applying a pack generates the web config,
public runtime manifest, Android seed metadata, iOS runtime defaults, and synced
demo assets from a committed `demo-packs/<pack>/demo-pack.json` or ignored local
`.demo-packs/<pack>/demo-pack.json`.

## Ownership

- The launcher host process is the sole state, orchestration, credential, and
  SDK-command authority. CLI requests and local browser clients delegate to
  that process instead of creating a second state owner.
- Braze Demo Control Room is the administrative client. It provides pack setup,
  payload and template authoring, build/run actions, complete telemetry,
  diagnostics, and recovery operations.
- Presenter Remote is a thin paired operator client. It exposes the active
  pack, platform, persona, readiness, at most seven pinned story controls,
  pre-approved variants, and the latest correlated result. It never exposes
  credentials, raw payloads, arbitrary users, pack switching, custom REST, or
  full logs.
- Browser/web renders the active demo only. It may use the phone frame, but it
  does not expose setup or presenter controls.
- Android renders packaged web assets from `file:///android_asset/demo/index.html`
  and keeps a hidden diagnostics drawer for demo id/hash/source, SDK state, push
  permission/token, bridge logs, reload/reset-style recovery, and explicit local
  source override visibility.
- iOS renders Vite at `http://localhost:5173` during development until bundled
  iOS assets are added. It reports the same runtime id/hash/source in the bridge
  connection and surfaces WebView load failures.

Private pack-owned product surfaces stay in ignored `app-source/`. Pack apply
mirrors only `app-source/web-template/src/screens/local-pack/` into the one
ignored working container, `screens/local-pack/`, and removes that container
when the selected pack has no app surface. Its
`pack-app.tsx` adapter exports the active pack id and default component.
`packSurfaceRegistry.ts` discovers that fixed adapter eagerly; tracked routes,
ignore rules, and `App.tsx` stay free of imports, ids, paths, and router branches
belonging to an ignored private pack. A stale local adapter is inert
because the registry resolves it only when its exported pack id equals the
active runtime pack id.

## Operator IA

The launcher serves two local clients from one authority. The Control Room is
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
  template overview to edit a staged control. The built-in
  `Sync demo seed attributes` template derives its SDK attribute payload from
  the active pack's `brand.demoUser.attributes`; running it is explicit and
  the Activity Feed shows the attribute names and values that were applied.
- Diagnostics: runtime contract, expected render sources, native SDK device ID,
  native diagnostic boundary, advanced override visibility, bridge/debug events,
  job logs, and REST response history.

Presenter Remote is an additive compact view for the live story. It pairs with
the current launcher session, receives a narrow `operator/v1` snapshot and
delta stream, and submits idempotent control or known-persona requests. The
launcher rechecks the pack, runtime hash, source, platform, user, trust, push,
and credential requirements before every execution. A stale or disconnected
client fails closed. Launcher instance and execution identifiers correlate the
request, native telemetry, and visible result.

The launcher remains bound to loopback. Exact Host and Origin checks protect
both browser clients, and Presenter Remote also requires a scoped, same-origin
paired session. Collapsed Story Controls remain available in the Control Room
as the fallback operator path.

Presenter Remote remains a standalone launcher-served window. Do not package
it as a Chrome extension until three rehearsals show repeated focus or placement
friction. If that threshold is met, the only supported next step is a thin
side-panel wrapper around the same paired client and `operator/v1` API. The
wrapper must not own state, credentials, readiness, execution, or a second API.

Preset cards remain available, but they are shortcuts. New controls should only
be added when they provide clear operating value in a live demo.

## Runtime Manifest

`web-template/public/demo-runtime.json` contains:

- `id`, `name`, `description`
- `configHash`
- `runtimeHashVersion`, `runtimeHash`
- `generatedAt`
- `assetBase`
- `sourceMode`
- `expectedSources.browser`
- `expectedSources.android`
- `expectedSources.ios`

`configHash` is the public configuration fingerprint. `runtimeHash` v2 is the
deployment identity and covers the active configuration, the active pack's
assets, and its private `app-source/web-template/src/screens/local-pack/`
surface when present. `generatedAt` is presentation metadata and does not create
a semantic change. Applying a pack writes only when semantic content changes,
removes inactive pack assets and stale private app source from generated output,
and packages only the active pack.

Android reads the packaged `demo/demo-runtime.json` as canonical runtime
metadata. If that manifest is missing, malformed, not schema/runtime-hash v2,
lacks a nonblank browser/Android/iOS expected source, or does not name
`file:///android_asset/demo/index.html` as its Android source, native readiness fails closed.
BuildConfig mirrors remain diagnostic context only and cannot replace an
invalid bundled manifest for readiness.

Browser, Android, iOS, Control Room, and Presenter Remote should report the same
id and runtime hash unless an explicit local override is active and visible in
diagnostics. Older hash-only telemetry may fall back to `configHash` during the
migration, but new generated runtimes use `runtimeHash` v2.

## Bridge Sync Contract

Native/web identity sync uses a small metadata envelope on top of the existing
`brazeBridge` / `window.__brazeBridge` contract. The protocol is
`braze-demo-sync/v1` and every identity handoff carries `sessionId`,
`runtimeId`, `configHash`, `runtimeHash`, `authority`, `reason`, and `timestamp`.

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

Host commands carry launcher and execution correlation metadata. Control Room
and Presenter Remote both request work from the launcher authority; native
shells still execute SDK actions and report their completion. App UI stays
product focused and only sends identity changes when they are real in-product
actions.

## Runtime, Trust, And Push Readiness

The launcher blocks live controls until the selected native surface reports the
active runtime. The selected platform must echo the expected pack id, runtime
hash, source URL, and applied External User ID. A stale installed app, stale
runtime hash, wrong source override, or un-applied user is a readiness blocker,
not only a diagnostic warning. Both clients render this server-owned result;
they do not independently decide readiness.

SDK credentials are also selected-pack state. Apply retains machine-local
`sdk.dir` and the current launcher callback, but never inherits a previous
pack's Android SDK key, endpoint, or FCM sender id when the selected pack omits
them. A changed generated credential context reconciles the deterministic
generated profile when complete, or clears the implicit active selection while
preserving saved profiles when incomplete. Both shells report only a one-way,
platform-scoped SDK credential-context fingerprint; neither exposes the SDK key
or endpoint. Launcher and Presenter readiness require the selected platform's
proof to match the current pack rather than accepting any previously saved
workspace.

Runtime identity is necessary but does not prove that the intended page
rendered. Both native shells use generation-scoped source evidence. A source
becomes ready only when main-frame completion and the JavaScript `webReady`
bridge signal report the same canonical document URL for the same generation.
Before `webReady` can satisfy that generation, Android validates its protocol,
runtime id, config hash, and runtime hash against the canonical packaged
manifest; iOS validates the same fields against its generated `Config` runtime.
Missing or mismatched identity fails the current generation and never emits
render success. The launcher preserves that sync identity and independently
requires it to match native runtime telemetry. A load error, mismatched source,
superseded command, or process restart also fails closed; old source evidence
cannot satisfy a new execution. Terminal telemetry preserves launcher and
execution correlation.

iOS `runtime_ready` callbacks may reach the launcher out of order. The launcher
therefore replaces iOS render evidence monotonically: it orders web sessions by
the `webReady` timestamp, then orders callbacks within one session by render
generation. A delayed success from an older session or generation cannot
replace a newer failure. Launcher and execution correlation remain part of the
evidence and the correlated launch wait. Each iOS `prepareRuntime` command owns
one reload generation; native attaches that command's launcher/execution ids to
the terminal render success or failure, and the launcher ignores render evidence
for every other execution. A new execution cannot make an older callback current.

Applying identity sends `changeUser`, requests a Content Cards refresh, and
requests native trust and push readiness. Android runs HTTPS diagnostics against
Braze image media and Firebase-relevant endpoints on launch, web-ready, user
changes, and explicit readiness commands. Failed Android TLS diagnostics block
IAM media validation and push-dependent controls because the SDK may be able to
track an event while media fetches or Firebase token services still fail.

Pack `brand.demoUser.attributes` are not replayed automatically on app ready,
identity resolution, relaunch, or Content Card refresh. They are seed data for
presenter-controlled setup. Use the Control Room's `Sync demo seed attributes`
template when a demo needs to write the pack defaults to Braze through the
native SDK.

When the host has a Zscaler root CA, `android-shell/tools/run-demo-emulator.sh`
requires the dedicated rootable Google APIs emulator by default:
`Braze_Demo_API_36`, or `BRAZE_DEMO_ANDROID_AVD` when deliberately overridden.
`android-shell/tools/provision-demo-avd.sh` creates this AVD from a Pixel 10 Pro
hardware profile on a rootable Android 36.1 `google_apis` system image and
rejects Google Play images.

The launcher reuses one healthy expected AVD and cold-boots only when none is
connected. A wrong, multiple, or offline device fails closed. Gradle builds the
APK once. The launcher compares local and installed APK hashes, skips an
identical install, or passes one prebuilt APK to one `adb install -r` while
preserving app data. The emulator wrapper never invokes Gradle.

`TRUST_MODE=auto` is the normal path. Healthy prepared system and Conscrypt
trust require no restart. When only the volatile Conscrypt mount is missing,
`auto` restores it and restarts Android's framework once without rebooting or
disabling verity; the wrapper then repeats boot, Swipe/keyguard, and unlocked
user validation. First-time or broken persistent trust requires an explicit
`TRUST_MODE=repair` run followed by the same validation. Use `TRUST_MODE=skip`
only when deliberately bypassing host trust preparation. The
emulator wrapper performs one foreground network-clock check and never detaches
a watcher. While a persistent Control Room authority is active, the launcher
owns one non-detached watcher keyed by emulator serial, reuses or replaces it,
removes legacy exact-path detached watchers after acquiring authority, and
stops its child on close or shutdown. A one-shot CLI run owns coverage through
readiness and exits without leaving an orphan.

Keep the AVD on a non-secure Swipe lock, not None, so Android keyguard and
lock-screen notifications remain available. On each preparation pass the runner
idempotently enables and verifies shown, private, silent, non-minimal lock-screen
notification settings. It sets and verifies the expected AVD's known secure
tap-to-wake keys even when they were initially unset; an unset optional system
compatibility key is left alone. It also force-stops the target app immediately after
device selection, before boot or trust work, so a failed launch cannot leave a
stale runtime visible. The launcher never stores,
hardcodes, guesses, or types a PIN. If a secure credential exists, migrate it
once on the emulator through Settings: authenticate, select Swipe, and rerun the
launcher. Preserving app data remains the default; clearing SDK storage is an
explicit recovery action only.

Android requests push/trust readiness once after the first rendered `webReady`
and on explicit preparation/readiness commands. Notification-permission success
also requests the token. A real user change rebinds any already known token to
the new Braze identity without starting redundant launch/resume refreshes, and
transient `SERVICE_NOT_AVAILABLE` failures retry with visible telemetry. iOS
uses the same command surface for APNs: when notification permission allows it,
the shell calls remote-notification registration and reports the APNs callback
state.

Push token readiness is tracked by platform, SDK device ID, and external user.
Controls can opt into `requiresPushToken: true`; those controls are blocked
until native token telemetry and notification display diagnostics are successful
for the active user. On Android this includes notification permission, app-level
notification enablement, and the configured notification channel state. The
default high-visibility demo channel is `braze_demo_high_v1`; Braze campaigns
and Canvas steps that should appear as heads-up notifications should select that
channel instead of relying on the SDK fallback
`com_appboy_default_notification_channel`. Generic campaign and Canvas REST
triggers are still runnable because the Control Room cannot know their message
channel from the Braze ID alone, but the editor warns that push readiness will
not block them unless the control is marked push-dependent. `/users/export/ids`
push-token gaps are shown as warnings when local Android SDK token/display
readiness is current, because Braze export visibility can lag local device
telemetry.

## Android Live Development

After a successful bundled deployment, Diagnostics may enable an Android-only
local Vite source override. The native drawer and launcher diagnostics must show
`DEV OVERRIDE` for the entire session, and only an explicitly validated local
development origin may be used. UI changes can then load without rebuilding or
reinstalling the APK.

Stopping Vite or closing the launcher does not prove that Android returned to
its bundled source. Shutdown persists `overrideMayBeActive` as an uncertain
hazard across the next launcher start. Only correlated native proof of
`file:///android_asset/demo/index.html` for the expected pack and runtime may
clear that hazard; until then apply-only, pack switching, iOS work, and
Presenter readiness remain blocked.

Disable the override and return to packaged
`file:///android_asset/demo/index.html` before rehearsal or handoff. Bundled
mode, the normal readiness contract, and the unchanged pack launch command are
the release proof. No analogous override is added for iOS because iOS currently
loads the local Vite development server by design; bundled iOS assets remain a
separate future capability.

## Drift Prevention

For work against an already installed mobile demo, the bundled
`assets/demo/demo-runtime.json` is the target identity. Confirm its pack id
before editing a local customer pack, then apply and deploy that same pack.
A matching brand name, a handoff directory, or an archived asset bundle is not
evidence that it is the installed runtime.

Presenter expectations are computed from the currently selected pack on every
snapshot. The generated public `demo-runtime.json` is reused only when its pack
id, config hash, and runtime hash all match that fresh computation. Config or
active-asset drift therefore changes the expected identity immediately and
blocks stale installed or generated runtime evidence.

Use the host Control Room or CLI:

```sh
node tools/demo-launcher.mjs --pack example-retail --apply-only
npm run validate:demo-runtime
```

Validation checks pack ids, required fields, active pack consistency, generated
web config, runtime manifest and hash, Android seed metadata, iOS runtime
defaults, built web output, packaged Android assets, active-pack-only asset
isolation, and stale legacy generated assets.

`npm run test:capabilities` exercises launcher/operator and HTTP Host, Origin,
session, pairing, allow-list, context, and idempotency boundaries, plus pack
idempotence, Presenter rendering, and emulator-runner behavior. Android native
render generations are covered by `:app:testDebugUnitTest`. On macOS,
`npm run test:ios-contracts` compiles and runs the Swift credential-store and
web-ready identity contracts. These tests prove bounded contracts; bundled
device rehearsals remain the proof of installed identity, rendered source,
trust, push, and live story behavior.

SDK secrets stay in ignored `secrets.properties`, native local config, or user
defaults. REST API keys are host-only session or environment values by default;
legacy pack-stored REST keys are ignored unless explicitly enabled. Firebase
service account JSON stays outside Git and is uploaded manually into a Braze
workspace when Android push must be configured there. Secrets are never
generated into web assets.
