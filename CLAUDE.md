# Lumo Demo Shell Instructions

This repository is safe for public source distribution. Keep all credentials and
customer/private demo material out of Git.

## First Run

Use these commands from the repo root:

```sh
./bootstrap-lumo.sh --check
./bootstrap-lumo.sh --install
./bootstrap-lumo.sh --android-avd
npm run lumo:apply
npm run lumo:cockpit
```

Open the Control Room URL printed by the launcher. Use `Lumo` as the base pack.
Treat that launcher process as the sole state, credential, orchestration, and
SDK-command authority. Use the Control Room for setup, authoring, telemetry,
and diagnostics; use its paired Presenter Remote only for the active persona
and approved pinned story controls. Keep Control Room Story Controls collapsed
as the fallback. Do not create a browser extension unless three rehearsals show
repeated window-focus or placement friction; any later wrapper stays thin and
adds no authority.

## Demo Packs

- `demo-packs/` is for sanitized public packs only.
- `.demo-packs/` is the ignored local workspace for Claude-created, imported, or
  customer-specific packs.
- Do not commit `.demo-packs/`, screenshots from customers/prospects, or
  `secrets.properties`.
- Treat demo packs as the source of truth. Applying a pack generates web runtime
  config, runtime manifests, synced assets, Android seed metadata, and iOS
  runtime defaults.
- Do not hand-edit generated runtime files.
- Treat `configHash` as the public configuration fingerprint and `runtimeHash`
  v2 as the active configuration-plus-assets-plus-private-app-surface deployment
  identity. Only active-pack content belongs in generated and packaged output.
- Keep private pack `app-source/` and the fixed mirrored
  `screens/local-pack/` container ignored. Pack apply mirrors only
  `app-source/web-template/src/screens/local-pack/` into that container and
  removes stale private code when the selected pack has no app surface. Add
  bespoke app UI through `screens/local-pack/pack-app.tsx`; do not add imports,
  pack ids, paths, or routing branches for an ignored private pack to tracked code.

## Claude Plugin

Load the repo plugin in Claude Code with:

```sh
claude --plugin-dir ./plugins/braze-demo-builder
```

Then run:

```text
/braze-demo-builder:demo-build
```

When building a new demo story, create or update packs under `.demo-packs/`
unless the user explicitly asks to prepare a sanitized public pack.

## Push And Secrets

- `android-shell/app/google-services.json` is public Firebase Android client
  config for `com.braze.demoshell`.
- Firebase service account JSON is not committed. Teammates receive it outside
  Git only when they need to upload it into their own Braze workspace.
- Braze SDK keys, Braze REST keys, APNs keys, keystores, FCM server keys, and
  Firebase service account JSON must never be written into source files, demo
  packs, Android resources, web assets, or committed files.
- Each local Android emulator/app install generates its own FCM registration
  token. The token is visible in Control Room diagnostics/debug surfaces; it is
  not shared or committed.

## Validation

Before publishing or committing setup changes, run:

```sh
npm run lumo:apply
npm run check:precommit
npm run public:check
cd web-template && npm run build
```

For Android shell, bridge, push, manifest, or launch-flow changes, also run:

```sh
cd android-shell
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin
```

For iOS credential or bridge/runtime-identity contract changes on macOS, run:

```sh
npm run test:ios-contracts
```

`check:precommit` runs the focused launcher/operator/HTTP-boundary, pack, and
emulator-runner tests before runtime validation and the secret scan.
