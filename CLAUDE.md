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
npm run validate:demo-runtime
npm run security:scan
npm run public:check
cd web-template && npm run build
```

For Android shell, bridge, push, manifest, or launch-flow changes, also run:

```sh
cd android-shell
./gradlew :app:compileDebugKotlin
```
