---
name: lumo-demo-pack-authoring
description: >-
  Expert/internal reference for Lumo demo-pack mechanics: demo-pack.json
  schema, assets, local credentials, authoring validation, stable identities
  and placements, notes handoff, and sanitized promotion. Invoke manually for
  exact pack questions, or read it when lumo-new-demo-campaign reaches pack
  creation or editing. It does not choose a demo story or orchestrate
  implementation.
disable-model-invocation: true
---

# Lumo Demo Pack Authoring

This is the expert pack-mechanics layer beneath `lumo-new-demo-campaign`.
Manual invocation remains supported for exact schema, lifecycle, validation,
and promotion work; approved implementation requests enter through the campaign.

A **demo pack** is a directory containing a `demo-pack.json` (public brand,
content, event, and demo-user metadata), an optional `assets/` folder (images
synced into the web runtime), and an ignored `secrets.properties` (local Braze
credentials). Packs are the source of truth: applying a pack generates the web
runtime config, a runtime manifest, synced assets, Android seed metadata, and
iOS runtime defaults. You never edit generated files — you edit the pack and
re-apply.

This skill covers the pack FILE: its schema, where it lives, how to create one,
how to keep it durable, and how to promote it to the public tree. It does not
design the demo story (see "When NOT to use" below).

Full field-by-field schema, preset type tables, and generated-file list:
`references/pack-schema.md` in this skill directory.

## Where packs live

| Location | Git status | Contents |
|---|---|---|
| `demo-packs/` | Committed | Sanitized public packs only. Today: `Lumo` (id `lumo-default`) |
| `.demo-packs/` | Ignored (`.gitignore` line `.demo-packs/`) | Local workspace for Claude-created, imported, and customer-specific packs. **Default destination for every new pack** |
| `demo-packs/*/secrets.properties` | Ignored (own `.gitignore` line) | Credentials for committed packs stay local too |

Discovery rules (verified in `tools/demo-pack-utils.mjs`):

- `listDemoPacks()` scans `demo-packs/` first, then `.demo-packs/`. Any
  subdirectory containing a `demo-pack.json` is a pack. Directory names do not
  need to match the pack id; the id inside always stays kebab-case.
- Lookup by id (`getDemoPack`) tries `demo-packs/<id>/` and `.demo-packs/<id>/`
  as literal directory names first, then scans both roots matching either the
  JSON `id` or the directory name. On a collision the committed root wins.
- Duplicate ids across packs are not rejected at load time, but
  `npm run validate:demo-runtime` fails with `Duplicate demo pack id: <id>`.
  Predicate: if two packs must coexist, their `id` values must differ.
- `lumo-default` sorts first in every pack list; the rest sort by `name`.

## Pack anatomy — the working subset

Minimum viable `demo-pack.json` (load-time validation in
`tools/demo-pack-utils.mjs` `validatePack` throws on any violation):

```jsonc
{
  "id": "sample-travel",          // kebab-case only: ^[a-z0-9]+(?:-[a-z0-9]+)*$
  "name": "Sample Travel",
  "description": "…",             // optional at load, REQUIRED by validate:demo-runtime
  "brand": {
    "appName": "…", "displayName": "…", "logoText": "AT",
    "colors": { "brand": "#475569", "brandDark": "#1E293B", "brandLight": "#E2E8F0",
                "accent": "#64748B", "ink": "#0F172A", "muted": "#64748B",
                "line": "#CBD5E1", "surface": "#F8FAFC" },
    "tabs": [ { "id": "home", "label": "Home", "icon": "Home" } ],   // lucide-react icon names; first tab = default route
    "flavorEvents": [],
    "demoUser": { "externalId": "sample-travel-demo-user",
                  "firstName": "Demo", "attributes": {} }
  },
  "content": {
    "hero": { "title": "…", "subtitle": "…", "cta": "…" },
    "categories": [],
    "rails": [],
    "contentCardRail": { "title": "Unmapped Content Cards", "placement": "unmapped" },
    "contentCardSurfaces": [],
    "bannerSurfaces": []
  },
  "android": { "defaultExternalId": "sample-travel-demo-user", "defaultProfileName": "Sample Travel" },
  "launcher": { "presets": [] }
}
```

Hard rules you will hit first (all verified in `validatePack` /
`validateContentCardSurfaces`):

- `id`, `name`, `brand`, `content` required; `id` must match the kebab-case
  regex.
- `brand.colors` (all 8 keys used by the theme), `brand.tabs` (array),
  `brand.demoUser` required.
- `content.hero`, `content.categories` (array), `content.rails` (array)
  required.
- Every `contentCardSurfaces` entry needs seven non-empty strings (`id`,
  `placement`, `surface`, `screen`, `title`, `variant`, `emptyBehavior`);
  `surface` ∈ inbox/feed/carousel/hero/account/status; `variant` ∈
  hero/carousel/feed/inbox; `emptyBehavior` ∈ hide/empty-state; `maxCards`, if
  present, a positive integer.
- `contentCardRail` is a required, validated legacy fallback shape. The neutral
  starter keeps an explicit `unmapped` placeholder; do not treat it as an
  approved channel or dashboard placement.
- Prefer explicit `contentCardSurfaces` for new work. An explicitly empty array
  suppresses the legacy fallback, so a neutral pack has no Content Card
  surface. Add only approved placements: an inbox surface uses
  `emptyBehavior: "empty-state"`; a contextual slot normally uses `hide`.

Launcher preset `type` values you can use in `launcher.presets` (verified in
`tools/demo-launcher.mjs`):

- Device/SDK (run in the shell via the bridge): `sdk_event`, `sdk_attribute`,
  `sdk_purchase`, `change_user`, `content_cards_refresh`, `push_permission`,
  `push_readiness`, `trust_diagnostics`, `navigate`, `foreground_push`,
  `sdk_event_sequence`, `android_sequence`.
- Host REST (run by the launcher against Braze): `rest_event`,
  `rest_attribute`, `rest_purchase`, `campaign_trigger`, `canvas_trigger`,
  `profile_export`, `braze_rest_request`.

Change-user, IAM trigger, cards refresh, push checks, and one template per
type already ship as built-ins — put only pack-specific STORY presets in the
pack. Payload shapes per type: `references/pack-schema.md`.

## Pack Manager And CLI

Prefer the supported authoring surface to manual directory copying:

```sh
node tools/lumo.mjs pack new sample-travel --name "Sample Travel"
node tools/lumo.mjs pack validate sample-travel
node tools/lumo.mjs pack validate --all
node tools/lumo.mjs pack open sample-travel --notes
```

Only for an intentional close variant of an existing app and story:

```sh
node tools/lumo.mjs pack duplicate <source-id> sample-travel-variant \
  --name "Sample Travel Variant"
```

The command grammar is `lumo pack new|duplicate|validate|open`; invoke it from
source as `node tools/lumo.mjs pack ...`. Add `--json` for an agent-readable
result, or `--print` with `open` when the agent needs the path without launching
a host app.

`new` and `duplicate` always write to ignored `.demo-packs/`. `new` is the
default for a new product or customer story: it starts with neutral styling,
one Home tab, empty channel surfaces, and no assumed events or presets.
`duplicate` is only for a close variant because it intentionally preserves the
source style, story, events, placements, assets, and app-source. It changes the
stable pack/user identity, excludes credential-like files, and regenerates
`notes.md` instead of copying old dashboard mappings. The Control Room's **Pack
Manager** exposes the same safe operations and shows authoring validation,
notes presence, `configHash`, and `runtimeHash`.

Every generated `notes.md` contains explicit dashboard handoff tables for:

- Content Cards: app surface, screen, exact `extras.placement`, variant, and
  dashboard object/test result.
- Banners: app surface, screen, exact Braze placement id, slot height,
  dashboard object/audience/test result.
- IAM: story step, dashboard delivery, trigger event, operator action,
  re-eligibility, and test result.
- Push: campaign/Canvas, active external id, Firebase service-account setup,
  deep link/action, readiness, delivery proof, and fallback.

## configHash And runtimeHash

`configHash` is a 16-char sha256 fingerprint of the pack's public fields
(`id`, `name`, `description`, `android`, `ios`, `brand`, `content`,
`launcher`, `web` — `tools/demo-pack-utils.mjs` `demoConfigHash`). It is
stamped into every generated artifact and the installed apps;
`validate:demo-runtime` asserts they all agree. Any pack edit changes the
hash, which is exactly how stale-runtime drift is detected — so after ANY pack
edit: re-apply, rebuild, and confirm the hash matches before presenting
(non-negotiable #1). `runtimeHash` v2 adds active assets and the private app
surface to that public fingerprint and is the deployment/readiness identity.
`secrets.properties` is not hashed. Before presenting, require runtimeHash plus
rendered-source agreement, not configHash alone.

## Runbook: create a new pack

Terms: "apply" = generate runtime files from a pack; "Control Room" = the
launcher web UI at `http://127.0.0.1:4177`.

1. Create a neutral starter for every new concept. Duplicate only when the
   user explicitly wants a close variant of an existing story. Both go to
   `.demo-packs/` and generate a dashboard handoff:

   ```sh
   node tools/lumo.mjs pack new sample-travel --name "Sample Travel"
   # Only for an intentional close variant that preserves source style/story:
   node tools/lumo.mjs pack duplicate <source-id> sample-travel-variant \
     --name "Sample Travel Variant"
   ```

   The `id` inside is the durable identity. Open the generated sources with
   `node tools/lumo.mjs pack open sample-travel`.

2. Edit `.demo-packs/sample-travel/demo-pack.json`:
   - Keep the fresh kebab-case `id` created by the CLI — duplicate ids fail
     validation. Pick it once, keep it forever (doctrine below).
   - Rewrite `name`, `description`, `brand`, `content` for the story. Keep
     `flavorEvents[].anchor` pointing at the fixed anchor events
     (`screen_viewed`, `content_viewed`, `content_engaged`,
     `offer_interaction`, `conversion_completed`, `loyalty_event`,
     `preference_updated`) with `emitAnchor: true`.
   - Set `android.defaultExternalId` / `defaultProfileName`.

3. Add images under `.demo-packs/sample-travel/assets/`. On apply they are
   synced to `web-template/public/demo-assets/<id>/` as a **full
   replacement** (destination deleted, then recopied) and served under
   `/demo-assets/<id>/…`. Keep every asset the pack needs inside its own
   `assets/` dir; reference nothing from other packs.

4. Complete `.demo-packs/sample-travel/notes.md`, then create
   `.demo-packs/sample-travel/secrets.properties` with real values locally,
   never committed. Keys (names only — values come from
   the presenter's own Braze workspace):

   ```properties
   braze.apiKey=<YOUR_SDK_API_KEY>
   braze.endpoint=<YOUR_SDK_ENDPOINT e.g. sdk.iad-03.braze.com>
   braze.restEndpoint=<YOUR_REST_ENDPOINT e.g. https://rest.iad-03.braze.com>
   demo.externalId=<DEMO_USER_EXTERNAL_ID>
   demo.profileName=<PROFILE_NAME>
   demo.displayName=<DISPLAY_NAME>
   firebase.senderId=<FCM_SENDER_ID>
   ```

   REST API keys never go in this file — export
   `BRAZE_REST_API_KEY_<PACK_ID>` (uppercase, dashes→underscores, e.g.
   `BRAZE_REST_API_KEY_SAMPLE_TRAVEL`) or enter it per-session in the Control
   Room. Details: `lumo-secrets-and-sanitization`.

5. Validate + apply loop (repeat after every edit):

   ```sh
   node tools/lumo.mjs pack validate sample-travel
   node tools/demo-launcher.mjs --pack sample-travel --apply-only
   npm run validate:demo-runtime
   ```

   - Apply prints its job log; a schema violation throws with the exact
     failing field (e.g. `… is missing required string field: placement`).
   - `validate:demo-runtime` must end in success; failures name the mismatch
     (duplicate id, kebab-case, generated-file hash disagreement, missing
     built dist).
   - `lumo pack validate` can structurally pass while warning that `notes.md`
     still contains `<...>` placeholders or has drifted from declared Card,
     Banner, or IAM mappings. Warnings mean the handoff is unfinished; a
     structural PASS alone is not demo readiness.
   - If the web app itself must be checked, build it:
     `cd web-template && npm run build`.

6. Run it via the Control Room (`npm run lumo:cockpit`) — launching devices
   and presenting is `lumo-run-and-operate` territory.

## Durable-pack doctrine

Owner priority: packs you do not have to keep touching. Each rule below exists
because breaking it silently breaks a live dependency.

| Rule | Why (the dependency) |
|---|---|
| Pick the kebab-case `id` once; never rename it | `configHash` input; asset URL base `/demo-assets/<id>/`; `android-shell/.active-demo-pack` marker; REST key env var name `BRAZE_REST_API_KEY_<PACK_ID>`; any launch links or notes referencing the id |
| Treat every `placement` string as API contract | Cards route by exact string match on the Braze dashboard `extras.placement` value (`contentCardSurfaceByPlacement`). A typo or rename means cards silently route nowhere — the demo shows an empty rail with no error |
| Keep app, preset, anchor, dashboard, and notes on one trigger contract | Anchors are portable only when the real app action and any fallback preset both emit the event the dashboard actually uses; property names and types must match too |
| Keep all brand assets inside the pack's own `assets/` | Asset sync is per-pack full replacement; cross-pack references break the moment the other pack changes or is absent |
| Prefer explicit `contentCardSurfaces`; keep `contentCardRail` as the validated legacy shape only | New packs set surfaces to `[]`, which suppresses the unmapped fallback; add only exact approved placements and mount points |
| Complete the generated `notes.md` dashboard handoff | Pack Manager and CLI create/regenerate the template for Content Cards, Banners, IAM, push, presenter sequence, local setup, proof, and fallback; `lumo pack validate` warns when notes are absent |
| Diff `demo-pack.json` after Control Room sessions | The Control Room "promote" action legitimately writes staged presets back into the pack file |

## Promotion to public `demo-packs/`

Only when the user explicitly wants a sanitized public pack. Checklist — every
box, in order:

1. Sanitize content: no customer/prospect names or brand identifiers anywhere
   — pack `id`, `name`, copy, asset FILENAMES, image contents/screenshots,
   preset labels. (Standing rule: customer material never enters the public
   tree.) Check:

   ```sh
   grep -ri "<customer-name>" ".demo-packs/<Pack Dir>"
   ls -R ".demo-packs/<Pack Dir>/assets"
   ```

2. Remove the pack's live credentials BEFORE moving anything — don't rely on
   the `demo-packs/*/secrets.properties` gitignore rule alone as the only
   thing standing between a live key and the public tree:

   ```sh
   rm -f ".demo-packs/<Pack Dir>/secrets.properties"
   ```

   (Back up its values locally first if you'll need them again — you can
   recreate the file after promotion, since the public copy stays local-only.)

3. Move the now-secret-free pack (id stays stable through the move):

   ```sh
   mv ".demo-packs/<Pack Dir>" demo-packs/<PackName>
   ```

4. Confirm no secrets travel, as defense in depth (the gitignore rule is the
   backstop, not the primary control — step 2 already removed the file):

   ```sh
   git status --short --ignored | grep -E "secrets.properties|\.demo-packs"
   ```

   Expected: no tracked `secrets.properties` under `demo-packs/<PackName>`,
   and `.demo-packs/` still shows with `!!` (ignored). If `.demo-packs/` is
   NOT listed as ignored → stop, fix `.gitignore` before anything else.

5. Re-apply and run the full gate:

   ```sh
   node tools/demo-launcher.mjs --pack <id> --apply-only
   npm run validate:demo-runtime
   npm run security:scan
   npm run public:check
   cd web-template && npm run build
   ```

   All must pass. `public:check` independently fails on tracked
   `secrets.properties`, anything under `.demo-packs/`, and `.demo-packs/`
   not being gitignored (`tools/public-readiness-check.mjs`) — this is the
   backstop for step 4, not a substitute for removing the file in step 2.

6. Commit only when the user asks; evidence standards and the full commit
   gate are `lumo-change-control-and-qa` territory.

## When NOT to use this skill

- Designing the demo STORY — which screens, event narrative, Content Card
  placement strategy, or what to build from incomplete discovery/screenshots →
  `braze-solution-demo-campaign`.
- Any approved focused implementation or blueprint-to-rehearsed-demo campaign
  → `lumo-new-demo-campaign`; it reads this pack reference and the internal
  builder only when those mechanics are needed.
- Applying, launching devices, presenting, Control Room operation →
  `lumo-run-and-operate`.
- Secrets handling beyond key names, REST key resolution, handoff →
  `lumo-secrets-and-sanitization`.
- Every config axis across the repo (env vars, launcher flags,
  local.properties) → `lumo-config-and-flags`.
- Interpreting validator/doctor output in depth → `lumo-diagnostics-and-tooling`;
  symptom triage → `lumo-debugging-playbook`.
- Why the pack→generated-files architecture exists and its invariants →
  `lumo-architecture-contract`.

## Open questions / candidates

- The `ios` top-level pack field is included in `configHash` but no tool
  consumes it as of 2026-07-03 — treat as reserved; do not build on it.
- `sdk_attribute` payloads appear in two shapes in committed sources
  (`{ key, value }` in the Lumo pack; `{ attributes: {...} }` in the built-in
  template). Both are passed through to the bridge; if one misbehaves on a
  platform, verify against the bridge handler before relying on it.
- `notes.md` is now generated for new/duplicated packs and checked by authoring
  validation. Runtime apply still consumes only the pack, assets, app-source,
  and local credential carrier.

## Provenance and maintenance

Verified 2026-07-03 against the repo at
the repository root. Re-verify before
trusting, anything here can drift:

- Load-time schema + generated files:
  `grep -n "validatePack\|applyDemoPack" tools/demo-pack-utils.mjs`
- Duplicate-id and gate checks:
  `grep -n "Duplicate demo pack id\|kebab-case" tools/validate-demo-runtime.mjs`
- Preset types:
  `grep -n "case '" tools/demo-launcher.mjs`
- Web runtime shapes: `web-template/src/brand/brandConfig.ts`,
  `web-template/src/brand/content.ts`; anchors:
  `web-template/src/braze/events.ts`
- npm scripts: `grep -n "lumo:apply\|validate:demo-runtime\|security:scan\|public:check" package.json`
- Ignore rules: `grep -n "demo-packs" .gitignore`
- Reference pack: `demo-packs/Lumo/demo-pack.json`; pack docs of record:
  `demo-packs/README.md` (that doc wins on conflict)
