# Demo Packs

Demo packs are local app concepts that the Control Room applies before browser,
Android, or iOS rendering. The shared SolCon distribution intentionally commits
only `SolCon Starter`, a sanitized pack for smoke testing the shells and runtime.
Customer, prospect, or brand-specific packs should be imported locally or kept on
private branches, not committed to the shared distribution path.

Each pack contains:

- `demo-pack.json` for public brand, content, event, and demo-user metadata.
- `secrets.properties` for local Braze credentials. This file is ignored.
- Optional `launcher.presets` in `demo-pack.json` for reusable Control Room controls:
  SDK events, SDK attributes, SDK purchases, REST `/users/track` events, and
  API-triggered campaign/canvas sends.

Required `demo-pack.json` identity fields:

- `id`: unique kebab-case stable id.
- `name`, `description`.
- `brand`: visual config, tabs, demo user, and flavor events.
- `content`: app content, rails, and Content Card placement metadata.
- optional `android`, `ios`, `launcher.presets`.

## Content Card Surfaces

`content.contentCardRail` remains supported for legacy home rail demos. New
screenshot-built apps should prefer `content.contentCardSurfaces`, which declares
repeatable surfaces that route real Braze Content Cards by `extras.placement`.

Each surface uses:

- `id`: stable local id.
- `placement`: the Braze dashboard `extras.placement` value.
- `surface`: one of `inbox`, `feed`, `carousel`, `hero`, `account`, `status`.
- `screen`: route or screen id where the slot renders.
- `title`: local section title.
- `variant`: one of `hero`, `carousel`, `feed`, `inbox`.
- `emptyBehavior`: `hide` for contextual slots, `empty-state` for inbox-like surfaces.
- optional `maxCards`: positive integer cap.

Default demo-building guidance is to provide an inbox-style surface when the
source app has notifications/messages or the story needs persistence, plus one
contextual slot where cards fit naturally into the screenshot content.

Applying a pack generates `web-template/public/demo-runtime.json`, web config,
synced assets, Android seed metadata, and iOS runtime defaults. Validate with:

```sh
npm run validate:demo-runtime
```

When a local pack needs real Braze credentials, create an ignored
`secrets.properties` next to that pack. All packs share the dedicated SolCon
Android Firebase app configured at `android-shell/app/google-services.json`.

`secrets.properties` may include SDK values and the non-secret REST endpoint:

```properties
braze.apiKey=
braze.endpoint=sdk.iad-03.braze.com
braze.restEndpoint=https://rest.iad-03.braze.com
demo.externalId=solcon-demo-user
demo.profileName=SolCon Starter
demo.displayName=SolCon
```

REST API keys are host-only and are not saved by the Control Room. The launcher
resolves them from a session entry, `BRAZE_REST_API_KEY_<PACK_ID>`, or
`BRAZE_REST_API_KEY`. Legacy `braze.restApiKey` values in `secrets.properties`
are ignored unless `BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY=1` is set.
