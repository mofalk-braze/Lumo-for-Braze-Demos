# SolCon Onboarding

This legacy SolCon note is kept for compatibility. The current public teammate
setup is `docs/lumo-public-quickstart.md`.

This repo is distributed as public source plus off-repo secrets. Colleagues
should be able to clone it, run the bootstrap checks, apply the sanitized Lumo
pack, and launch the native shells.

## Fresh Machine Flow

```sh
git clone <private-repo-url>
cd Android-Demos
./bootstrap-solcon.sh --check
./bootstrap-solcon.sh --install
./bootstrap-solcon.sh --android-avd
npm run lumo:cockpit
```

Open the Control Room URL printed by the launcher, select `Lumo`, then
use Apply or Launch.

## What Comes From Git

- Web template, Android shell, iOS shell, launcher tools, bootstrap scripts, and
  documentation.
- `android-shell/app/google-services.json` for the shared Lumo Firebase
  Android app (`com.braze.demoshell`).
- `demo-packs/Lumo/demo-pack.json`, which contains no customer assets or
  credentials.

## What Must Stay Local

- Braze REST API keys.
- Firebase service account JSON and any legacy FCM server keys.
- APNs `.p8`, certificates, provisioning profiles, and Apple signing material.
- `android-shell/local.properties`.
- `ios-shell/Sources/Config.swift`.
- `demo-packs/*/secrets.properties`.
- Customer/prospect demo packs and assets.

## Credential Model

`google-services.json` is committed because it is Firebase client app config and
is embedded in the Android APK. It is required for Android Firebase
initialization and FCM token generation, but it is not a Firebase service
account key.

Real Android push in a teammate's own Braze workspace still needs two things
outside the repo:

- Braze Android SDK API key and endpoint entered/imported locally through the
  Control Room or an ignored pack `secrets.properties`.
- Firebase service account JSON uploaded into that Braze workspace for the
  shared Android app. Distribute the JSON outside Git and rotate/delete
  short-lived SolCon handoff keys after the event.

Each teammate's emulator generates its own FCM registration token. Tokens are
shown in local diagnostics/debug surfaces and must not be shared or committed.

REST API keys remain host-only. Enter them in the Control Room session or export
`BRAZE_REST_API_KEY_<PACK_ID>` / `BRAZE_REST_API_KEY`; do not write them into
packs or source files.

## Capability Matrix

- Web shell: available after Node/npm and web dependencies are installed.
- Android shell: available after Android SDK tooling, Java 17, the dedicated AVD,
  and the Lumo pack are applied.
- Android push: available after Android shell readiness plus local Braze SDK
  credentials and Braze-side Firebase setup.
- iOS shell: available for unsigned simulator builds after Xcode and `xcodegen`.
- iOS push: pending a dedicated Apple Developer signing path/APNs setup.

## Troubleshooting

Run the doctor at any time:

```sh
npm run doctor
```

Common remediation:

- Missing Node/Homebrew: install Homebrew from `https://brew.sh`, then run
  `./bootstrap-solcon.sh --install`.
- Missing Xcode license/first launch: open Xcode once or run
  `sudo xcodebuild -license accept`.
- Missing Android command-line tools: install Android Studio, then install
  Android SDK Command-line Tools in SDK Manager.
- Missing AVD: run `./bootstrap-solcon.sh --android-avd`.
- Zscaler trust failures: confirm the Zscaler Root CA is in the macOS System
  keychain and launch Android through the Control Room or
  `android-shell/tools/run-demo-emulator.sh`.
