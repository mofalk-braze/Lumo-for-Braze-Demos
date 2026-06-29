# Unified Demo Runtime Architecture

The demo pack is the source of truth. Applying a pack generates the web config,
public runtime manifest, Android seed metadata, iOS runtime defaults, and synced
demo assets from `demo-packs/<pack>/demo-pack.json`.

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
- Controls & Payloads: one-action builder for focused SDK commands, focused Braze
  REST calls, and safe custom REST requests with editable payload preview and
  validation feedback.
- Activity Feed: audience-readable proof for meaningful SDK and REST actions,
  message display, user actions, profile updates, triggers, and launch outcomes.
  Bridge handshakes, runtime reports, token registration, refresh chatter, hashes,
  and raw telemetry belong in Diagnostics.
- Control Templates: standard brand-agnostic templates, pack controls, staged
  demo controls, visibility controls, and promotion into reusable pack presets.
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
legacy pack-stored REST keys are ignored unless explicitly enabled. Secrets are
never generated into web assets.
