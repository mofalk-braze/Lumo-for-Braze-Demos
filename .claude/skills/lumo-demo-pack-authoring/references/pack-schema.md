# demo-pack.json — exhaustive field reference

Verified 2026-07-03 against:

- `tools/demo-pack-utils.mjs` (`validatePack`, `validateContentCardSurfaces`,
  `demoConfigHash`, `applyDemoPack`) — load-time validation, runs every time a
  pack is listed or applied.
- `tools/validate-demo-runtime.mjs` (`validatePacks`) — the `npm run
  validate:demo-runtime` gate.
- `web-template/src/brand/brandConfig.ts` and
  `web-template/src/brand/content.ts` — the TypeScript shapes the web runtime
  actually consumes.
- `tools/demo-launcher.mjs` — preset `type` handling
  (`commandForPreset`, `commandsForPreset`, `restPayloadForPreset`,
  `builtInPresets`).
- `demo-packs/Lumo/demo-pack.json` — the committed reference pack.

Two validation layers exist and they are NOT identical:

| Layer | Runs when | Failure behavior |
|---|---|---|
| Load-time (`validatePack` in `tools/demo-pack-utils.mjs`) | Every `listDemoPacks()` / `getDemoPack()` call — i.e. any launcher or apply operation | Throws; the launcher/apply command errors out |
| Gate (`validatePacks` in `tools/validate-demo-runtime.mjs`) | `npm run validate:demo-runtime` | Prints failure, non-zero exit |

A third layer is the web runtime TypeScript shape. Keep validator, generated
config, and consuming components aligned whenever the content contract changes.

## Top-level fields

| Field | Required? | Enforced by | Shape / rules |
|---|---|---|---|
| `id` | Yes (load-time) | `validatePack`; regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` (kebab-case). Also re-checked by `validate:demo-runtime`, which additionally fails on duplicate ids across all packs (`Duplicate demo pack id: <id>`) | Stable kebab-case string. Never rename (see durable-pack doctrine in SKILL.md) |
| `name` | Yes (load-time) | `validatePack` | Display name; used in Control Room, Android seed `demo.packName`, sort order |
| `description` | No at load-time, **required by the gate** | `validatePacks` in validate-demo-runtime.mjs fails if missing | One-line summary. Include it always — a pack without it loads but fails `npm run validate:demo-runtime` |
| `brand` | Yes (load-time) | `validatePack` requires `brand.colors`, `brand.tabs` (array), `brand.demoUser` | See Brand section |
| `content` | Yes (load-time) | `validatePack` requires `content.hero`, `content.categories` (array), `content.rails` (array) | See Content section |
| `android` | No | Not validated | `{ defaultExternalId?, defaultProfileName? }` — fallbacks when `secrets.properties` has no `demo.externalId` / `demo.profileName` |
| `ios` | No | Not validated | Included in `configHash` computation (`demoConfigHash`), but no consumer was found in tools/ as of 2026-07-03 — treat as reserved |
| `launcher` | No | `launcher.presets` must be an array if present | `{ presets: Preset[] }` — see Presets section |
| `web` | No | `web.distDir` must be a string; `web.build` must be object or `false`; `web.build.command` must be a string | See Web section |

## configHash and runtimeHash

`demoConfigHash(pack)` (tools/demo-pack-utils.mjs) is
`sha256(JSON.stringify({ id, name, description, android, ios, brand, content, launcher, web }))`
truncated to 16 hex chars. Consequences:

- ANY edit to any of those fields (including preset payload text or a rail
  item's copy) produces a new configHash.
- The hash is written into the runtime manifest, the generated web config,
  Android `local.properties` (`demo.configHash`), and iOS `Config.swift`, and
  `validate:demo-runtime` asserts they all agree. Installed apps showing a
  different hash than the pack = stale runtime; re-apply and rebuild.
- `secrets.properties` is NOT part of the hash — credentials can change
  without invalidating an applied runtime.

`demoRuntimeHash(pack)` is runtimeHash v2: it combines configHash with the
active pack asset fingerprint and private app-surface fingerprint. It is the
deployment/readiness identity used across browser, Android, iOS, Control Room,
and Presenter Remote.

## `brand` — shape consumed by the web runtime (`BrandConfig` in brandConfig.ts)

| Field | Required by | Notes |
|---|---|---|
| `appName` | TS type | Internal app name |
| `displayName` | TS type | User-visible name |
| `tagline` | optional | |
| `logoText` | TS type | Short word/initials for the placeholder logo (Lumo uses `"LU"`) |
| `colors` | load-time (`brand.colors` must exist) + TS type | Exactly these 8 keys: `brand`, `brandDark`, `brandLight`, `accent`, `ink`, `muted`, `line`, `surface`. Hex strings |
| `tabs` | load-time (array) + TS type | `{ id, label, icon }[]` — `icon` is a lucide-react icon name. First tab is the default route |
| `flavorEvents` | TS type | See below |
| `demoUser` | load-time + TS type | `{ externalId, firstName, attributes }` — `attributes` is a free key/value map; prefer the standard attribute names below |

### `brand.flavorEvents[]` (FlavorEvent)

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | snake_case, app-specific storytelling event |
| `label` | Yes | Human label shown in UI |
| `anchor` | Yes | One of the fixed anchor event names (below). Type-checked as `AnchorEventName` in the web build |
| `emitAnchor` | No | If `true`, firing the flavor event ALSO emits its mapped anchor — use this so anchor-based Braze triggers never miss |
| `sample` | No | Representative properties object |

Anchor event names (fixed across every pack — `web-template/src/braze/events.ts`,
`AnchorEvents`): `screen_viewed`, `content_viewed`, `content_engaged`,
`offer_interaction`, `conversion_completed`, `loyalty_event`,
`preference_updated`.

Standard attribute names (`StandardAttributes`, same file): `loyalty_tier`,
`loyalty_points`, `home_location`, `favorite_categories`, `lifecycle_stage`,
`last_conversion_value`.

## `content` — shape consumed by the web runtime (`AppContent` in content.ts)

| Field | Required by | Notes |
|---|---|---|
| `hero` | load-time + TS type | `{ title, subtitle?, cta? }` |
| `categories` | load-time (array) | `string[]` |
| `rails` | load-time (array) | `ContentRail[]`: `{ id, title, items }`; items are `{ id, title, subtitle?, meta?, badge?, image?, category? }` |
| `contentCardRail` | load-time + web runtime | Required non-empty `{ title, placement }`; validated legacy shape. Neutral new packs use an `unmapped` placeholder, not an approved dashboard placement |
| `contentCardSurfaces` | optional; fully validated at load-time when present | See below |
| `bannerSurfaces` | optional; fully validated at load-time when present | Native SDK-owned Banner placements; see below |
| additional namespaces | optional | Pack-specific content consumed by a bespoke private app surface; keep it inside the ignored pack contract rather than adding a real brand namespace to shared tracked types |

### `content.contentCardSurfaces[]` — validated in `validateContentCardSurfaces`

All seven string fields are required and must be non-empty:

| Field | Rule | Meaning |
|---|---|---|
| `id` | required string | Stable local surface id |
| `placement` | required string | The Braze dashboard `extras.placement` value; cards route into this surface via exact string match (`contentCardSurfaceByPlacement` in content.ts) |
| `surface` | one of `inbox`, `feed`, `carousel`, `hero`, `account`, `status` | Product surface archetype |
| `screen` | required string | Route/screen id where the slot renders (matched by `contentCardSurfaceForScreen`) |
| `title` | required string | Local section title |
| `variant` | one of `hero`, `carousel`, `feed`, `inbox` | Render style |
| `emptyBehavior` | one of `hide`, `empty-state` | `hide` for contextual slots; `empty-state` for inbox-like surfaces |
| `maxCards` | optional; positive integer | Card cap; any other value fails load-time validation |

Legacy fallback behavior (content.ts): if `contentCardSurfaces` is undefined,
the runtime synthesizes one carousel surface on `home` from `contentCardRail`
(`emptyBehavior: 'hide'`, no `maxCards`). An explicitly empty surfaces array
suppresses that fallback. The neutral starter therefore keeps the required
`contentCardRail` shape with an `unmapped` sentinel and declares
`contentCardSurfaces: []`, so it assumes no Content Card channel or placement.

### `content.bannerSurfaces[]` — validated in `validateBannerSurfaces`

| Field | Rule | Meaning |
|---|---|---|
| `id` | required unique string | Stable local slot id |
| `placement` | required unique string | Exact Braze Banner placement id configured in the dashboard |
| `screen` | required string | App route/screen whose code resolves this surface |
| `height` | optional positive integer | Reserved slot height in CSS pixels; `NativeBannerSlot` defaults to 96 |

The shared Home screen renders entries whose `screen` is `home` through
`NativeBannerSlot`. A bespoke screen must resolve its own entries with
`bannerSurfacesForScreen(<screen>)` and mount `NativeBannerSlot` for each one.
Browser mode displays a layout placeholder; Android and iOS native shells own
real Banner refresh, mount, unmount, and rendering. Record every placement id
and dashboard object in generated `notes.md`.

## `launcher.presets[]` — Control Room controls shipped with the pack

Preset object fields (per `cleanPresetForStorage` in tools/demo-launcher.mjs):

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | Unique within the pack; Control Room finds presets by id |
| `label` | Yes | Button label |
| `description` | No | Tooltip/help text |
| `type` | Yes | One of the values below; unknown types fail at execution with `Unsupported preset type: <type>` |
| `payload` | Yes in practice | Shape depends on `type` |
| `transport` | No | `braze_rest`, `android_sdk`, `ios_sdk`, or `app_sdk`; normally inferred from `type` |
| `platform` | No | `android`, `ios`, or `host`; inferred when omitted (REST types → `host`, SDK types → active platform) |
| `requiresPushToken` | No | Boolean UI hint |

### Device/SDK preset types (`commandForPreset` / `commandsForPreset`)

Executed on the running shell via the bridge (the launcher→app command channel):

| `type` | Bridge action | Payload shape (verified) |
|---|---|---|
| `sdk_event` | `logCustomEvent` | `{ name, properties? }` |
| `sdk_attribute` | `setCustomAttribute` | key/value payload, e.g. `{ key, value }` or `{ attributes: {...} }` (both appear in committed presets/templates) |
| `sdk_purchase` | `logPurchase` | `{ productId, price, currency, quantity, properties? }` |
| `change_user` | `changeUser` | `{ externalId? }` (falls back to active external id) |
| `content_cards_refresh` | `requestContentCardsRefresh` | `{}` |
| `push_permission` | `requestPushPermission` | `{}` |
| `push_readiness` | `requestPushReadiness` | `{ reason? }` |
| `trust_diagnostics` | `requestTrustDiagnostics` | `{ reason? }` |
| `navigate` | `navigate` | `{ route }` |
| `foreground_push` | `foregroundPush` | `{ title, body, uri? }` |
| `sdk_event_sequence` | multiple `logCustomEvent` | `{ events: [{ name, properties? }, ...] }` |
| `android_sequence` | arbitrary command list | `{ commands: [{ action, payload? }, ...] }` |

### Host REST preset types (`restPayloadForPreset`)

Executed host-side by the launcher against the Braze REST API (needs
`braze.restEndpoint` in `secrets.properties` plus a host REST key — see
`lumo-secrets-and-sanitization`):

| `type` | Braze endpoint | Payload shape (verified) |
|---|---|---|
| `rest_event` | `POST /users/track` | `{ name, properties? }` |
| `rest_attribute` | `POST /users/track` | `{ attributes: {...} }` |
| `rest_purchase` | `POST /users/track` | `{ productId, price, currency?, quantity?, properties? }` |
| `campaign_trigger` | `POST /campaigns/trigger/send` | `{ campaignId, triggerProperties?, sendToExistingOnly? }` — recipient is always the active external id |
| `canvas_trigger` | `POST /canvas/trigger/send` | `{ canvasId, triggerProperties?, sendToExistingOnly? }` |
| `profile_export` | `POST /users/export/ids` | `{ fieldsToExport? }` (defaults to a sensible field list) |
| `braze_rest_request` | validated custom request | `{ method, path, body?, query? }`; DELETE, broadcast, and destructive endpoints are blocked by the launcher |

Built-in presets (change user, IAM trigger, cards refresh, push
permission/readiness, trust diagnostics, foreground push preview, navigate
home, plus one template per type above) ship in `builtInPresets` in
tools/demo-launcher.mjs — do NOT duplicate them in a pack; add only
pack-specific story presets.

For a hero action, the product bridge call, `flavorEvents[].anchor` and
`emitAnchor`, preset payload or `sdk_event_sequence`, dashboard trigger, and
`notes.md` must share one canonical event and property-type contract. A preset
whose label resembles the app action but emits a different event is not a
valid fallback.

Note: the Control Room's "promote" action (`promoteControl` in
tools/demo-launcher.mjs) writes a staged control back into the active pack's
`demo-pack.json` (2-space indent). Your pack file can therefore be legitimately
modified by the Control Room; diff it before committing.

## `web` — custom web builds (advanced)

| Field | Rule | Meaning |
|---|---|---|
| `web.distDir` | string | Use a prebuilt web dist instead of building `web-template/`; manifest `sourceMode` becomes `external-web-dist`. Relative paths resolve from the repo root |
| `web.build` | object or `false` | `false` = skip the build step. `{ command, args?, cwd? }` = custom build command; `cwd` falls back to `web.sourceDir`, then the pack directory, then repo root |
| `web.sourceDir` | string | Only used as the default `cwd` for `web.build` |

Default (no `web` block): the launcher runs `npm run build` in `web-template/`
and uses `web-template/dist`.

## `app-source/` — private bespoke product UI

Private screenshot-built source lives beside `demo-pack.json` at
`app-source/web-template/src/screens/local-pack/`. Expose it only through
`pack-app.tsx`. Pack apply mirrors that fixed directory into the ignored
working container and removes stale private code when the selected pack has no
app surface. Do not add a private pack id, brand name, route, import, or source
path to tracked `web-template` files.

## `secrets.properties` (ignored file, next to demo-pack.json)

Key names only — never commit values. Format is `key=value` lines
(`readProperties` in tools/demo-pack-utils.mjs; `#` comments allowed):

| Key | Purpose | Consumed by |
|---|---|---|
| `braze.apiKey` | Braze SDK API key (app identifier — safe-ish but treat as secret) | Android `local.properties` seed, iOS `Config.swift` |
| `braze.endpoint` | SDK endpoint, e.g. `sdk.iad-03.braze.com` | Same |
| `braze.restEndpoint` | REST endpoint URL, e.g. `https://rest.iad-03.braze.com` (non-secret) | Launcher REST calls; `restConfigured` flag |
| `demo.externalId` | Demo user external id override | Android seed, iOS `Config.swift` |
| `demo.profileName` | Demo profile name override | Android seed |
| `demo.displayName` | Display name override | Documented in demo-packs/README.md |
| `firebase.senderId` | FCM sender id | Android seed |

REST API keys do NOT go in this file: the launcher resolves them from a
Control Room session entry first, then env vars, then (if explicitly enabled)
a legacy `braze.restApiKey` line here. Full resolution order and env var
naming: `lumo-config-and-flags` §2. Policy/handoff: `lumo-secrets-and-sanitization`.

## What applying a pack generates (`applyDemoPack` in tools/demo-pack-utils.mjs)

| Generated file | Content |
|---|---|
| `web-template/src/brand/activeDemoConfig.generated.ts` | `activeDemoPackId`, `activeBrandConfig` (= pack `brand`), `activeAppContent` (= pack `content`), `activeRuntimeManifest` |
| `web-template/public/demo-runtime.json` | Runtime manifest: schema/runtimeHash version, id/name/externalId, configHash, runtimeHash, generatedAt, active asset base, source mode, and expected sources |
| `web-template/public/demo-assets/<id>/` | **Full replacement** copy of the pack's `assets/` dir (destination is deleted first, then recopied; missing `assets/` = empty) |
| `android-shell/.active-demo-pack` | The active pack id (one line) |
| `android-shell/local.properties` | Seed properties including pack id/name, configHash/runtimeHash, source identity, profile, callback, and selected-pack SDK values. A pre-existing non-generated file is backed up first |
| `ios-shell/Sources/Config.swift` | Regex upsert of `static let` values (only if the file already exists) |

Never hand-edit any of these; edit the pack and re-apply
(`npm run lumo:apply` for the Lumo pack, or
`node tools/demo-launcher.mjs --pack <id> --apply-only`).
