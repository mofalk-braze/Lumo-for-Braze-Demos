# Approved Build And Validation

Read this reference for every focused or end-to-end implementation.

## Contents

- [Implementation Intake](#implementation-intake)
- [Neutral Pack Scaffold](#neutral-pack-scaffold)
- [Delegated Build Gate](#delegated-build-gate)
- [Apply And Validate Loop](#apply-and-validate-loop)

## Implementation Intake

Resolve or explicitly record these inputs before editing:

| Input | Why It Matters |
|---|---|
| Approved target belief, hero journey, and do-not-build list | Prevents implementation from expanding the story |
| Existing pack or new neutral pack | Selects focused versus scaffold work |
| Target platforms | Determines native scope and proof |
| Screenshots, product references, and approved brand assets | Prevents invented product design |
| Exact product action, SDK operation, wire event or attribute, and typed properties | Aligns app, preset, and dashboard behavior |
| Content Card placement, Banner placement, IAM trigger, and push identity/deep link when used | Defines routing and visible response |
| Dashboard object dependencies, audience, ids, and API-trigger properties | Defines external work and notes mappings |
| Demo date and audience | Determines proof and fallback depth |

An approved `.demo-packs/<id>/DEMO.md` is the intent-and-scope source. The
generated `notes.md` is the dashboard/operator handoff. Do not invent logos,
workspace ids, placements, payloads, or push claims. A missing external id can
remain a named dependency when the story boundary itself is approved.

For a focused change, confirm the installed or active pack identity before
editing and deploy only that same pack. Do not select a pack from a matching
brand name or handoff directory.

For a story with push, confirm that the presenting teammate's Braze workspace
has the required Firebase service-account configuration. If unknown, schedule
`lumo-push-readiness-campaign` before live proof.

## Neutral Pack Scaffold

Skip this section for a focused change to an approved existing pack.

Create a new product concept from neutral structure in the ignored workspace:

```sh
node tools/lumo.mjs pack new sample-travel --name "Sample Travel" \
  --description "Approved travel lifecycle demo."
node tools/lumo.mjs pack open sample-travel --print
```

Never copy the Lumo reference pack and strip it down. Use `pack duplicate`
only when the user explicitly approved a close variant; duplicate preserves
the source style, story, events, placements, assets, and app surface.

Choose the kebab-case pack id once. Keep it customer-neutral if later public
promotion is plausible. Put the approved blueprint at
`.demo-packs/sample-travel/DEMO.md`, pack assets under `assets/`, and private
product code under
`app-source/web-template/src/screens/local-pack/pack-app.tsx`.

Create `.demo-packs/sample-travel/secrets.properties` locally with values from
the presenter's workspace:

```properties
braze.apiKey=<YOUR_SDK_API_KEY>
braze.endpoint=<YOUR_SDK_ENDPOINT>
braze.restEndpoint=<YOUR_REST_ENDPOINT>
demo.externalId=<DEMO_USER_EXTERNAL_ID>
demo.profileName=<PROFILE_NAME>
demo.displayName=<DISPLAY_NAME>
```

Do not put a REST API key in that file. Supply it through Control Room session
state or `BRAZE_REST_API_KEY_<PACK_ID>` in the shell running the launcher.

Confirm discovery:

```sh
node tools/demo-launcher.mjs --list
```

The result must include the intended pack with local source and, after local
credentials are added, secrets present. A missing pack means the directory
lacks `demo-pack.json` or its identity does not match the requested id.

## Delegated Build Gate

Reject implementation that violates any row:

| Area | Required Result |
|---|---|
| App action | Calls the shared bridge/provider and emits the approved event contract with typed properties |
| Dashboard fallback | Emits the same canonical dashboard trigger; use an SDK event sequence when it must mirror flavor plus anchor events |
| Content Cards | Uses explicit stable `contentCardSurfaces` placements rather than inventing a later mapping |
| Banners | Declares exact `bannerSurfaces` placement ids and mounts the native slot on the mapped screen |
| Private UI | Remains inside the ignored pack `app-source/` boundary with customer-specific assets inside the pack |
| Presets | Carry the approved ids and properties and do not duplicate generic built-ins |
| Generated files | Remain untouched; change the pack or source and re-apply |

Keep the product action, flavor-to-anchor mapping, fallback preset, dashboard
trigger, and `notes.md` on one canonical event and property-type contract. A
local UI transition without the approved SDK operation is not a complete demo
beat.

## Apply And Validate Loop

Repeat after every pack edit:

```sh
node tools/lumo.mjs pack validate <id>
node tools/demo-launcher.mjs --pack <id> --apply-only
npm run validate:demo-runtime
```

Build the browser runtime when product code or generated web content changed:

```sh
cd web-template && npm run build
```

Structural pack validation may pass while warning about unresolved notes
placeholders or Card, Banner, or IAM mapping drift. Treat those warnings as
unfinished handoff work, not demo readiness.

For an end-to-end build or any suspected drift, prove deterministic re-apply:

```sh
node -e "const m=JSON.parse(require('fs').readFileSync('web-template/public/demo-runtime.json'));console.log(m.configHash,m.runtimeHash)"
node tools/demo-launcher.mjs --pack <id> --apply-only
node -e "const m=JSON.parse(require('fs').readFileSync('web-template/public/demo-runtime.json'));console.log(m.configHash,m.runtimeHash)"
```

Both prints must match when the pack, active assets, and private app surface did
not change. A mismatch requires investigation before device proof.
