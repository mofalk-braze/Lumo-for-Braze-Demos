# Setup Reference

Detailed companion to `../SKILL.md`. Read only for first-time prerequisite,
doctor, AVD, corporate trust, or iOS setup work.

## Contents

- [Prerequisites](#prerequisites)
- [Bootstrap Semantics](#bootstrap-semantics)
- [Doctor Interpretation](#doctor-interpretation)
- [Dedicated Android AVD](#dedicated-android-avd)
- [iOS Setup](#ios-setup)
- [Known Setup Traps](#known-setup-traps)
- [Re-Verification](#re-verification)

## Prerequisites

| Requirement | Why | Provisioning path |
|---|---|---|
| Apple Silicon Mac | Supported bootstrap host | User hardware |
| Homebrew | Installs Node, JDK 17, xcodegen | Manual from `https://brew.sh` |
| Node.js and npm | Launcher, validators, web app | Bootstrap `--install` |
| JDK 17 | Android Gradle toolchain | `--install --target android` |
| Android Studio and SDK | Android build/emulator | Manual GUI |
| Android SDK Command-line Tools | `sdkmanager` and `avdmanager` | Android Studio SDK Manager |
| `Braze_Demo_API_36` | Supported demo emulator | `--android-avd --target android` |
| Xcode and accepted license | iOS simulator build | Manual GUI, only for iOS |
| xcodegen | Generates ignored Xcode project | `--install --target ios` |
| iPhone simulator runtime | Runs iOS shell | Xcode Settings, only for iOS |
| Zscaler Root CA in System keychain | Corporate-network emulator trust | IT/manual, only when applicable |

The bootstrap installs target-specific packages and missing npm dependencies.
Android Studio, Android SDK UI components, full Xcode, the Xcode first-launch
flow, and simulator runtimes remain manual.

## Bootstrap Semantics

`bootstrap-lumo.sh` passes all arguments to `bootstrap-solcon.sh`, which owns
the implementation.

```sh
./bootstrap-lumo.sh --check [--target all|android|ios|web]
./bootstrap-lumo.sh --install [--target all|android|ios|web]
./bootstrap-lumo.sh --android-avd --target android
```

- No action flag defaults to `--check`.
- `--check` is read-only and runs the target-aware doctor.
- `--install` refuses unsupported hosts and stops if Homebrew is absent. It
  installs only the selected target's Homebrew packages, installs missing npm
  dependencies, prints target-specific manual steps, then runs doctor.
- `--install` is idempotent; rerun it after completing a manual step.
- `--android-avd` delegates to
  `android-shell/tools/provision-demo-avd.sh`.
- Android targeting excludes Xcode, xcodegen, and iOS simulator checks.

## Doctor Interpretation

Use `node tools/lumo.mjs android doctor` for Android or
`./bootstrap-lumo.sh --check --target ios` for iOS. The untargeted npm aliases
retain the all-platform view.

- `[PASS]`: capability verified.
- `[WARN]`: process exits 0, but the named feature may be degraded or not yet
  initialized. Read the remediation and decide whether the feature is in
  scope.
- `[FAIL]`: process exits 1. Follow the printed remediation and rerun doctor.

Important checks:

| Check | Meaning and supported remediation |
|---|---|
| Host platform | Must be Apple Silicon macOS; no bootstrap workaround |
| Homebrew | Install from `https://brew.sh` |
| Node/npm | Rerun target-specific `--install` |
| Java | Android needs Java 17; install `openjdk@17` and fix PATH if necessary |
| Android SDK | Install Android Studio or set `ANDROID_HOME` deliberately |
| `sdkmanager` / `avdmanager` | Install Android SDK Command-line Tools |
| adb / emulator | Install Platform Tools and Emulator packages |
| Dedicated AVD | Run target-aware Android setup/provisioning |
| Zscaler CA | Required in the macOS System keychain only on the corporate path |
| Firebase client config | Restore the committed client JSON for package `com.braze.demoshell`; never substitute service-account JSON |
| Web dependencies | Rerun bootstrap install or install the missing dependencies |
| Generated runtime | Expected on a fresh clone; run pack apply after setup |
| Xcode/xcodegen/runtime | Only relevant to the iOS target |

## Dedicated Android AVD

Provisioning creates `Braze_Demo_API_36` with device profile `pixel_10_pro`
and `system-images;android-36.1;google_apis;arm64-v8a`. It installs platform
tools, emulator, Android 36.1 platform, and the image, then configures an 8 GB
data partition, hardware keyboard, GPU auto, and no Play Store.

The `google_apis` image is load-bearing. The launch path needs rootable,
writable system state for explicit first-time corporate CA repair and for
restoring the volatile Conscrypt trust mount after a cold boot. Provisioning
refuses Play Store images.

Verify the AVD:

```sh
~/Library/Android/sdk/emulator/emulator -list-avds
```

Supported overrides exist (`AVD_NAME` or `BRAZE_DEMO_ANDROID_AVD`,
`API_LEVEL`, `ABI`, `DEVICE`, `SDKMANAGER`, `AVDMANAGER`, `EMULATOR`), but do
not change the defaults without a concrete requirement.

If an existing AVD has the wrong profile, provisioning offers
`RECREATE_AVD=1`. That deletes the AVD and destroys app data, Braze SDK device
identity, and the FCM token. Obtain explicit authorization and use it only as
a one-time profile correction.

## iOS Setup

The Xcode project is generated and ignored:

```sh
cd ios-shell
xcodegen generate
xcodebuild -project BrazeDemoShell.xcodeproj -scheme BrazeDemoShell \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ./DerivedData CODE_SIGNING_ALLOWED=NO build
```

Current project facts live in `ios-shell/project.yml`: scheme
`BrazeDemoShell`, bundle id `com.braze.masquerade`, deployment target iOS 15,
and Braze Swift SDK pinned from 11.9.0. Do not bump the SDK casually; the pin
documents a known Xcode 26.5 compatibility boundary.

The iOS shell currently loads the Vite dev server at
`http://localhost:5173`. Unsigned simulator builds do not prove APNs push.

## Known Setup Traps

1. Missing Android Command-line Tools: install them in Android Studio's SDK
   Tools panel, then rerun setup.
2. JDK resolves below 17 after bootstrap: add
   `/opt/homebrew/opt/openjdk@17/bin` to the user's shell PATH and verify
   `java -version` in a new terminal.
3. Zscaler CA exists only in the login keychain: the supported launch path
   reads `/Library/Keychains/System.keychain`. Follow IT guidance; do not
   disable interception as a workaround.
4. Xcode license or first-launch checks fail: open Xcode once and accept the
   prompts, or use the administrator-approved license command.
5. Missing npm dependencies: rerun target-specific bootstrap installation.
6. An AVD is locked with a secure credential: migrate it manually to the
   non-secure Swipe keyguard. Never guess or type a device PIN.

## Re-Verification

- Bootstrap flags: `bootstrap-solcon.sh`
- Doctor checks and status levels: `tools/doctor-solcon.mjs`
- Android orchestration: `tools/lumo-android-cli.mjs`
- AVD profile and destructive recreation: `android-shell/tools/provision-demo-avd.sh`
- Trust/root requirements: `android-shell/tools/run-demo-emulator.sh`
- iOS project facts: `ios-shell/project.yml`
- Setup documentation of record: `docs/lumo-public-quickstart.md`
