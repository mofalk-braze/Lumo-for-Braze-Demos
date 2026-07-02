# Lumo Public Quickstart

Lumo is distributed as public source plus off-repo secrets. Teammates should be
able to clone the repo, install dependencies, apply the sanitized Lumo pack, and
launch the Web Demo Cockpit and Android shell locally.

## Fresh Machine Flow

```sh
git clone <repo-url>
cd Android-Demos
./bootstrap-lumo.sh --check
./bootstrap-lumo.sh --install
./bootstrap-lumo.sh --android-avd
npm run lumo:apply
npm run lumo:cockpit
```

Open the Control Room URL printed by the launcher, select `Lumo`, then use Apply
or Launch.

## Claude Setup

From the repo root:

```sh
claude --plugin-dir ./plugins/braze-demo-builder
```

Inside Claude Code, run:

```text
/braze-demo-builder:demo-build
```

Claude-created, imported, or customer-specific packs belong in `.demo-packs/`.
That directory is ignored and must stay local. Only sanitized public packs belong
under `demo-packs/`.

## What Comes From Git

- Web template, Android shell, iOS shell, launcher tools, bootstrap scripts, and
  documentation.
- `android-shell/app/google-services.json` for the shared Firebase Android app
  package `com.braze.demoshell`.
- `demo-packs/Lumo/demo-pack.json`, which contains no customer assets or
  credentials.

## What Must Stay Outside Git

- Firebase service account JSON.
- Braze REST API keys.
- Braze SDK API keys and endpoints.
- FCM server keys.
- APNs `.p8`, certificates, provisioning profiles, and Apple signing material.
- `android-shell/local.properties`.
- `ios-shell/Sources/Config.swift`.
- `demo-packs/*/secrets.properties` and `.demo-packs/*/secrets.properties`.
- Customer/prospect demo packs, screenshots, and assets.

## Android Push In Your Own Braze Workspace

Lumo uses the shared Firebase project `braze-sc-demo-shell` and Android package
`com.braze.demoshell`.

To send real Android push from your own Braze workspace:

1. Get the Firebase service account JSON outside Git.
2. Upload that JSON in Braze Android Push Settings for your workspace.
3. Enter your Braze Android SDK API key and endpoint locally through the Control
   Room or an ignored pack `secrets.properties`.
4. Launch Android through the Control Room.
5. Grant notification permission in the emulator.
6. Verify Control Room diagnostics show native runtime ready, SDK device ID, and
   FCM token present for the active external ID.
7. Send push from Braze to that active user/device.

Each teammate's emulator generates its own FCM registration token. Do not copy a
token from another machine, and do not commit or share tokens.

If Slack is used as a last-resort service-account handoff, use a short-lived
SolCon key, share it only with the small setup group, and rotate/delete it after
setup. Prefer a password manager or other audited secret handoff when available.

## Zscaler And Pixel 10 Emulator

The supported Android path is the dedicated rootable Google APIs Pixel 10 AVD:
`Braze_Demo_API_36`.

```sh
./bootstrap-lumo.sh --android-avd
npm run lumo:launch:android
```

The launch wrapper starts the emulator with a writable system partition, installs
the macOS Zscaler Root CA into Android system and Conscrypt trust stores when
present, runs HTTPS smoke checks for Braze media and Firebase endpoints, then
installs and launches the app. App data is preserved by default so Braze SDK
device identity and FCM registration stay stable across launches.

## Public Release Checks

Before publishing or cutting a shared handoff:

```sh
npm run lumo:apply
npm run validate:demo-runtime
npm run security:scan
npm run public:check
cd web-template && npm run build
```

`git status --short --ignored` should show `.demo-packs/` as ignored, not as
untracked files.
