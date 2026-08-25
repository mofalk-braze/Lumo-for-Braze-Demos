---
name: lumo-new-demo-campaign
description: >-
  Execute an approved Braze demo blueprint end to end in the Lumo Demo Shells
  repo: create a neutral pack, delegate screenshot UI and event-story work,
  wire Braze, prove it on a device, rehearse it, and leave a durable handoff.
  Use after the target belief, hero journey, signal/surface contract, and
  non-goals are approved, or when the user explicitly asks to implement an
  already approved plan. For "now what should I build", incomplete discovery,
  unbounded screenshots, or Canvas-first story shaping, use
  braze-solution-demo-campaign first.
---

# Lumo New-Demo Campaign: Approved Blueprint → Durable, Rehearsed Demo

This is an executable campaign, not a reference. Run the phases in order; each
has a gate you must observe before moving on. The end state is a **durable
pack**: a demo the owner does not have to keep touching — it re-applies
cleanly months later, its Braze dashboard wiring is written down inside the
pack itself, and nothing about it lives only in someone's head.

Precondition: the user has approved one target belief, one hero journey, the
signal/surface contract, and explicit non-goals. If that boundary is missing or
the request is still feature-led, invoke `braze-solution-demo-campaign` and do
not make the SolCon invent implementation details from a blank intake form.

Jargon (defined once): a **pack** is a folder with `demo-pack.json` + optional
`assets/` + an ignored `secrets.properties`; it is the source of truth for one
demo app concept. A **shell** is the native Android/iOS app that renders the
shared web runtime. The **Control Room** is the local operator web UI started
by `node tools/demo-launcher.mjs` (default `http://127.0.0.1:4177`). The
**configHash** is a 16-hex-char sha256 fingerprint of the pack's public fields
— it is how you prove device, web runtime, and pack agree. An **SDK key**
identifies the app to Braze from the device; a **REST key** authorizes
host-side Braze API calls and never enters app code. **FCM token** = the
per-install Android push address; **AVD** = the Android emulator definition.

## Orchestration map — delegate, don't duplicate

| Work | Delegate to |
|---|---|
| Incomplete evidence, story selection, scope pressure, screenshot-first or Canvas-first blueprint | `braze-solution-demo-campaign` |
| Story/screen design, screenshots → UI, Content Card placement advice | `braze-demo-app-builder` skill (or `/braze-demo-builder:demo-build` in a plugin session — see `lumo-plugin-workflow`) |
| Pack schema detail, field-by-field authoring, promotion/sanitization | `lumo-demo-pack-authoring` |
| Android push bring-up on a machine that has never had working push | `lumo-push-readiness-campaign` (Phases 5–6, their gates, for per-pack verification) |
| Commit gates and evidence standards | `lumo-change-control-and-qa` |
| A symptom to debug (push not arriving, blank WebView, TLS errors) | `lumo-debugging-playbook` |
| Secrets questions ("can I commit this?") | `lumo-secrets-and-sanitization` |

This file inlines every command the campaign itself needs, so you can run it
without hopping files. For the *why* behind any rule, see
`lumo-architecture-contract`.

---

## Phase 1 — Implementation intake gate

**PURPOSE.** Convert the approved story into build inputs. If an approved
`.demo-packs/<id>/DEMO.md` exists, treat it as the intent-and-scope source and
generated `notes.md` as the dashboard/operator handoff. Do not invent logos,
workspace ids, placements, payloads, or push claims; unresolved implementation
details remain named dependencies rather than guessed values.

**REQUIRED INPUTS.**

| # | Input | Why it blocks |
|---|---|---|
| 1 | Approved target belief, hero journey, and do-not-build list | Prevents implementation from expanding the story |
| 2 | Target platforms: browser harness, Android, iOS, or all | iOS is dev-mode only (Vite server, no push on unsigned simulator builds) — changes scope |
| 3 | Screenshots / product references / brand assets | Screens are built from these, not imagination |
| 4 | Logo / app-icon PNG status, and the agreed fallback if missing | Never fabricate a logo |
| 5 | Exact product action, SDK operation, wire event/attribute, and typed properties | Keeps the app action, preset, and dashboard contract aligned |
| 6 | Content Card `extras.placement`, Banner placement ids/screens, IAM trigger, and push identity/deep link | Exact identifiers route the visible response |
| 7 | Dashboard object dependencies: trigger/entry event, audience, campaign/Canvas ids, and API-trigger properties | Needed for Phase 6 wiring and `launcher.presets`; ids may remain explicit manual dependencies until created |
| 8 | Demo date and audience (exec / technical / workshop) | Sets the rehearsal deadline and fallback depth |

**GATE.** The story boundary is approved and every row is either resolved or
recorded as an explicit implementation dependency. If the story includes push,
also confirm that the presenting teammate's own Braze
workspace has the Firebase service-account JSON uploaded (past failure: push
built perfectly, never arrived, because the credential lived in someone
else's workspace). If unknown → schedule `lumo-push-readiness-campaign`
before Phase 7, not on demo day.

---

## Phase 2 — Pack scaffold in `.demo-packs/`

**PURPOSE.** Create the pack in the ignored local workspace with a stable id.
Customer/prospect packs go in `.demo-packs/` — NEVER `demo-packs/` (the
committed public tree) unless the human explicitly asks for a sanitized public
pack (that path runs through `lumo-demo-pack-authoring` + QA gates instead).
Customer names must never reach commits, branches, or the public tree.

**COMMANDS** (from repo root):

```sh
node tools/lumo.mjs pack new sample-travel --name "Sample Travel" \
  --description "Approved travel lifecycle demo."
node tools/lumo.mjs pack open sample-travel --print
```

`pack new` starts from neutral structure and styling with no assumed Braze
channels, story, events, presets, or placements. Use it for every new product
concept. Never copy the Lumo pack or another existing pack and then "strip it
down". Use `lumo pack duplicate` only when the human explicitly wants a close
variant, because duplicate intentionally preserves the source app, styling,
story, events, placements, assets, and private app surface.

Then edit `.demo-packs/sample-travel/demo-pack.json`:

- `id`: choose ONCE, kebab-case (validated against
  `^[a-z0-9]+(?:-[a-z0-9]+)*$` in `tools/demo-pack-utils.mjs`). **Renaming the
  id later changes the configHash, breaks the generated asset path
  (`/demo-assets/<id>/`), the `BRAZE_REST_API_KEY_<PACK_ID>` env var name, and
  every dashboard note that references it.** Keep the id customer-neutral if
  there is any chance of later promotion.
- Replace the neutral starter fields from the approved blueprint. Do not add a
  channel, event, placement, or presenter control merely because an older pack
  contains it.

Place the approved blueprint at `.demo-packs/sample-travel/DEMO.md`. Create
`.demo-packs/sample-travel/secrets.properties` locally with these documented
key names and real values from the presenter's workspace:

```properties
# Local-only. Never commit. Key names documented in demo-packs/README.md.
braze.apiKey=<YOUR_SDK_API_KEY>
braze.endpoint=<SDK_ENDPOINT e.g. sdk.fra-01.braze.eu>
braze.restEndpoint=<REST_ENDPOINT e.g. https://rest.fra-01.braze.eu>
demo.externalId=<pack-id>-demo-user
demo.profileName=<Display name>
demo.displayName=<First name>
```

REST keys never go in this file — export
`BRAZE_REST_API_KEY_<PACK_ID>` (uppercase, dashes→underscores) in the shell
that runs the Control Room, or paste per-session in the Control Room UI.
Screenshots and brand assets go in the pack's own `assets/`. Screenshot-built
product code goes under
`.demo-packs/sample-travel/app-source/web-template/src/screens/local-pack/`
with the adapter at `pack-app.tsx`. Never put private product code or assets in
tracked `web-template/src` or `web-template/public`.

**EXPECTED OBSERVATION.**

```sh
node tools/demo-launcher.mjs --list
```

prints JSON including your pack with `"source": "local"` and, after local
credentials are added, `"hasSecrets": true`.

**BRANCHES.** `Demo pack not found` on later commands → dir lacks
`demo-pack.json` or the id in the file doesn't match what you typed. Id
validation error → fix kebab-case; do it now, not after dashboard wiring.

---

## Phase 3 — Story build (delegated) with durability enforcement

**PURPOSE.** Build screens, content, events, and presets. The build itself is
owned by the `braze-demo-app-builder` skill (or the plugin command in a plugin
session) — hand it the Phase 1 intake answers and the pack path. This phase's
job is the **durability gate** on what comes back:

**GATE — reject the build if any of these fail:**

| Check | Durable | Fragile (reject) |
|---|---|---|
| App action and events | The product action calls the shared bridge/provider, emits the blueprint's exact flavor event and portable anchor with typed properties, and has one named canonical dashboard trigger | A click that only changes local UI, an undocumented payload, or a dashboard trigger that neither app nor fallback emits |
| Content Cards | `content.contentCardSurfaces` with stable `placement` strings (these are the dashboard `extras.placement` contract) | Legacy `contentCardRail` for new surfaces; placements you plan to "fix later" |
| Private product UI | Screenshot-built code lives in the ignored pack's `app-source/web-template/src/screens/local-pack/`; brand, content, assets, and presets stay in that pack | Customer names, routes, imports, screens, or assets hardcoded in tracked `web-template/src` or `public` |
| Presets | A fallback preset emits the same canonical dashboard trigger as the app action; use `sdk_event_sequence` when it must mirror both flavor and anchor events. REST/campaign/Canvas presets carry the approved ids and properties | A flavor-only preset for an anchor-triggered dashboard object, or an ad-hoc call that does not match the documented payload |
| Generated files | Untouched | Any hand-edit to `activeDemoConfig.generated.ts`, `demo-runtime.json`, `local.properties` — always fix the pack and re-apply |

`contentCardSurfaces` entries require all of: `id`, `placement`, `surface`
(inbox/feed/carousel/hero/account/status), `screen`, `title`, `variant`
(hero/carousel/feed/inbox), `emptyBehavior` (`hide` contextual /
`empty-state` inbox-like). Validation enforces this
(`tools/demo-pack-utils.mjs`).

---

## Phase 4 — Apply + validate loop

**PURPOSE.** Turn the pack into runtime artifacts and prove they're coherent.
Repeat this loop after every pack edit.

**COMMANDS.**

```sh
node tools/lumo.mjs pack validate <id>
node tools/demo-launcher.mjs --pack <id> --apply-only
npm run validate:demo-runtime
```

Browser harness check:

```sh
cd web-template && npm run dev
```

**EXPECTED OBSERVATION.** Pack validation structurally passes. Record any
handoff warnings as required Phase 6 work; they may remain during the build
loop, but not at demo-ready handoff. Apply prints `Applied demo pack: <name>`
and exits 0. Runtime validation prints exactly
`Demo runtime validation passed.` Vite serves
`http://localhost:5173` — the phone frame renders your screens with fixture
data (browser Content Cards are layout-only fixtures; real cards need a
shell). Applying generates: `web-template/src/brand/activeDemoConfig.generated.ts`,
`web-template/public/demo-runtime.json`, `web-template/public/demo-assets/<id>/`,
`android-shell/.active-demo-pack`, `android-shell/local.properties` (seed),
and `ios-shell/Sources/Config.swift` defaults (only if that file exists).

**Durability check (run it, don't assume):** re-apply with no pack changes
and confirm both the public `configHash` and deployment `runtimeHash` are identical:

```sh
node -e "const m=JSON.parse(require('fs').readFileSync('web-template/public/demo-runtime.json'));console.log(m.configHash,m.runtimeHash)"
node tools/demo-launcher.mjs --pack <id> --apply-only
node -e "const m=JSON.parse(require('fs').readFileSync('web-template/public/demo-runtime.json'));console.log(m.configHash,m.runtimeHash)"
```

Both prints must be identical. `configHash` covers public pack configuration;
`runtimeHash` v2 also covers active assets and the private app surface. Neither
includes timestamps or secrets. If either changes with no edit, stop and
investigate.

**BRANCHES.** Validation failure naming a pack field → fix `demo-pack.json`,
re-loop. Failure about hash/id disagreement between generated files → you (or
a tool) edited a generated file; re-apply overwrites it. Vite shows the wrong
brand → the last-applied pack wins; re-apply yours. A structural pack PASS with
warnings about unresolved `<...>` notes placeholders or Card/Banner/IAM mapping
drift can continue to build/device proof but means the handoff remains
unfinished; it is not demo readiness.

---

## Phase 5 — Device launch

**PURPOSE.** Get the story onto real shells. The Android APK packages the
built web dist into its assets (`file:///android_asset/demo/index.html`) — the
launch job builds the web dist itself (`npm run build` in `web-template/`),
then runs `./gradlew :app:validateDemoWebAssets :app:assembleDebug`, so a
launch is only current if that whole job succeeded after your last apply.

**COMMANDS.** Preferred: start the Control Room and use its Launch controls:

```sh
npm run lumo:cockpit        # prints "Braze Demo Control Room running at http://127.0.0.1:<port>"
```

Agent/CLI alternative for Android:

```sh
node tools/lumo.mjs android start --pack <id>
node tools/lumo.mjs android status
```

`start` returns after the launch job; the persistent Control Room authority
stays alive to own continuous clock coverage and telemetry until an explicit
`node tools/lumo.mjs android stop`.

iOS (only if in scope): launch from the Control Room; it runs xcodegen +
xcodebuild for the `BrazeDemoShell` scheme and boots the simulator. The iOS
shell loads the web app from the Vite dev server (`http://localhost:5173`) —
keep `cd web-template && npm run dev` running for any iOS session.

**EXPECTED OBSERVATION (the readiness gate).** In the Control Room, the
runtime chips show your pack id and deployment `runtimeHash`, and after the
shell boots the device echoes the same native runtime and canonical rendered
source back to the launcher. Any pack/hash/source/user mismatch surfaces as a
warning chip. **Zero warning chips plus correlated bundled-source proof = gate
passed.** Android launch also waits for native HTTPS trust diagnostics (Braze
image media + Firebase endpoints).

**BRANCHES.** Launch job fails mid-way → the emulator may still run an OLD
install; never present from it — re-run until `Ready`. Hash warning chip →
stale runtime drift; re-run the launch job (apply→build→install as one unit).
TLS/trust diagnostics failing on a corporate network → `lumo-debugging-playbook`
(Zscaler trust store story); do not fight this minutes before a meeting.
Emulator log: `/tmp/lumo-demo-emulator.log`. On-device diagnostics: long-press
the WebView.

---

## Phase 6 — Braze dashboard wiring (teammate's own workspace)

**PURPOSE.** Create the dashboard side and — the durable-pack core — record
every id in the pack itself so the pack is self-describing. A pack whose
dashboard wiring lives in chat history is not durable.

**STEPS.**

1. In the presenting teammate's Braze workspace, create the campaign/Canvas
   using the blueprint's canonical trigger. Prove the real app action and its
   fallback preset both emit that event with the documented property types.
2. Content Card campaigns: set key `placement` in the campaign's key-value
   pairs to the pack's `contentCardSurfaces[].placement` values, verbatim.
   (The shells route real cards to surfaces by `extras.placement`.)
3. Banner campaigns/Canvases: create the exact placement ids from
   `content.bannerSurfaces`; verify each mapped native screen, audience, and
   slot height. Browser placeholders are not Banner delivery proof.
4. API-triggered campaign/canvas ids: paste into the pack's
   `launcher.presets` entries of type `campaign_trigger` / `canvas_trigger`
   (payload carries the id), then re-run the Phase 4 loop — presets are pack
   fields, so this changes the configHash, as it should.
5. Complete the generated `.demo-packs/<Pack Dir>/notes.md`. Pack Manager and
   `lumo pack new|duplicate` create the template. Fill every Content Card,
   Banner, IAM, push, campaign/Canvas, audience, delivery-proof, presenter,
   and fallback mapping. Anyone must be able to re-wire a fresh workspace from
   this file alone.

**GATE.** `notes.md` exists, lists every id the demo touches, has no unresolved
handoff placeholders or mapping-drift warnings; the app action,
flavor/anchor mapping, fallback preset, dashboard trigger, and notes name the
same canonical event contract; presets are re-applied; and
`npm run validate:demo-runtime` still passes.

---

## Phase 7 — Push verification (only if the story includes push)

**PURPOSE.** Prove push end-to-end on the presenting machine — not "push
worked once on someone's laptop".

**ROUTE.** Run `lumo-push-readiness-campaign` Phases 5–6, their gates
(per-pack/per-user token verification and live delivery). Quick in-campaign
check: in the
Control Room, run the built-in preset **Verify push readiness** — the Push
Readiness state must show a token present (`tokenPresent`/ready) for the
active platform + demo user. Remember: each install has its own FCM token; a
token from a different install or an old install will not deliver.

**GATE.** A real push visibly arrives on the demo device, triggered the same
way you will trigger it live.

---

## Phase 8 — Rehearsal gate (checkable, not vibes)

**PURPOSE.** The demo is presentable when this table is all-green, twice.

| # | Check | How to verify |
|---|---|---|
| 1 | Scripted click-through of the full story, **twice**, no improvisation | Follow the beat list from Phase 3; second run uses only the Control Room + device |
| 2 | Activity Feed shows the expected event/trigger sequence | Control Room "Activity Feed" panel lists your SDK events / REST triggers in story order |
| 3 | runtimeHash and rendered-source agreement | Runtime chips show pack id + deployment hash with zero warning chips; device echoed the same hash, source generation, and user |
| 4 | Push token present for the demo user (push stories) | Phase 7 gate re-checked on the actual demo machine |
| 5 | Every risky beat has a **written** fallback | One line per beat in `notes.md`: "if X fails live → show Y instead" |

**BRANCHES.** Any red row → fix, then restart the table from row 1 (a fix can
invalidate earlier rows). Do not shorten the second run.

---

## Phase 9 — Day-of-demo failure modes (verified mechanics only)

| Failure mode | Prevention / fallback |
|---|---|
| **Stale runtime drift** — installed app shows an old pack/configHash mid-demo (this has burned us before) | Full re-apply + rebuild + install is a multi-minute Gradle/emulator job, not a live fix. Pre-flight the morning of: launch job to `Ready`, confirm zero hash-warning chips. |
| **Corporate network trust** — IAM media/FCM silently fail behind TLS inspection (Zscaler) | First launch of the day happens through the launcher wrapper BEFORE the meeting (it waits on trust diagnostics). Never first-launch live. If trust fails → `lumo-debugging-playbook`. |
| **Push flaky in the room** | Pre-stage a Content Card or IAM beat as the fallback proof of the same message (both are pull/trigger-based and don't depend on FCM delivery in the moment). Decide this in Phase 8, not live. |
| **Control Room port drift** — 4177 busy → launcher auto-increments the port | Read the printed `running at http://127.0.0.1:<port>` line; don't rely on a bookmarked URL. |
| **Temptation to reset app data to "fix" something** | **Never minutes before a demo.** Resetting/wiping destroys SDK device identity and the push token — new install = new FCM token = dead push. Explicit recovery only, with time to re-verify Phase 7. |

---

## Phase 10 — Aftercare and promotion

The pack stays in `.demo-packs/` indefinitely — that is its home, and the
durability checklist below is what makes "indefinitely" cheap. If the pack
should become a public example: sanitization (strip customer names, assets,
ids, endpoints) and promotion into `demo-packs/` are owned by
`lumo-demo-pack-authoring`; the commit itself must pass the
`lumo-change-control-and-qa` gates (`npm run check:precommit`,
`npm run public:check`, `cd web-template && npm run build`, plus native builds
when shell code changed). Never shortcut those.

---

## Durability checklist (the point of this skill)

A pack is durable when every row passes. Re-check after ANY later edit.

| # | Property | Verify with |
|---|---|---|
| 1 | Stable id, chosen once, kebab-case, customer-neutral if promotable | `node tools/demo-launcher.mjs --list` shows the same id as every note in `notes.md` |
| 2 | Stable `placement` strings matching dashboard `extras.placement` verbatim | Diff `contentCardSurfaces[].placement` against `notes.md` |
| 3 | One canonical dashboard trigger emitted by both the app action and fallback preset | Compare the app bridge call, flavor/anchor mapping, preset payload or sequence, dashboard object, and `notes.md` |
| 4 | Self-contained private app — assets and screenshot UI live under the ignored pack's `assets/` and `app-source/`, with nothing customer-specific tracked | Inspect the pack and confirm tracked routes/imports/source do not name the private app or pack |
| 5 | Self-describing pack notes (`notes.md` with every id, per `lumo-demo-pack-authoring`) | A teammate could wire a fresh workspace from the file alone |
| 6 | No generated-file edits, ever | `npm run validate:demo-runtime` passes right after a fresh `--apply-only` |
| 7 | Secrets only in ignored files (`secrets.properties`, env vars) | `npm run security:scan` passes; no key value in `demo-pack.json` or notes |
| 8 | Re-apply with no changes → identical configHash | The two-print check in Phase 4 |

## When NOT to use this skill

- Story boundary is not approved, discovery is incomplete, screenshots lack a
  journey, or an existing Canvas needs a product proof designed around it →
  `braze-solution-demo-campaign` first.
- Single-mechanic question ("what does `emptyBehavior` do", "which env var
  holds the REST key") → the owning sibling: `lumo-demo-pack-authoring`,
  `lumo-config-and-flags`, `braze-integration-reference`.
- Story/screen design detail (which surfaces, which screens from a
  screenshot) → `braze-demo-app-builder`.
- Environment doesn't exist yet (fresh machine) → `lumo-build-and-env` first.
- Just operating an already-built demo → `lumo-run-and-operate`.
- Something is broken and you're diagnosing → `lumo-debugging-playbook`.
- Push bring-up as its own project → `lumo-push-readiness-campaign`.
- Committing/publishing anything → `lumo-change-control-and-qa`.

## Open questions / candidates

- `demo-studio/` (prebuilt Electron artifact) is experimental and not part of
  this campaign.

## Provenance and maintenance

Verified 2026-08-14 against the repo by reading/running the cited files.
Re-verify before trusting, if time has passed:

- npm scripts (`lumo:apply`, `lumo:cockpit`, `validate:demo-runtime`,
  `security:scan`, `public:check`, `check:precommit`): `cat package.json`
- Canonical Android commands and flags (`setup`, `doctor`, `start`, `status`,
  `stop`; `start --pack/--port/--avd`): `node tools/lumo.mjs android --help`
- Pack Manager commands (`new`, `duplicate`, `validate`, `open`):
  `node tools/lumo.mjs pack --help`
- Intake list source: `plugins/braze-demo-builder/commands/demo-build.md` §3
- Pack id regex, required fields, `contentCardSurfaces` validation,
  `demoConfigHash` field list: `grep -n "validatePack\|demoConfigHash" tools/demo-pack-utils.mjs`
- Generated-file paths: `grep -n "generated" tools/demo-pack-utils.mjs`
- Launch job steps (web build → `:app:validateDemoWebAssets :app:assembleDebug`
  → emulator → identity → trust wait): `grep -n "runApplyBuildLaunch" tools/demo-launcher.mjs`
- Hash/user mismatch warnings + push readiness (`tokenPresent`) telemetry:
  `grep -n "expected\|pushReadiness" tools/demo-launcher.mjs`
- `secrets.properties` key names: `demo-packs/README.md`
- Validation success line: `npm run validate:demo-runtime` →
  `Demo runtime validation passed.`
