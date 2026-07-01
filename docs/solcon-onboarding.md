# SolCon Onboarding

Braze Demo Studio is the preferred internal presenter/operator path. The source
repo remains the builder/contributor path. Both flows keep demo execution local
and avoid hosted Control Room state.

## Packaged App Flow

Use this path when someone only needs to run, import, or present demos on an
Apple Silicon Mac.

1. Open the shared **Braze Demo Studio** app or DMG.
2. Complete the first-run setup screen.
3. Create or select a workspace.
4. Run **Doctor** to see Web, Android, and iOS readiness.
5. Run **Install system tools** for Homebrew-managed dependencies such as
   Node/npm, Java 17, and `xcodegen`.
6. Run **Install deps** before building or launching the web/native demos.
7. Use **Android Studio**, **Xcode**, **Provision AVD**, **Verify Android**, and
   **Verify iOS** actions from the capability checklist as needed.
8. Import any `.braze-demo-kit` through **Import kit**.
9. Configure SDK/REST credentials in Setup when using live Braze workspaces.
10. Open the Control Room and apply/launch the active pack.

The app stores workspaces under:

```text
~/Library/Application Support/Braze Demo Studio/workspaces/
```

Imported kits are copied to the selected workspace at:

```text
<workspace>/repo/.demo-packs/<pack-id>/
```

The packaged app includes Electron, Studio, a sanitized source template, the
starter pack, design assets, and Firebase client app config. It does not bundle
Android Studio/SDK, Java, Xcode, xcodegen, Braze credentials, APNs material,
Firebase service accounts, native build outputs, or REST API keys.

Studio installs what it can safely install. Android Studio, Xcode,
first-launch/license prompts, Braze dashboard credentials, Apple signing/APNs,
and Firebase service accounts remain explicit GUI/admin setup steps with
verification in the app.

## Source Fresh Machine Flow

Use this path for builders and contributors:

```sh
git clone <private-repo-url>
cd Android-Demos
./bootstrap-solcon.sh --check
./bootstrap-solcon.sh --install
./bootstrap-solcon.sh --android-avd
npm run demo:launcher
```

Open the Control Room URL printed by the launcher, select `SolCon Starter`, then
use Apply or Launch.

## What Comes From Git

- Web template, Android shell, iOS shell, launcher tools, bootstrap scripts, and
  documentation.
- `android-shell/app/google-services.json` for the dedicated SolCon Firebase
  Android app (`com.braze.demoshell`).
- `demo-packs/SolCon Starter/demo-pack.json`, which contains no customer assets
  or credentials.

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

Real Android push still needs two things outside the repo:

- Braze Android SDK API key and endpoint entered/imported locally through the
  Control Room or an ignored pack `secrets.properties`.
- Firebase service account configured once in Braze by the repo owner/admin for
  the shared Android app.

REST API keys remain host-only. Enter them in the Control Room session or export
`BRAZE_REST_API_KEY_<PACK_ID>` / `BRAZE_REST_API_KEY`; do not write them into
packs or source files.

## Capability Matrix

- Web shell: available after Node/npm and web dependencies are installed.
- Android shell: available after Android SDK tooling, Java 17, the dedicated AVD,
  and the starter pack are applied.
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
