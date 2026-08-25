# Demo Packs

Demo packs are local app concepts that the Control Room applies before browser,
Android, or iOS rendering. The public source distribution intentionally commits
only sanitized packs such as `Lumo`. Customer, prospect, or brand-specific packs
belong in the ignored `.demo-packs/` workspace, not in the shared source path.

Each pack contains:

- `demo-pack.json` for public brand, content, event, and demo-user metadata.
- `secrets.properties` for local Braze credentials. This file is ignored.
- `DEMO.md` for an approved private target belief, hero journey, typed
  signal/surface contract, scope, and non-goals when the pack is built for a
  real demo.
- `notes.md` for exact dashboard ids, placements, presenter sequence, proof,
  reset, and fallback.
- Optional private screenshot-built UI under
  `app-source/web-template/src/screens/local-pack/`, exposed by
  `pack-app.tsx`. Local/customer pack code stays ignored.
- Optional `launcher.presets` in `demo-pack.json` for reusable Control Room controls:
  SDK events, SDK attributes, SDK purchases, REST `/users/track` events, and
  API-triggered campaign/canvas sends.

Required `demo-pack.json` identity fields:

- `id`: unique kebab-case stable id.
- `name`, `description`.
- `brand`: visual config, tabs, demo user, and flavor events.
- `content`: app content, rails, and Content Card placement metadata.
- optional `android`, `ios`, `launcher.presets`.

The optional Android configuration supports `defaultExternalId`,
`defaultProfileName`, and `sessionTimeoutSeconds`; iOS supports its own
`sessionTimeoutSeconds`. The session timeout is the number of seconds the app
may remain backgrounded before the native Braze SDK starts a new session on
foreground. Each platform value must be an integer of at least `1` and defaults
to `60` when omitted. Set both values when a pack relies on repeatable
session-start IAM timing. Both shells use a one-second minimum interval between
triggered actions so presenter-driven IAM tests do not inherit a platform-only
timing difference.

`brand.demoUser.attributes` are presenter-controlled seed values. Applying or
launching a pack does not automatically rewrite the Braze profile. Use the
Control Room's `Sync demo seed attributes` action when those defaults should be
sent through the native SDK for the active user.

## Content Card Surfaces

`content.contentCardRail` remains supported for legacy home rail demos. New
screenshot-built apps should prefer `content.contentCardSurfaces`, which declares
repeatable surfaces that route real Braze Content Cards by `extras.placement`.
The shared legacy fallback still requires a non-empty `contentCardRail.title`
and `contentCardRail.placement`; load-time validation rejects an incomplete
fallback instead of allowing a later web crash.

Each surface uses:

- `id`: stable local id.
- `placement`: the Braze dashboard `extras.placement` value.
- `surface`: one of `inbox`, `feed`, `carousel`, `hero`, `account`, `status`.
- `screen`: route or screen id where the slot renders.
- `title`: local section title.
- `variant`: one of `hero`, `carousel`, `feed`, `inbox`.
- `emptyBehavior`: `hide` for contextual slots, `empty-state` for inbox-like surfaces.
- optional `maxCards`: positive integer cap.

Add a Content Card surface only when the approved story needs one. An
inbox-style surface fits persistent message history; a contextual slot belongs
where it fits the source product action and screenshot layout. An explicitly
empty `contentCardSurfaces` array suppresses the legacy fallback. Keep the
required neutral `contentCardRail` shape unmapped until a real surface is
approved.

## Banner Surfaces

`content.bannerSurfaces` declares native Braze Banner slots:

- `id`: stable local slot id.
- `placement`: exact unique Braze dashboard placement id.
- `screen`: route/screen that renders the slot.
- optional `height`: positive CSS-pixel height; defaults to `96`.

The shared Home screen renders entries for `screen: "home"` with
`NativeBannerSlot`. Bespoke screens must resolve their own surfaces with
`bannerSurfacesForScreen()` and mount the same component. Browser mode is a
layout preview only; Android and iOS native shells own real Banner rendering.

## Pack Manager And Handoff Notes

Create, duplicate, validate, and open packs from Control Room → **Pack
Manager**, or from the repo CLI:

```sh
node tools/lumo.mjs pack new sample-pack --name "Sample Pack"
node tools/lumo.mjs pack validate sample-pack
node tools/lumo.mjs pack open sample-pack --notes
```

Use `new` for every new product concept. It starts with one Home tab, neutral
colors, empty message surfaces, and no assumed story event or presenter preset.
Never copy the Lumo pack and strip it down.

Use `duplicate <source-id> <new-id>` only for an intentional close variant.
Duplicate preserves the source app, styling, story, events, placements, assets,
and private surface; it never copies credentials and regenerates `notes.md`.

Both paths go to ignored `.demo-packs/`. Generated `notes.md` starts with the
action-to-SDK-to-typed-payload-to-Braze-to-visible-result contract and makes
Content Card, Banner, IAM, and push explicit yes/no story decisions. Complete
its dashboard objects, audience, presenter sequence, proof, reset, and fallback
fields before treating the pack as shareable.

`lumo pack validate` can structurally pass while warning that `notes.md` still
contains `<...>` placeholders or has drifted from declared Content Card,
Banner, or IAM mappings. Those warnings are unfinished handoff work, not demo
readiness.

Applying a pack generates `web-template/public/demo-runtime.json`, web config,
synced assets, Android seed metadata, and iOS runtime defaults. Validate with:

```sh
npm run validate:demo-runtime
```

When a local pack needs real Braze credentials, create an ignored
`secrets.properties` next to that pack. All packs share the Lumo Android
Firebase client app configured at `android-shell/app/google-services.json`.

`secrets.properties` may include SDK values and the non-secret REST endpoint:

```properties
braze.apiKey=
braze.endpoint=sdk.iad-03.braze.com
braze.restEndpoint=https://rest.iad-03.braze.com
demo.externalId=lumo-demo-user
demo.profileName=Lumo
demo.displayName=Lumo
```

REST API keys are host-only and are not saved by the Control Room. The launcher
resolves them from a session entry, `BRAZE_REST_API_KEY_<PACK_ID>`, or
`BRAZE_REST_API_KEY`. Legacy `braze.restApiKey` values in `secrets.properties`
are ignored unless `BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY=1` is set.

Firebase service account JSON is not a demo-pack file. Teammates receive it
outside Git only when they need to upload it into their own Braze workspace for
Android push.
