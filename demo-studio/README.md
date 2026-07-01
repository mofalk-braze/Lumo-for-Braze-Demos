# Braze Demo Studio

Braze Demo Studio opens the same local Demo Control Room UI in an Electron app.
It keeps execution, generated runtime files, native builds, and credentials on
the presenter's Mac.

## Run

```sh
npm install
cd demo-studio && npm install
cd ..
npm run demo:studio
```

## Package

```sh
npm run demo:studio:pack
```

The unsigned local macOS app is written to:

```text
demo-studio/dist/mac-arm64/Braze Demo Studio.app
```

The app icon is generated from `demo-studio/assets/logo.png`.

For a shareable internal preview artifact, build the unsigned DMG/zip:

```sh
npm run demo:studio:dist
```

## First Run

On first launch, the app creates or selects a workspace under:

```text
~/Library/Application Support/Braze Demo Studio/workspaces/
```

The first-run setup screen lets an operator choose Presenter or Builder mode,
run doctor checks, install system tools, install project npm dependencies,
import a `.braze-demo-kit`, provision the Android AVD, reveal the workspace,
verify Android/iOS builds, and open the Control Room.

Studio can safely automate:

- Homebrew-managed tools used by the repo bootstrap path: Node/npm, Java 17,
  and `xcodegen`.
- Root and `web-template` npm dependency install.
- Android SDK package and dedicated AVD provisioning after Android SDK
  command-line tools exist.
- Android and iOS verification commands from the selected workspace.

Studio opens or guides, but does not bundle:

- Android Studio and Xcode GUI installs.
- Xcode first-launch/license prompts and iOS simulator runtime installs.
- Braze SDK and REST credentials.
- APNs material, Apple signing assets, Firebase service accounts, or Braze-side
  Firebase push setup.

Each workspace contains its own source copy, so generated files such as
`.demo-launcher/state.json`, Android `local.properties`, active runtime config,
and synced demo assets stay isolated from other demos.

For disposable QA, set `BRAZE_DEMO_STUDIO_USER_DATA=/tmp/braze-demo-studio-test`
before launching the app to use a separate app data root.

The packaged app includes Electron, the Studio app, a sanitized source template,
starter pack, design assets, and Firebase client app config. It does not bundle
Android Studio/SDK, Java, Xcode, xcodegen, Braze credentials, APNs material,
Firebase service accounts, native build outputs, or REST API keys.

Credentials stay local. SDK API key and endpoint are saved only in ignored
workspace config for the active pack. REST keys are session/environment material
and are never exported in `.braze-demo-kit` bundles.

## Kits

Use **Import kit** and **Export kit** for `.braze-demo-kit` bundles. Kit bundles
may contain `demo-pack.json`, public assets, docs, and screenshots. The app
rejects local-only files such as `secrets.properties`, `.env` files, generated
runtime files, native local config, keystores, APNs material, and service
account JSON.

Imported kits are installed into the selected workspace's ignored local pack
area:

```text
<workspace>/repo/.demo-packs/<pack-id>/
```

Source-mode users can also use the repo-level `.demo-packs/`,
`BRAZE_DEMO_PACKS_DIRS`, or committed `demo-packs/` paths described in the root
demo pack docs.
