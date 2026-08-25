# Lumo Demo Shell Instructions

This repository is safe for public source distribution. Keep all credentials and
customer/private demo material out of Git.

## First Run

The project skills under `.claude/skills/` are committed and discovered
automatically. For a fresh clone, act as the setup operator: read
`lumo-build-and-env`, run safe setup and verification steps yourself, and pause
only when the teammate must complete a GUI, authentication, credential handoff,
or secure-keyguard migration step. Prioritize the supported Android emulator
path before optional iOS setup.

Use these commands from the repo root:

```sh
./bootstrap-lumo.sh --check --target android
./bootstrap-lumo.sh --install --target android
./bootstrap-lumo.sh --android-avd --target android
npm run lumo:apply
npm run lumo:cockpit
```

Do not wipe an AVD, clear app data, recreate device state, or enter a device
credential as a shortcut. A successful Android-first setup ends with the
Control Room running, the `Lumo` pack applied, the dedicated AVD reused, and
bundled native telemetry agreeing on pack id and `runtimeHash`.

For the guided Android target, use `node tools/lumo.mjs android
setup|doctor|start|status|stop`; only `start` accepts `--pack <id>`. Keep
the persistent authority alive while the Control Room and emulator are in use;
`start` returns after launch, while `status` and `stop` inspect or end that
authority. Do not reinterpret optional iOS setup as an Android failure.

Open the Control Room URL printed by the launcher. Use `Lumo` only to verify the
shared setup; never use its styling or story as the base for a new product
concept. Treat the launcher process as the sole state, credential,
orchestration, and SDK-command authority.

The Control Room starts in Guided mode at `00 First Demo`. Use its `Pack`,
`App`, and `Story` checks, one recommended next action, Activity Feed proof,
and `Help & Troubleshooting` cards before opening Expert mode. Expert mode owns
template engineering, raw REST, hashes, logs, REST responses, and development
overrides. Use Presenter Remote only for the active persona and approved story
controls. Keep Control Room Story Controls collapsed as the fallback. Do not
create a browser extension unless three rehearsals show repeated window-focus
or placement friction; any later wrapper stays thin and adds no authority.

## Demo Packs

- `demo-packs/` is for sanitized public packs only.
- `.demo-packs/` is the ignored local workspace for Claude-created, imported, or
  customer-specific packs.
- Do not commit `.demo-packs/`, screenshots from customers/prospects, or
  `secrets.properties`.
- Treat demo packs as the source of truth. Applying a pack generates web runtime
  config, runtime manifests, synced assets, Android seed metadata, and iOS
  runtime defaults.
- Do not hand-edit generated runtime files.
- Treat `configHash` as the public configuration fingerprint and `runtimeHash`
  v2 as the active configuration-plus-assets-plus-private-app-surface deployment
  identity. Only active-pack content belongs in generated and packaged output.
- Keep private pack `app-source/` and the fixed mirrored
  `screens/local-pack/` container ignored. Pack apply mirrors only
  `app-source/web-template/src/screens/local-pack/` into that container and
  removes stale private code when the selected pack has no app surface. Add
  bespoke app UI through `screens/local-pack/pack-app.tsx`; do not add imports,
  pack ids, paths, or routing branches for an ignored private pack to tracked code.

## Agent Skill Routing

Choose one primary lifecycle owner. Do not stack every plausible skill:

- `lumo-build-and-env`: fresh clone or machine through first bundled launch.
- `braze-solution-demo-campaign`: unapproved or ambiguous demo story.
- `lumo-new-demo-campaign`: approved end-to-end or focused implementation.
- `lumo-run-and-operate`: ordinary readiness, rehearsal, and presentation.
- `lumo-debugging-playbook`: previously working behavior that regressed.
- `lumo-push-readiness-campaign`: first-time Android push proof.
- `lumo-secrets-and-sanitization`: credential, sanitization, or secret incident.
- `lumo-change-control-and-qa`: validation, commit, publish, and handoff.

Use `lumo-start-here` only when the phase is unclear. Architecture,
configuration, Braze integration, pack schema, diagnostic instruments,
documentation ownership, focused builder mechanics, and plugin compatibility
are specialist references. Read one only when the primary workflow directs it
or the user explicitly asks that factual question.

For a new product concept, run `node tools/lumo.mjs pack new <id>` only after
story approval. It is neutral. Use `pack duplicate` only for an intentional
close variant because it preserves the source style, story, events, placements,
assets, and app surface. Store the approved private blueprint at
`.demo-packs/<id>/DEMO.md`, private UI under the pack's `app-source/`, and the
dashboard/operator handoff in generated `notes.md`. A structural validation
PASS with handoff warnings is not demo readiness.

The user-facing workflow and starter prompts are in
`docs/build-your-first-demo.md`.

Committed docs and code remain the source of truth. If a skill conflicts with
them, follow the committed contract and update the skill in the same change.

## Optional Claude Plugin

Project skills require no plugin flag. Load the compatibility plugin only when
you want the namespaced demo-build command:

```sh
claude --plugin-dir ./plugins/braze-demo-builder
```

Then run:

```text
/braze-demo-builder:demo-build
```

The optional command delegates an approved story to the canonical project
workflow. Route unapproved story selection to
`braze-solution-demo-campaign` first. New private packs belong
under `.demo-packs/`; only explicitly sanitized public packs belong under
`demo-packs/`.

## Push And Secrets

- `android-shell/app/google-services.json` is public Firebase Android client
  config for `com.braze.demoshell`.
- Firebase service account JSON is not committed. Teammates receive it outside
  Git only when they need to upload it into their own Braze workspace.
- Braze SDK keys, Braze REST keys, APNs keys, keystores, FCM server keys, and
  Firebase service account JSON must never be written into source files, demo
  packs, Android resources, web assets, or committed files.
- Each local Android emulator/app install generates its own FCM registration
  token. The token is visible in Control Room diagnostics/debug surfaces; it is
  not shared or committed.

## Validation

Before publishing or committing setup changes, run:

```sh
npm run lumo:apply
node tools/check-agent-skills.mjs
npm run check:precommit
npm run public:check
cd web-template && npm run build
```

For Android shell, bridge, push, manifest, or launch-flow changes, also run:

```sh
cd android-shell
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin
```

For iOS credential or bridge/runtime-identity contract changes on macOS, run:

```sh
npm run test:ios-contracts
```

`check:precommit` runs the focused launcher/operator/HTTP-boundary, pack, and
emulator-runner tests before runtime validation and the secret scan.
