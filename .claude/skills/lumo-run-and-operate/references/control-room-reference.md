# Control Room operating reference

Companion to `../SKILL.md`. Verified 2026-08-14 against `tools/lumo.mjs`,
`tools/lumo-android-cli.mjs`, `tools/lumo-pack-cli.mjs`,
`tools/demo-launcher.mjs` (built-in presets, executor, REST validation, HTTP
routes), and `tools/control-room-template.mjs` (UI, readiness gating, activity
filtering). All ids, types, and payload keys below are exact.

## Canonical CLI

```sh
node tools/lumo.mjs android setup [--check-only] [--skip-install] [--skip-avd]
node tools/lumo.mjs android doctor
node tools/lumo.mjs android start [--pack <id>] [--avd <name>] [--port <port>]
node tools/lumo.mjs android status
node tools/lumo.mjs android stop

node tools/lumo.mjs pack new <id> [--name <name>] [--description <text>]
node tools/lumo.mjs pack duplicate <source-id> <new-id> [--name <name>]
node tools/lumo.mjs pack validate [<id> | --all]
node tools/lumo.mjs pack open <id> [--config | --notes] [--print]
```

| Invocation | Effect |
|---|---|
| `android setup` | Android-targeted dependency install, dedicated AVD provision/verify, then doctor; Xcode does not block it |
| `android doctor` | Android-only readiness check |
| `android start` | Start or attach exactly one persistent Control Room authority, run apply/build/hash-aware install/launch/proof, then return while authority + clock guard remain alive |
| `android status` / `stop` | Inspect or deliberately stop the verified authority |
| `pack new` / `duplicate` | Create a local ignored `.demo-packs/` pack, omit credentials, generate `notes.md` handoff mappings |
| `pack validate` / `open` | Validate one/all packs or open/print config and notes |

Only `android start` accepts `--pack`, `--avd`, and `--port`. Only setup
accepts its skip/check flags. Use `npm run lumo:cockpit` for a foreground
Control Room and `node tools/demo-launcher.mjs --pack <id> --apply-only` only
for a non-launching apply. iOS launch remains a Control Room operation.

Relevant env vars (full axis: `lumo-config-and-flags`): `PORT`,
`BRAZE_DEMO_ANDROID_AVD`, `BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS` (default
15000), `BRAZE_CONTROL_ROOM_BODY_LIMIT` (default 262144),
`BRAZE_REST_API_KEY[_<PACK_ID>]`, `BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY`,
`BRAZE_DESIGN_SYSTEM_DIR`. Emulator script: `AVD`, `INSTALL_APP`,
`LAUNCH_APP`, `APP_ID`, `ANDROID_USER`, `RESET_APP_DATA`, `ANDROID_HOME`,
`ADB`, `EMULATOR`.

## Built-in control presets

Defined in `builtInPresets` (`tools/demo-launcher.mjs`). Origin `standard`
(the `change_user` template is `internal`). Every pack also contributes
`launcher.presets` (origin `pack_library`) and you can add staged controls
(origin `staged`).

### Device (SDK) transports — run on the selected app via bridge command

| Preset id | Label | Type | Default payload highlights |
|---|---|---|---|
| `sdk_change_user_template` | Change user | `change_user` | targets active external ID |
| `sdk_iam_trigger` | Trigger IAM event | `sdk_event` | `name: demo_iam_trigger`, `properties.source: launcher` |
| `sdk_refresh_cards` | Refresh Content Cards | `content_cards_refresh` | — |
| `sdk_push_permission` | Request push permission | `push_permission` | — |
| `sdk_push_readiness` | Verify push readiness | `push_readiness` | `reason: control_room` |
| `android_trust_diagnostics` | Verify Android HTTPS trust | `trust_diagnostics` | Android-only |
| `sdk_foreground_push` | Show push preview | `foreground_push` | `title`, `body`, `uri: /notifications` |
| `sdk_navigate_home` | Open app home | `navigate` | `route: /` |
| `sdk_log_event_template` | Log custom event | `sdk_event` | `name: demo_action` |
| `sdk_update_attribute_template` | Update user attribute | `sdk_attribute` | `attributes: { demo_stage: interested }` |
| `sdk_purchase_template` | Log purchase | `sdk_purchase` | `productId, price, currency, quantity` |

Device commands are delivered as base64 JSON: Android via
`adb shell am start -a com.braze.demoshell.DEMO_COMMAND` intent, iOS via
`xcrun simctl openurl booted "braze-demo://command?payload=..."`. Results come
back on the device-events callback.

### Host (REST) transports — run from the launcher process

| Preset id | Label | Type | Braze endpoint |
|---|---|---|---|
| `rest_event_template` | Track REST event | `rest_event` | `POST /users/track` (events) |
| `rest_attribute_template` | Track REST attribute | `rest_attribute` | `POST /users/track` (attributes) |
| `rest_purchase_template` | Track REST purchase | `rest_purchase` | `POST /users/track` (purchases) |
| `rest_campaign_trigger_template` | Trigger campaign | `campaign_trigger` | `POST /campaigns/trigger/send` — needs `campaignId` |
| `rest_canvas_trigger_template` | Trigger Canvas | `canvas_trigger` | `POST /canvas/trigger/send` — needs `canvasId` |
| `rest_export_user_template` | Verify user profile | `profile_export` | `POST /users/export/ids` |
| `rest_custom_request_template` | Custom REST request | `braze_rest_request` | any validated relative path |

REST presets always inject the active external ID: `/users/track` bodies get
`external_id`; campaign/Canvas triggers get
`recipients: [{ external_user_id, trigger_properties, send_to_existing_only: true }]`.
Profile export default fields: `external_id`, `first_name`,
`custom_attributes`, `custom_events`, `purchases`, `apps`, `push_tokens`.

### Sequence types (pack/staged controls only)

- `sdk_event_sequence` — `payload.events: [...]`, each becomes a
  `logCustomEvent` device command in order.
- `android_sequence` — `payload.commands: [{ action, payload }, ...]` raw
  bridge actions in order.

## Action type ↔ transport matrix (template editor)

Transports: `app_sdk` (selected platform), `android_sdk`, `ios_sdk`,
`braze_rest`. Platforms: `android`, `ios`, `host`, `browser`.

- SDK-only types: `change_user`, `sdk_event`, `sdk_attribute`,
  `sdk_purchase`, `sdk_event_sequence`, `content_cards_refresh`,
  `push_permission`, `push_readiness`, `trust_diagnostics`,
  `foreground_push`, `navigate`, `android_sequence`.
- REST-only types: `rest_event`, `rest_attribute`, `rest_purchase`,
  `campaign_trigger`, `canvas_trigger`, `profile_export`,
  `braze_rest_request`.
- Validation rejects cross-wiring ("SDK transport cannot execute Braze REST
  trigger actions", and vice versa). `iam_trigger` in the manual-trigger API is
  sugar for `sdk_event` with `name: demo_iam_trigger`.

## REST safety validation (exact rules)

From `validateBrazeRestRequest`:

- Methods: GET, POST, PUT, PATCH. DELETE → blocked.
- Path must start with `/`, must not be an absolute URL, must not contain `..`.
- Blocked path patterns: `/users/delete`, `/users/merge`,
  `/users/external_ids/*`, `/campaigns/trigger/schedule/delete`,
  `/canvas/trigger/schedule/delete`, `/messages/schedule/delete`,
  `/email/blacklist`, `/email/bounce/remove`, `/email/spam/remove`.
- `body.broadcast === true` → blocked.
- `/campaigns/trigger/send` and `/canvas/trigger/send` require a non-empty
  `recipients` array.
- Body ≤ 64 KB. Responses and stored requests pass through `redactSecrets`
  (keys matching api key/token/secret/password are replaced with
  `[redacted]`).

## Readiness checks and gating

Cockpit Readiness panel rows (from `readinessChecks()`):

| Row | Green when | Common non-green cause |
|---|---|---|
| Demo | A pack is selected | No pack |
| Braze | SDK key+endpoint configured; REST too if any REST controls exist | Missing session/env REST key |
| Device | Native app reported runtime matching manifest | Not launched, stale install, hash mismatch, launch job failed |
| Trust | Android HTTPS trust telemetry ready (auto-green on iOS) | Zscaler/TLS failure; check names the failing URL |
| Push | Push token telemetry current for active user | Token absent, wrong user, registration error |
| User | Pending = applied = device-reported external ID | Typed but not applied; device echo pending |
| Story | ≥1 pinned/ready story control | Nothing pinned |

Gating (`controlBlockReason`): every execute button is disabled while any of
these hold, and the button tooltip shows the reason —

1. `runtimeBlockReason` — device runtime missing, or pack id / configHash /
   source URL / external ID mismatch vs the manifest.
2. `identityBlockReason` — empty, un-applied, or un-echoed external ID.
3. Trust reason — for Android controls that need media/push trust
   (`requiresPushToken` or the `demo_iam_trigger` event).
4. Push reason — for controls with `requiresPushToken: true`.

Generic campaign/Canvas triggers are NOT push-blocked unless you mark them
push-dependent; the editor warns `message channel unverified`.

## Activity feed vs diagnostics classification

Audience feed (`audienceActivityTypes`): `change_user`, `sdk_event`,
`sdk_attribute`, `sdk_purchase`, `rest_event`, `rest_attribute`,
`rest_purchase`, `campaign_trigger`, `canvas_trigger`, `profile_export`,
`foreground_push`, `push_permission`, `content_cards_refresh` (also in the
diagnostics-only set — the diagnostics set wins, so refreshes land in Debug
Events), `content_card_impression`, `content_card_click`,
`braze_rest_request`. Jobs appear only on success/error; any `error` status
always surfaces.

Diagnostics-only (`diagnosticsOnlyTypes`): `bridge_action`, `runtime_ready`,
`content_cards`, `content_cards_refresh`, `fcm_token`, `trust_diagnostics`,
`demo_command`, `device_event`, `control_promoted`.

Categories assigned by the launcher (`activityCategory`): `launcher`, `sdk`,
`rest`, `message` (campaign/canvas/foreground push), `profile`,
`content_cards`, `push`, `diagnostics`, `error`. Severities: `success`,
`error`, `warning`, `info`. Newest-first, cap 240; REST response history
cap 40. Launcher start and clear operations add session boundaries. Exact or
correlated telemetry duplicates inside the dedupe window merge into one row
with `duplicateCount`, `firstSeenAt`, and `lastSeenAt`.

Activity operations:

- `POST /api/activity/archive` creates a redacted mode-0600 JSON archive under
  `.demo-launcher/activity-archives/` and returns it for download.
- `POST /api/activity/clear` archives first, clears the feed and REST response
  history, then begins a new session boundary.
- The Activity Feed can filter to the current `activitySession.id`.

## Launcher HTTP API (localhost only)

| Method + path | Purpose |
|---|---|
| `GET /` | Control Room UI |
| `GET /api/state` | Full public state (pack, profile, presets, runtime, ledger, jobs) |
| `GET /api/events` | Server-sent events stream of state |
| `GET /api/packs` | Pack list |
| `GET /api/pack-manager` | Pack library with source, notes, configHash/runtimeHash, authoring errors, and warnings |
| `POST /api/pack-manager/new` | Create a clean ignored local starter pack and generated `notes.md` |
| `POST /api/pack-manager/duplicate` | Copy a pack into ignored local workspace without credentials and regenerate `notes.md` |
| `POST /api/pack-manager/validate` | Validate one pack or the whole authoring library |
| `POST /api/pack-manager/open` | Open the pack directory, config, or notes on the host |
| `GET /api/diagnostics/bundle` | Download a redacted support bundle; credentials, tokens, personal identifiers, private-pack names, and user-specific paths are removed |
| `POST /api/activity/archive` | Archive and return a redacted copy of current activity |
| `POST /api/activity/clear` | Archive first, clear activity/REST history, and start a new session |
| `GET/POST /api/credentials` | Read (masked) / save pack config; REST key is session-only |
| `POST /api/active` | Select pack/platform/user (no apply) |
| `POST /api/identity/apply` | changeUser + cards refresh + trust + push readiness on device |
| `POST /api/run` | Start apply/build/launch job (`packId`, `applyOnly`, `platform`, `avd`, `simulator`) |
| `POST /api/presets/execute` | Run a control by `presetId` (+ `payloadOverride`, `externalId`) |
| `POST /api/triggers/execute` | Validated one-off manual trigger |
| `POST /api/controls/stage` / `update` / `visibility` / `promote` | Staged-control lifecycle |
| `POST /api/users/export` | Export active user profile |
| `POST /api/device-events` | Device telemetry callback (Android 10.0.2.2, iOS localhost) |
| `GET /api/jobs/<id>` | Single job status/logs |

Useful for AI agents operating headlessly, e.g.:

```sh
curl -s http://127.0.0.1:4177/api/state | python3 -c 'import json,sys; s=json.load(sys.stdin); r=s["active"]["runtime"]; print(r["manifest"]["id"], r["manifest"]["runtimeHash"], r["warnings"])'
```

Expected: pack id + hash and an empty warnings list when safe to demo.

## Braze cluster presets (credentials editor)

`custom`, `us-01` … `us-08`, `us-10`, `eu-01`, `eu-02`, `au-01`, `id-01`,
`jp-01`, `kr-01` — each fills the matching `sdk.<cluster>.braze.com` /
`https://rest.<cluster>.braze.com` (`.eu` for EU) endpoint pair. A mismatch
between SDK and REST cluster shows a warning note.
