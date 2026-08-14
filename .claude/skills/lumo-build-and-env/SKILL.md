---
name: lumo-build-and-env
description: Recreate the Lumo Braze Demo Shells working environment from scratch on a fresh Apple Silicon Mac — prerequisites, bootstrap scripts, doctor checks, Android AVD provisioning, and Xcode/xcodegen setup. Use when someone says "set up", "fresh machine", "new laptop", "onboard a teammate", "install everything", "bootstrap", "first run", "doctor fails", "environment broken on a new Mac", "AVD missing", "Braze_Demo_API_36 not found", "xcodegen not found", "sdkmanager missing", "cmdline-tools", "Java/JDK version wrong", "Xcode license", or asks what ./bootstrap-lumo.sh --check / --install / --android-avd actually do. Also use when an AI agent needs to verify the environment before building or running anything in this repo.
---

# Lumo Build and Environment Setup

Goal: take a fresh Apple Silicon Mac to a state where the Lumo demo tooling
runs — Control Room up, Lumo pack applied, Android emulator and iOS simulator
buildable. Written to be followed top to bottom by someone who has never used
a terminal beyond copy-paste.

All commands run from the root of the clone.

Jargon used below, defined once:

- **Pack** — a demo definition (`demo-pack.json` + assets); applying it
  generates all runtime config.
- **Control Room** — the local web page (default `http://127.0.0.1:4177`)
  that is the only presenter/operator surface.
- **Emulator / simulator** — a virtual Android phone / iPhone on your Mac.
- **AVD** — Android Virtual Device, a saved emulator profile. Ours is named
  `Braze_Demo_API_36`.
- **Shell** — the thin native Android/iOS app that hosts the shared web demo UI.

Hard requirement: **Apple Silicon macOS only.** `bootstrap-solcon.sh` enforces
this with `uname -s` = `Darwin` and `uname -m` = `arm64` before `--install`
and `--android-avd`; Intel Macs and other OSes exit with an error.

## When NOT to use this skill

- Running or presenting a demo on an already-working machine →
  `lumo-run-and-operate`.
- A previously working environment broke, or a demo misbehaves →
  `lumo-debugging-playbook`.
- Getting Android push working end to end (Braze workspace, service account,
  tokens) → `lumo-push-readiness-campaign`.
- Interpreting doctor/validator output in depth, or diagnostic scripts →
  `lumo-diagnostics-and-tooling`.
- Creating or editing demo packs/content → `lumo-demo-pack-authoring` or the
  `braze-demo-app-builder` skill.

## 1. Prerequisite map

Everything the environment needs, and which step provides it:

| Prerequisite | Why it is needed | Provided by |
|---|---|---|
| Apple Silicon Mac (arm64) | Only supported v1 host; bootstrap refuses others | You (hardware) |
| Homebrew | Installs target-specific Node/JDK/xcodegen dependencies | Manual, once: https://brew.sh |
| Node.js + npm | Doctor, launcher, web template, validators | `--install` (brew `node`) |
| JDK 17 (`openjdk@17`) | Android Gradle build requires Java 17 | `--install --target android` |
| xcodegen | Generates the iOS `.xcodeproj` (which is gitignored) | `--install --target ios` |
| Xcode (full app) + license accepted | iOS simulator builds | **Manual GUI**: App Store, open once |
| iOS simulator runtime (an iPhone) | Running the iOS shell | Xcode > Settings > Platforms |
| Android Studio + SDK | Provides the Android SDK at `~/Library/Android/sdk` | **Manual GUI**: install Android Studio |
| Android SDK Command-line Tools | `sdkmanager`/`avdmanager` used by AVD provisioning | **Manual GUI**: Android Studio SDK Manager |
| Dedicated AVD `Braze_Demo_API_36` | Rootable emulator for demos and Zscaler trust | `--android-avd --target android` |
| Zscaler Root CA in macOS **System** keychain | Only if on the corporate network; emulator trust install reads it from there | Manual / IT-managed |
| `node_modules` (repo root + `web-template/`) | JS dependencies | `--install` (npm install) |

The bootstrap installs what it can; the four rows marked **Manual GUI** cannot
be automated and are printed as reminders at the end of `--install`.

## 2. Bootstrap anatomy

`./bootstrap-lumo.sh` is a pure pass-through wrapper: it `exec`s
`./bootstrap-solcon.sh` with the same arguments. The two are interchangeable;
docs use the `lumo` name. The real logic lives in `bootstrap-solcon.sh`.

Flags (default with no flag is `--check`):

### `./bootstrap-lumo.sh --check [--target all|android|ios|web]`

Runs the doctor (`node tools/doctor-solcon.mjs`) — read-only diagnostics, no
installs. If Node itself is missing it prints "install Homebrew, then run
--install" and exits 1. Safe to run any time.

For the prioritized Android path, always use `--target android`. It excludes
Xcode, xcodegen, and iOS simulator checks from the result, so an optional iOS
gap cannot block Android setup.

### `./bootstrap-lumo.sh --install [--target all|android|ios|web]`

1. Refuses non-Apple-Silicon hosts (uname checks); refuses to continue if
   Homebrew is absent (prints the https://brew.sh pointer and exits 1).
2. Installs target-specific Homebrew packages: Android gets `node` and
   `openjdk@17`; iOS gets `node` and `xcodegen`; `all` gets all three. Existing
   packages are skipped.
3. Prepends `/opt/homebrew/opt/openjdk@17/bin` to `PATH` for the rest of the
   script (note: this does NOT change your shell permanently — see trap 5).
4. `npm ci` in `web-template/` if `web-template/node_modules` is missing.
5. `npm ci` at the repo root if `node_modules` is missing and
   `package-lock.json` exists.
6. Prints only the selected target's manual GUI steps. Android lists Android
   Studio/Command-line Tools and corporate Zscaler CA checks. iOS lists Xcode
   install and first-launch/license approval. Android-first never asks for
   Xcode.
7. Runs the doctor so you immediately see what is still missing.

`--install` is idempotent: rerun it after completing any manual step.

### `./bootstrap-lumo.sh --android-avd --target android`

Refuses non-Apple-Silicon hosts, then runs
`android-shell/tools/provision-demo-avd.sh` (section 4).

## 3. Doctor checks (setup view)

`node tools/doctor-solcon.mjs --target android` and
`./bootstrap-lumo.sh --check --target android` run the target-aware doctor.
The untargeted npm aliases retain the all-platform view. Doctor prints a
capability summary (Web / Android / Android push / iOS shell), then a
`[PASS]`/`[WARN]`/`[FAIL]` line per check with a remediation line under any
non-pass. Exit code is 1 if **any** check FAILs; WARNs alone exit 0.

Setup-relevant checks, verified against `tools/doctor-solcon.mjs`. The
Xcode/xcodegen/iOS rows run only for `--target ios` or `all`; the Android rows
run only for `--target android` or `all`:

| Check | On failure | What failure means | Fix |
|---|---|---|---|
| Host platform | FAIL | Not Apple Silicon macOS | Use a supported Mac; no workaround |
| Homebrew | WARN | `brew` not on PATH | Install from https://brew.sh, rerun `--install` |
| Node/npm | FAIL | `node` or `npm` missing | `./bootstrap-lumo.sh --install --target android` |
| Java | FAIL | No `java`, or major version < 17 | `brew install openjdk@17` (see trap 5 for PATH) |
| Xcode command line tools | FAIL | `xcode-select -p` fails | `xcode-select --install`, then open Xcode once |
| Xcode first launch/license | WARN | `xcodebuild -checkFirstLaunchStatus` non-zero | Open Xcode once, or `sudo xcodebuild -license accept` |
| xcodegen | FAIL | Not on PATH | `./bootstrap-lumo.sh --install --target ios` |
| iOS simulator runtime | WARN | `xcrun simctl` lists no available iPhone | Xcode > Settings > Platforms, add an iOS runtime |
| Android SDK directory | FAIL | `~/Library/Android/sdk` (or `$ANDROID_HOME`) absent | Install Android Studio, or set `ANDROID_HOME` |
| sdkmanager / avdmanager | FAIL | SDK Command-line Tools not installed | Android Studio > SDK Manager > SDK Tools > "Android SDK Command-line Tools" |
| adb / Android emulator | FAIL | Platform Tools / Emulator packages missing | Install via SDK Manager (or `--android-avd`, which installs both) |
| Dedicated Android AVD | WARN/FAIL by target | `Braze_Demo_API_36` not in `emulator -list-avds` | `./bootstrap-lumo.sh --android-avd --target android` |
| Zscaler root CA | WARN | CA not in `/Library/Keychains/System.keychain` | Fine off-network; on the corporate network IAM media/FCM may silently break — get the CA into the **System** keychain |
| Firebase client config | FAIL/WARN | `android-shell/app/google-services.json` missing/invalid (FAIL) or wrong project (WARN); expects package `com.braze.demoshell`, project `braze-sc-demo-shell` | Restore the committed file (`git checkout android-shell/app/google-services.json`); it is public client config, not a secret |
| Web dependencies | WARN | `web-template/node_modules` missing | `--install`, or `cd web-template && npm install` |
| Generated demo runtime | WARN | No pack applied yet (generated files absent) | `npm run lumo:apply` — normal on a fresh clone |

The last two WARNs are expected on a brand-new clone and clear during first
run. Deeper interpretation of doctor plus the other validators lives in
`lumo-diagnostics-and-tooling`.

## 4. Android AVD provisioning

`./bootstrap-lumo.sh --android-avd --target android` →
`android-shell/tools/provision-demo-avd.sh`. What it does, verified:

- Creates AVD **`Braze_Demo_API_36`** using device profile **`pixel_10_pro`**
  and system image **`system-images;android-36.1;google_apis;arm64-v8a`**
  (arm64 auto-selected on Apple Silicon).
- First installs via `sdkmanager`: `platform-tools`, `emulator`,
  `platforms;android-36.1`, and that system image — so it also fixes missing
  adb/emulator FAILs from the doctor.
- Tunes the AVD config: 8G data partition, hardware keyboard, GPU auto,
  Play Store disabled.
- Overridable env vars: `AVD_NAME` (or `BRAZE_DEMO_ANDROID_AVD`), `API_LEVEL`,
  `ABI`, `DEVICE`, `SDKMANAGER`, `AVDMANAGER`, `EMULATOR`. Defaults are the
  supported profile — do not change them without a reason.

**Why a `google_apis` image and never a Play-store image:** the script hard-
refuses any `playstore` image. The demo launch wrapper
(`android-shell/tools/run-demo-emulator.sh`) needs `adb root` and a writable
system partition (`-writable-system`) for explicit first-time Zscaler system-
trust repair and for restoring the volatile Conscrypt trust mount after a
cold boot. Normal warm launches probe the existing trust state first and do
not remount, reboot, or reinstall the CA when it is already healthy. Google
Play and production images do not allow the required root/system operations,
so on a corporate network IAM media and FCM would silently fail on them.

**If the AVD already exists but doesn't match the profile** (wrong device or
image), the script exits with an explanation and tells you to rerun as:

```sh
RECREATE_AVD=1 android-shell/tools/provision-demo-avd.sh
```

**RECREATE_AVD=1 caveat:** this deletes and recreates the AVD, which **wipes
all app data inside it — including the Braze SDK device identity and FCM push
token**. That violates the repo's identity-preservation rule (never reset app
data casually). Use it only as a deliberate one-time setup correction, never
as a routine step. The same applies to `RESET_APP_DATA=1` on the launch
wrapper. Normal launches preserve app data.

Verify success:

```sh
~/Library/Android/sdk/emulator/emulator -list-avds
```

Expect `Braze_Demo_API_36` in the output, and the doctor's "Dedicated Android
AVD" line flips to PASS.

## 5. iOS: Xcode and xcodegen

The iOS project file is generated, not committed
(`ios-shell/*.xcodeproj/` is in `.gitignore`). After Xcode + xcodegen exist:

```sh
cd ios-shell
xcodegen generate      # creates BrazeDemoShell.xcodeproj from project.yml
```

Facts from `ios-shell/project.yml`:

- Target and scheme: `BrazeDemoShell`; bundle id `com.braze.masquerade`;
  deployment target iOS 15.0.
- Braze Swift SDK pinned `from: "11.9.0"` — 15.1.0 fails to compile under
  Xcode 26.5; do not bump casually.

Unsigned simulator builds work for everything **except push** (push needs an
org-signed build — see `lumo-push-readiness-campaign`). CLI build used to
verify the shell:

```sh
xcodebuild -project BrazeDemoShell.xcodeproj -scheme BrazeDemoShell \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ./DerivedData CODE_SIGNING_ALLOWED=NO build
```

The Control Room's iOS launch runs `xcodegen generate` and an unsigned build
for you, so this section is mostly for verification and for regenerating the
project after `project.yml` changes. The iOS shell loads the web UI from the
Vite dev server (`http://localhost:5173`) in dev mode; running it day-to-day
is `lumo-run-and-operate` territory.

## 6. First-run sequence and success signals

The canonical first run (README.md, CLAUDE.md, docs/lumo-public-quickstart.md):

```sh
./bootstrap-lumo.sh --check --target android
./bootstrap-lumo.sh --install --target android
./bootstrap-lumo.sh --android-avd --target android
npm run lumo:apply
npm run lumo:cockpit
```

Between `--install` and `--android-avd`, complete the printed Android Studio,
command-line-tools, and Zscaler steps if applicable. Android-first does not
require Xcode. Rerun `--check --target android` until only expected warnings
remain.

Confirm success — observable predicates:

| Step | Success looks like |
|---|---|
| `--check` after install | No `[FAIL]` lines; exit code 0. Acceptable WARNs on first run: Generated demo runtime, Dedicated AVD (until step 3), Zscaler CA (off-network) |
| `--android-avd` | Ends with `Ready: Braze_Demo_API_36`; AVD appears in `emulator -list-avds` |
| `npm run lumo:apply` | Applies pack `lumo-default` with no error; "Generated demo runtime" doctor check turns PASS |
| `npm run lumo:cockpit` | Prints a Control Room URL, `http://127.0.0.1:4177` by default (`PORT` env overrides; auto-increments if 4177 is busy). Open it in a browser and select the `Lumo` pack |

If all four hold, the environment is built. From here, operating demos is
`lumo-run-and-operate`; Android build/launch specifics and Gradle facts for
reference: Gradle wrapper 9.4.1, JDK 17 toolchain (`JavaVersion.VERSION_17`,
Kotlin `jvmTarget` 17), minSdk 23, targetSdk 36 — all in
`android-shell/gradle/wrapper/gradle-wrapper.properties` and
`android-shell/app/build.gradle.kts`.

For agent-driven Android setup, prefer the target-aware command surface:

```sh
node tools/lumo.mjs android setup
node tools/lumo.mjs android doctor
node tools/lumo.mjs android start --pack lumo-default
node tools/lumo.mjs android status
node tools/lumo.mjs android stop
```

The explicit target keeps optional iOS gaps from obscuring Android readiness.
Use `--avd <name>` only for a deliberate override. Never add reset/recreate
flags unless the user explicitly authorizes loss of the emulator SDK identity.

## 7. Known traps (all verified)

1. **Missing Android cmdline-tools.** Doctor FAILs `sdkmanager`/`avdmanager`;
   `--android-avd` exits with install instructions. Fix in Android Studio:
   Settings > Languages & Frameworks > Android SDK > SDK Tools > check
   "Android SDK Command-line Tools" > Apply. (Alternative if some sdkmanager
   exists: `sdkmanager --install "cmdline-tools;latest"`.)
2. **Xcode license/first-launch not accepted.** Doctor WARNs; `xcodebuild`
   refuses to build. Open Xcode once and accept prompts, or
   `sudo xcodebuild -license accept`.
3. **Zscaler Root CA absent from the macOS System keychain.** Doctor WARNs.
   On the corporate network this later breaks IAM media and FCM in the
   emulator with no obvious error (the costliest historical failure in this
   repo). The emulator wrapper reads the CA from
   `/Library/Keychains/System.keychain` specifically — the login keychain is
   not enough. Off-network, the WARN is safe to ignore.
4. **Empty `node_modules`.** `npm run …` fails or the doctor WARNs "Web
   dependencies". Rerun `./bootstrap-lumo.sh --install --target android` (it installs both
   root and `web-template/` deps), or `npm install` in each.
5. **JDK version mismatch.** Gradle needs Java 17; doctor FAILs if
   `java -version` reports < 17. `--install` puts openjdk@17 on PATH only for
   its own run — if your shell still resolves an old Java, add to your
   `~/.zshrc`:
   `export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"`, open a new
   terminal, and confirm with `java -version` (expect `17.x`).

## For AI agents: environment invariants

Before building or launching anything in this repo, verify:

- `node tools/lumo.mjs android doctor` exits 0.
- AVD exists: `~/Library/Android/sdk/emulator/emulator -list-avds | grep -x Braze_Demo_API_36`.
- Never pass `RECREATE_AVD=1` or `RESET_APP_DATA=1` unless the user explicitly
  asked to destroy device identity.
- Never hand-edit generated runtime files; re-apply the pack instead
  (`npm run lumo:apply`).
- No credential values in any file you write; placeholders only
  (e.g. `braze.apiKey=<YOUR_SDK_API_KEY>`).

## Open questions / candidates

- `demo-studio/` (prebuilt Electron artifact, dist only) exists in the repo
  but is not part of the supported setup path — treat as experimental; do not
  install or document it as a requirement.

## Provenance and maintenance

Verified 2026-07-03 against the repo. Re-verify before trusting if these may
have drifted:

- Bootstrap flags and manual-step list: `cat bootstrap-solcon.sh` (and confirm
  `bootstrap-lumo.sh` is still a pass-through `exec`).
- Doctor check set and PASS/WARN/FAIL levels: `cat tools/doctor-solcon.mjs`.
- AVD name/profile/image and RECREATE_AVD behavior:
  `cat android-shell/tools/provision-demo-avd.sh`.
- Play-image rejection rationale (adb root / writable system):
  `grep -n 'adb root' android-shell/tools/run-demo-emulator.sh`.
- npm script names: `grep '"lumo' package.json`.
- Gradle/JDK versions:
  `cat android-shell/gradle/wrapper/gradle-wrapper.properties` and
  `grep -n 'VERSION_17\|jvmTarget\|minSdk\|targetSdk' android-shell/app/build.gradle.kts`.
- iOS pin and bundle id: `cat ios-shell/project.yml`.
- Control Room default port: `grep -n '4177' tools/demo-launcher.mjs`.
- First-run sequence of record: `docs/lumo-public-quickstart.md` (CLAUDE.md
  and README.md must agree; the docs win over this skill on conflict).
