# Device Operation Reference

Detailed companion to `../SKILL.md`. Read only for launcher ports,
platform-specific launch mechanics, state/log locations, or host-side REST
operation.

## Contents

- [Launcher And Port Behavior](#launcher-and-port-behavior)
- [Applying Packs And Runtime Proof](#applying-packs-and-runtime-proof)
- [Android Launch Mechanics](#android-launch-mechanics)
- [iOS Launch Mechanics](#ios-launch-mechanics)
- [Safe Host-Side REST](#safe-host-side-rest)
- [State And Evidence Locations](#state-and-evidence-locations)

## Launcher And Port Behavior

```sh
npm run lumo:cockpit
```

The default launcher starts at `127.0.0.1:4177`. If that implicit port is
busy, it tries the next ports up to the configured search bound and prints
the selected URL. An explicit `--port` or `PORT` value is strict and fails if
occupied. Reuse one running authority or stop it deliberately; do not stack
Control Rooms.

The canonical detached Android authority commands are:

```sh
node tools/lumo.mjs android start --pack <id> [--avd <name>] [--port <port>]
node tools/lumo.mjs android status
node tools/lumo.mjs android stop
```

Only `android start` accepts pack, AVD, and port overrides. `status` and
`stop` inspect or stop the verified authority.

## Applying Packs And Runtime Proof

A pack is the source of truth. Applying it regenerates the shared runtime
config, manifest, synced assets, Android seed metadata, iOS defaults, and
active-pack marker. Never edit generated outputs.

```sh
npm run lumo:apply
node tools/demo-launcher.mjs --pack <id> --apply-only
npm run validate:demo-runtime
```

The installed app is safe only when native runtime evidence reports the same
pack id, `configHash`, `runtimeHash`, canonical rendered source generation,
selected-pack credential context, and applied external ID expected by the
launcher. A hash/user/source blocker is evidence, not a warning to bypass;
relaunch through the canonical path.

## Android Launch Mechanics

The Android start job performs:

1. Apply selected pack.
2. Prepare web assets.
3. Run `:app:validateDemoWebAssets` and `:app:assembleDebug`.
4. Reuse one healthy expected AVD or cold-start the dedicated AVD.
5. Probe/restore supported trust state without routine destructive mutation.
6. Install with `adb install -r` only when the APK differs, preserving data.
7. Maintain launcher-owned clock coverage.
8. Apply identity and wait for correlated runtime, render, and trust proof.

The wrapper fails closed on a wrong, offline, physical, or additional device.
It enforces the non-secure Swipe keyguard and supported lock-screen
notification settings. `RESET_APP_DATA=1` is destructive recovery, never a
normal launch option.

The launcher waits for Android trust telemetry, normally for 15 seconds
(`BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS`). A timeout marks the job failed
even if the app was installed and opened; route to `lumo-debugging-playbook`
instead of declaring readiness by eye.

## iOS Launch Mechanics

The iOS shell currently requires the Vite server:

```sh
cd web-template && npm run dev
```

Keep it running on port 5173, then select iOS and **Launch** in the Control
Room. The launcher generates the Xcode project, builds scheme
`BrazeDemoShell` with signing disabled, boots the selected simulator, installs
bundle id `com.braze.masquerade`, launches it, and applies identity.

A blank WebView usually means the Vite server is absent. Unsigned simulator
builds support SDK-backed flows except real APNs push. There is no canonical
`lumo:launch:ios` npm alias; use the Control Room.

## Safe Host-Side REST

REST controls execute in the launcher process. Supported presets cover
`/users/track`, campaign/Canvas trigger send, user export, and validated custom
requests. Safety rails reject DELETE, destructive paths, `broadcast: true`,
absolute/path-traversal URLs, oversized bodies, and campaign/Canvas triggers
without explicit recipients.

The launcher injects the active external ID for standard controls. Enter a
REST key as Control Room session state or provide the supported environment
variable before launch. Never write it into a pack, generated runtime, web
asset, Android resource, or iOS source. Stored requests and responses are
redacted.

For the exhaustive action/transport matrix and blocked-path rules, read
`control-room-reference.md` directly from `../SKILL.md`.

## State And Evidence Locations

| Location | Contents |
|---|---|
| `.demo-launcher/state.json` | Active pack/platform/user, staged controls, readiness, ledger, REST history, latest runtime evidence |
| `.demo-launcher/activity-archives/` | Redacted mode-0600 Activity Feed archives |
| `/tmp/lumo-demo-emulator.log` | Emulator process output |
| Control Room Expert Launcher Logs | Recent apply/build/install/launch jobs |
| Control Room Expert Debug Events | Native/bridge diagnostics telemetry |
| Control Room Expert REST Responses | Redacted host-side responses |
| `GET /api/diagnostics/bundle` | Redacted support bundle |

Android posts device telemetry to the emulator host alias
`http://10.0.2.2:<port>/api/device-events`; iOS uses
`http://localhost:<port>/api/device-events`. Restarting on a different port
requires a canonical relaunch so the installed callback context matches.
