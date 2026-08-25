# Lumo Public Quickstart

Lumo is distributed as public source plus off-repo secrets. Teammates should be
able to clone the repo, install dependencies, apply the sanitized Lumo pack, and
launch the Web Demo Cockpit and Android shell locally.

## Fresh Machine Flow

### Agent-Guided Android-First Setup

The shortest supported path is to let an agent explore and operate the clone.
Claude Code automatically discovers the committed skills under
`.claude/skills/`; do not install or unpack `.claude/skills.zip`.

```sh
git clone <repo-url> Lumo-for-Braze-Demos
cd Lumo-for-Braze-Demos
claude
```

Give the agent this outcome-oriented prompt:

```text
Read CLAUDE.md, use lumo-build-and-env, and set up this clone for the supported
Android emulator. Run every safe step yourself. Pause only for manual GUI,
authentication, credential handoff, or keyguard migration steps. Apply the
Lumo pack, launch the persistent Control Room, launch Android in bundled mode,
and report evidence for pack id, runtimeHash, rendered source, SDK credentials,
and push readiness. Never wipe app or emulator data.
```

The agent should route first-time push setup to
`lumo-push-readiness-campaign`, and regressions on a machine that previously
worked to `lumo-debugging-playbook`. It must never ask for a credential value
in chat or write one into a committed file.

Plan roughly 45–90 minutes for a Mac that still needs Android Studio, SDK
packages, and the AVD image. A Mac with those prerequisites already installed
usually reaches the first bundled Android launch in 10–25 minutes. Network and
manual credential handoff time are outside those estimates.

### Manual Equivalent

```sh
git clone <repo-url> Lumo-for-Braze-Demos
cd Lumo-for-Braze-Demos
./bootstrap-lumo.sh --check --target android
./bootstrap-lumo.sh --install --target android
./bootstrap-lumo.sh --android-avd --target android
npm run lumo:apply
npm run lumo:cockpit
```

For agent automation, the target-aware surface can replace that manual
sequence:

```sh
node tools/lumo.mjs android setup
node tools/lumo.mjs android doctor
node tools/lumo.mjs android start --pack lumo-default
node tools/lumo.mjs android status
node tools/lumo.mjs android stop
```

Use `--avd <name>` only for a deliberate override. `start` returns after the
launch job but leaves one persistent launcher authority alive so its emulator
clock guard remains owned. Use `status` to inspect it and `stop` to end it.

Open the Control Room URL printed by the launcher, select `Lumo`, then use Apply
or Launch.

Setup proves the shared runtime. It does not choose or build a customer demo.
Continue with `docs/build-your-first-demo.md` for the evidence-to-story-to-app
workflow.

## Claude Setup

The project skills are already available when Claude Code starts in the repo.
For an incomplete brief, screenshots without a journey, or an existing Canvas
that needs an app proof, start with the solution front door:

```text
Use the project skill braze-solution-demo-campaign. Recommend one target belief
and one small journey from my evidence. Define the exact typed SDK signal,
Braze decision, message placement, proof, reset, fallback, and do-not-build
scope. Do not create a pack, copy Lumo, or mutate Braze until I approve the
DEMO.md blueprint.
```

After approval, `lumo-new-demo-campaign` creates the neutral pack and owns the
implementation-to-rehearsal path. `braze-demo-app-builder` implements focused
approved screens and event stories. Copyable prompts for screenshot-first,
Canvas-first, dashboard build, troubleshooting, and rehearsal work are in
`docs/build-your-first-demo.md`.

Use the plugin flag only for the optional namespaced implementation command.

Optional plugin command:

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

## Create Or Duplicate A Pack

Use Control Room → **Pack Manager**, or the equivalent source CLI:

```sh
node tools/lumo.mjs pack new sample-pack --name "Sample Pack"
node tools/lumo.mjs pack validate sample-pack
node tools/lumo.mjs pack validate --all
node tools/lumo.mjs pack open sample-pack --notes
```

Use `new` for every new product concept. It starts with neutral styling, one
Home tab, and no assumed event, story control, Content Card, Banner, IAM, or
push contract. Never copy the Lumo pack and strip it down.

Use `duplicate <source-id> <new-id>` only when the human explicitly wants a
close variant. It preserves the source app, styling, story, events, placements,
assets, and private surface while omitting credentials and regenerating
`notes.md`.

Both paths write to ignored `.demo-packs/`. Complete the generated story,
Content Card, Banner, IAM, push, dashboard-object, delivery-proof, reset, and
fallback mappings. `lumo pack validate` may structurally pass while reporting
unresolved handoff placeholders or mapping drift; resolve those warnings before
rehearsal or sharing.

## What Comes From Git

- Web template, Android shell, iOS shell, launcher tools, bootstrap scripts, and
  documentation.
- The canonical `.claude/skills/` runbook bundle for setup, Android push,
  operation, diagnostics, troubleshooting, packs, secrets, QA, architecture,
  solution-demo shaping, and guided demo building.
- The optional `plugins/braze-demo-builder/` compatibility command.
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
- `.claude/settings.local.json`, `.claude/launch.json`, skill archives, and
  other machine-local Claude state.

## Android-First Success Contract

Do not call setup complete because an emulator window opened. Require all of
these observable outcomes:

- The setup/doctor check has no failure for the Android target.
- `Braze_Demo_API_36` exists and launches without recreating or wiping it.
- The `Lumo` pack applies from source and runtime validation passes.
- The persistent Control Room owns the launch session.
- Android renders the bundled asset source, not a live-web override.
- Native telemetry agrees on pack id, `runtimeHash`, rendered source, and the
  active user.
- SDK credential context belongs to the selected pack.
- Notification permission and FCM token readiness are explicit before a push
  claim; a dashboard delivery is still a manual Braze workspace step.

First-time setup intentionally has manual boundaries: installing Android
Studio, accepting OS/tool licenses, placing the corporate CA when required,
receiving the Firebase service account outside Git, and entering local Braze
SDK credentials. The agent should explain the exact reason for each pause and
resume verification immediately afterward.

## Guided Control Room

The Control Room opens at `00 First Demo` in Guided mode:

- `Pack` confirms the active app concept.
- `App` combines SDK, native runtime, trust, identity, and only the push proof
  required by the selected story.
- `Story` accepts pack-owned or staged controls; generic templates do not make
  a walkthrough ready.
- When Story is missing, one button copies the solution-campaign starter prompt
  before any SDK, REST, push, or device setup. Once configured, it names the
  safest runtime action and recent Activity Feed rows provide the visible proof.
- `Help & Troubleshooting` shows guided cards and lets the SolCon download a
  redacted bundle for an agent.

Expert mode restores template and payload authoring, raw REST requests, hashes,
logs, REST responses, and development overrides. A native SDK-only story does
not require a REST API key merely because REST templates exist.

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
./bootstrap-lumo.sh --android-avd --target android
node tools/lumo.mjs android start --pack lumo-default
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
node tools/check-agent-skills.mjs
npm run validate:demo-runtime
npm run security:scan
npm run public:check
cd web-template && npm run build
```

On macOS, run `npm run test:ios-contracts` when the handoff includes iOS
credential or bridge/runtime-identity changes, then run the iOS simulator build.

`git status --short --ignored` should show `.demo-packs/` as ignored, not as
untracked files.
