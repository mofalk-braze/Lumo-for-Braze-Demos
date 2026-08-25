---
name: lumo-run-and-operate
description: >-
  Run and rehearse an existing Lumo Braze demo: perform the ordinary readiness
  preflight, start or reuse the Control Room authority, apply and launch a
  selected pack, set the active user, operate approved Story Controls, and
  verify audience-facing proof. Use for "run the demo", "start the cockpit",
  "launch Android/iOS", "apply or switch pack", "change user", "trigger the
  campaign/Canvas/IAM", "refresh Content Cards", "log an event or purchase",
  "why is this control blocked", "rehearse", or "present today". Assumes the
  environment and demo already exist. Use lumo-build-and-env for first setup
  and lumo-debugging-playbook when a previously working run now fails.
---

# Lumo Run And Operate

Operate a durable demo from the Control Room, the sole presenter authority.
The app remains product-facing; operator state, credentials, controls,
telemetry, and diagnostics stay host-side.

## Lifecycle Boundary

- Environment or AVD never worked: `lumo-build-and-env`.
- Demo pack/story does not exist: `lumo-new-demo-campaign`.
- Existing demo should be launched, rehearsed, or presented: continue here.
- Normal preflight or live operation exposes a regression: preserve the
  evidence and use `lumo-debugging-playbook`.
- Android push has never been proven in this workspace: use
  `lumo-push-readiness-campaign`.

## Ordinary Readiness Preflight

Own this preflight as part of normal operation. Do not automatically load the
expert diagnostics skill or run every repository gate.

For Android:

```sh
node tools/demo-launcher.mjs --list
node tools/lumo.mjs android doctor
node tools/lumo.mjs pack validate <id>
node tools/lumo.mjs android start --pack <id>
node tools/lumo.mjs android status
```

Use the list only when the pack id is unknown; it prints the available packs
as JSON. Do not select by a similar brand name or handoff directory. Use the
installed app's bundled pack identity when operating an existing build.

The start command applies the selected pack, prepares web assets, builds or
reuses the APK safely, starts or reuses the expected AVD, maintains clock
coverage, applies identity, and waits for correlated runtime/render/trust
proof. It returns while one persistent Control Room authority remains alive.

For an interactive foreground cockpit instead:

```sh
npm run lumo:cockpit
```

Open the exact URL printed by the launcher, select the pack and platform, then
use **Launch**. The default port is 4177 but can auto-increment when the
default is busy.

The preflight passes when:

- Pack and Story readiness are green.
- Device evidence matches the selected pack id, `configHash`, `runtimeHash`,
  canonical rendered source, and active external ID.
- Trust is green on Android.
- Push is green only when the selected story requires push.
- The configured story controls are visible and enabled.

If a row remains non-green after its one suggested next action, stop normal
operation and route to debugging. Read the
[expert diagnostics reference](../lumo-diagnostics-and-tooling/SKILL.md) only
when the blocker or debugging evidence requires raw instrument interpretation,
an artifact-agreement sweep, or the runtime-drift script.

## Guided Operating Path

1. Start in **00 First Demo** and follow its single **Next action**.
2. In **01 Demo Cockpit**, confirm pack, platform, SDK access, and active
   external ID. Use **Apply user** for every identity change.
3. Launch and wait for readiness. Never run controls against stale or
   uncorrelated device evidence.
4. Run only the configured Story Controls. Standard templates are authoring
   aids and do not make a Story ready.
5. Use **02 Activity Feed** as audience-readable proof. Filter to the current
   session for rehearsal; **Clear** archives first and begins a new session.
6. Use **Present** mode while screen-sharing.

Use Expert mode only for control-template engineering, raw REST authoring,
runtime contracts, launcher logs, debug events, REST responses, or Android
live-web overrides.

Read
[references/control-room-reference.md](references/control-room-reference.md)
when operating or explaining Control Room modes, controls, readiness blockers,
Activity Feed behavior, Pack Manager, REST safety, or the launcher HTTP API.
It is the detailed control catalog, not required for the basic path above.

## Platform Notes

- Android: prefer `node tools/lumo.mjs android start --pack <id>`. Use
  `--avd` only for an intentional supported AVD override.
- iOS: start `cd web-template && npm run dev` first; the current iOS shell
  loads `http://localhost:5173`. Launch iOS from the Control Room. Unsigned
  simulator builds do not support real push.
- Host-side REST actions run only in the launcher. Standard Story Controls
  inject the active external ID; Expert custom requests remain validated but
  require deliberate payload review. REST keys remain session/env state and
  never enter web or native assets.

Read
[references/device-operation-reference.md](references/device-operation-reference.md)
only when handling launcher ports, Android/iOS launch mechanics, state/log
locations, or safe host-side REST behavior.

## Rehearsal And Handoff

Before presenting:

1. Relaunch or apply the pack through the canonical path.
2. Confirm all story-relevant readiness rows are green.
3. Apply the intended external ID and wait for the device echo.
4. Run each Story Control once and confirm the expected Activity Feed proof.
5. Verify the Braze profile when the story uses REST access.
6. Preserve device identity between rehearsal and the meeting.

## Safety Invariants

- Never reset app data, uninstall the app, erase the simulator, or recreate
  the AVD as ordinary cleanup. These destroy SDK identity and push continuity.
- Never hand-edit generated runtime files. Change the pack and re-apply.
- Never demonstrate a stale pack or an active/uncertain Android
  `DEV OVERRIDE`; bundled-source proof is required for rehearsal and handoff.
- Run identity changes through the Control Room, not file edits or in-app
  workarounds.
- Use redacted Activity Feed archives and the redacted diagnostic bundle;
  never share raw launcher state or credential-bearing logs.
- Do not use `demo-studio/` as an operating surface.

## Provenance

Re-check behavior against `tools/lumo.mjs`, `tools/lumo-android-cli.mjs`,
`tools/demo-launcher.mjs`, `tools/control-room-template.mjs`,
`android-shell/tools/run-demo-emulator.sh`, `ios-shell/Sources/Config.swift`,
and `docs/demo-runtime-architecture.md`.
