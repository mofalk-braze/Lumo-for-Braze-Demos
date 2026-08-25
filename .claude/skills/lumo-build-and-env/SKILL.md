---
name: lumo-build-and-env
description: >-
  Set up the Lumo Braze Demo Shells repository on a fresh Apple Silicon Mac:
  install supported prerequisites, run target-aware doctor checks, provision
  the dedicated Android AVD, and prepare Xcode/xcodegen when iOS is requested.
  Use for "set up", "fresh machine", "new laptop", "first run", "bootstrap",
  "install everything", missing JDK/Android SDK/cmdline-tools/xcodegen, or an
  AVD that has never been provisioned. For a machine that previously worked
  and has regressed, use lumo-debugging-playbook. For first-time end-to-end
  Android push enablement after the environment exists, use
  lumo-push-readiness-campaign.
---

# Lumo Build And Environment Setup

Take a fresh supported Mac to a working Lumo environment. Run commands from
the repository root. This skill owns first-time environment creation, not
ordinary demo preflight or regression repair.

## Lifecycle Boundary

- Fresh clone, fresh Mac, or prerequisites never installed: continue here.
- Environment worked before and now fails: use `lumo-debugging-playbook`.
- Environment works and the user wants to run a demo: use
  `lumo-run-and-operate`.
- Android app launches but push has never been proven in this teammate's
  Braze workspace: use `lumo-push-readiness-campaign`.

Hard requirement: the supported bootstrap path is Apple Silicon macOS.
`bootstrap-solcon.sh` enforces `Darwin` and `arm64` for installation and AVD
provisioning.

## Android-First Setup

For an authorized setup request, the automated mutation path is the default:

```sh
node tools/lumo.mjs android setup
node tools/lumo.mjs android doctor
```

`android setup` installs the target-aware dependencies, provisions/verifies the
dedicated AVD, then runs doctor. `android doctor` is assessment/status only; it
does not install or repair anything. If `node` itself is missing, run
`./bootstrap-lumo.sh --install --target android` first, then return to the
automated command.

The underlying manual stages are equivalent detail, not a competing default:

```sh
./bootstrap-lumo.sh --check --target android
./bootstrap-lumo.sh --install --target android
./bootstrap-lumo.sh --android-avd --target android
./bootstrap-lumo.sh --check --target android
```

Complete any manual Android Studio, SDK Command-line Tools, or corporate CA
steps printed by the bootstrap, then rerun the check. Do not start installing
Xcode unless iOS is in scope.

Success requires:

- Doctor exits 0 with no Android-relevant `[FAIL]` lines.
- `Braze_Demo_API_36` appears in `emulator -list-avds`.
- The shared Firebase client config passes the doctor check.
- Any remaining warning is understood and irrelevant to the requested path.

Read [references/setup-reference.md](references/setup-reference.md) before
fixing a doctor line, provisioning or recreating an AVD, configuring a
corporate-network Mac, or setting up iOS. It contains the prerequisite map,
bootstrap semantics, doctor interpretation, AVD contract, iOS commands, and
known setup traps.

## First Repository Run

After the environment checks pass:

```sh
npm run lumo:apply
npm run lumo:cockpit
```

Expected signals:

- Apply reports `Applied demo pack: Lumo` for the default pack.
- The launcher prints the Control Room URL, normally
  `http://127.0.0.1:4177`.
- Generated-runtime warnings clear after apply.

From this point, hand off to `lumo-run-and-operate`. It owns the ordinary
readiness preflight, launch, identity application, and rehearsal workflow.

## Optional iOS Setup

Only when iOS is requested:

```sh
./bootstrap-lumo.sh --install --target ios
./bootstrap-lumo.sh --check --target ios
cd ios-shell
xcodegen generate
```

Xcode, its first-launch/license flow, and an iPhone simulator runtime require
manual setup. An unsigned simulator build supports the shell but not real
push. Read the iOS section of the setup reference before diagnosing an iOS
setup failure.

## Safety Invariants

- Treat packs as the source of truth; never hand-edit generated runtime files.
- Preserve emulator and SDK identity. Never use `RECREATE_AVD=1`,
  `RESET_APP_DATA=1`, uninstall the app, or erase a simulator as routine
  setup. Obtain explicit authorization before any identity-destroying action.
- Use the dedicated rootable `google_apis` AVD. Never substitute a Google Play
  image; corporate trust repair requires `adb root` and writable system state.
- Keep credential values outside committed files. The committed
  `android-shell/app/google-services.json` is public Firebase client config,
  not the Firebase service-account credential.
- Do not treat `demo-studio/` as a supported setup path.

## Provenance

Re-check setup facts against `bootstrap-solcon.sh`,
`tools/doctor-solcon.mjs`, `tools/lumo-android-cli.mjs`,
`android-shell/tools/provision-demo-avd.sh`,
`android-shell/tools/run-demo-emulator.sh`, `ios-shell/project.yml`, and
`docs/lumo-public-quickstart.md`. When these disagree, repository code and the
committed quickstart win; update this skill.
