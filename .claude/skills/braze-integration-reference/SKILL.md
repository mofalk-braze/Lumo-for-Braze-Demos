---
name: braze-integration-reference
description: >-
  How the Braze integration actually works in the Lumo demo shells repo — key
  taxonomy (SDK API key vs REST key vs google-services.json vs Firebase service
  account vs APNs), the web↔native brazeBridge contract and action vocabulary,
  the braze-demo-sync/v1 envelope, how Content Cards route to placements,
  Control Room REST safety, and how the FCM/APNs token lifecycle works. Use
  when someone asks "how does the SDK work here", "which key goes where",
  mentions "bridge", "brazeBridge", "changeUser", "what does extras.placement
  do", "how does REST auth work here", "users/track", "campaign trigger",
  "canvas trigger", "service account", "cluster", "iad-03",
  "registeredPushToken", or asks why an SDK/Braze call behaves the way it
  does — the mechanism, not the symptom. For "Content Cards not showing" or
  "no FCM token" as a live problem to fix, use `lumo-debugging-playbook` or
  `lumo-push-readiness-campaign`; this is the reference for the Braze domain
  layer, it does not run demos or fix push step-by-step.
---

# Braze Integration Reference (Lumo Demo Shells)

Vocabulary used below: a **pack** is a demo definition (`demo-pack.json` +
ignored `secrets.properties`); the **shells** are the native Android/iOS apps
hosting the shared web UI in a WebView; the **Control Room** is the local
operator server (`tools/demo-launcher.mjs`, default `http://127.0.0.1:4177`);
the **bridge** is the message channel between the web UI and the native shell;
**configHash** is the fingerprint of the applied pack, embedded in every
generated runtime.

## 1. Key taxonomy — which credential goes where

This is the single most-confused topic. One table, memorize it.

| Credential | What it is | Where it lives here | Secret? |
|---|---|---|---|
| Braze **SDK API key** (`braze.apiKey`) | Identifies your app workspace to the client SDK. Ships inside every real customer app, so not privileged — but kept local by repo policy. | Ignored local files only: `demo-packs/*/secrets.properties`, `android-shell/local.properties`, `ios-shell/Sources/Config.swift` (`Config.brazeAPIKey`), and on-device credential stores | Local-only (policy) |
| Braze **SDK endpoint** (`braze.endpoint`) | Cluster host the SDK talks to, e.g. `sdk.iad-03.braze.com` | Same files as the SDK key | No |
| Braze **REST API key** | Privileged server key (can export users, trigger sends) | Host-only: Control Room session entry or env var — never in any file | **Yes** |
| Braze **REST endpoint** (`braze.restEndpoint`) | Cluster REST host, e.g. `https://rest.iad-03.braze.com` | Pack `secrets.properties` (it is not itself secret) | No |
| Firebase **CLIENT config** (`google-services.json`) | Public Android client config for app `com.braze.demoshell` in project `braze-sc-demo-shell`; embedded in every APK | **Committed**: `android-shell/app/google-services.json` | No |
| Firebase **SERVICE ACCOUNT JSON** | Server credential Braze uses to send via FCM. Uploaded into the Braze dashboard (push settings) of each teammate's own workspace | Off-repo only, distributed outside Git | **Yes** |
| **APNs signing material** (`.p8`, certs, provisioning profiles) | Apple push credentials + build signing | Off-repo only; iOS push additionally needs an org-signed build | **Yes** |
| **FCM registration token** | Per-app-install device push identity; regenerated per install | Runtime only; visible in Control Room diagnostics and the Android debug drawer | Never share/commit |

Braze **cluster** concept: each workspace lives on a cluster (US-01…US-08 =
`iad-01…iad-08`, EU = `fra-*`). The SDK uses the `sdk.<cluster>` host, REST
uses `https://rest.<cluster>` — same cluster, different hosts. The web Setup
screen offers presets (`web-template/src/screens/Setup.tsx`, `CLUSTERS`
array: US-01…US-08 = `sdk.iad-01…08.braze.com`, EU-01/EU-02 =
`sdk.fra-01/02.braze.eu`; default selection US-03). This is a *different,
smaller* list from the Control Room's credential-editor presets (which add
US-10, AU-01, ID-01, JP-01, KR-01 — see `lumo-run-and-operate` §2); both are
correct, they are just two different surfaces. If SDK data flows but
REST calls 401/404, check that `braze.restEndpoint` matches the same cluster
as `braze.endpoint`.

For the committed-vs-local ledger, env-var conventions, and the handoff
protocol, see `lumo-secrets-and-sanitization`.

## 2. Version pins (do not "upgrade to latest")

| Dependency | Pinned | Why (verbatim reason from the build file) | File |
|---|---|---|---|
| `com.braze:android-sdk-ui` | `42.3.1` | (no comment in the build file — this is simply the current integration version, not a pin against a known-bad newer release) | `android-shell/app/build.gradle.kts` |
| `com.google.firebase:firebase-messaging` | `25.0.1` | "The Pixel_10_Pro Android 37 Play Store image currently ships GMSCore 26.11.x. firebase-messaging 25.1.0 requires a newer Play Services floor, so keep this pinned until the emulator image catches up." | `android-shell/app/build.gradle.kts` |
| Braze Swift SDK (`BrazeKit` + `BrazeUI`) | `from: "11.9.0"` | "15.1.0 fails to compile under Xcode 26.5 / Swift 6.3 (internal BrazeUI↔BrazeKit mismatch in Braze's SDK). 11.9.0 is known-good and fully featured." | `ios-shell/project.yml` |

Verify before citing:
```sh
grep -n "android-sdk-ui\|firebase-messaging" android-shell/app/build.gradle.kts
grep -n -A4 "braze-swift-sdk" ios-shell/project.yml
```

## 3. The bridge, end to end

The web UI never touches Braze directly. Every Braze call crosses the bridge
to the native shell, which executes the **real** SDK call. In-app messages
(IAM) never cross the bridge at all — the native SDK renders them itself
(`BrazeInAppMessageManager` registered in `onResume` on Android;
`BrazeInAppMessageUI` as `inAppMessagePresenter` on iOS).

### Transport

| Direction | Android | iOS |
|---|---|---|
| web → native | `window.brazeBridge.postMessage(JSON.stringify({action, payload}))` — a `@JavascriptInterface` object injected as `"brazeBridge"` (`MainActivity.configureWebView`, `BrazeDemoBridge.postMessage`) | `window.webkit.messageHandlers.brazeBridge.postMessage({action, payload})` — a `WKScriptMessageHandler` named `"brazeBridge"` (`WebViewController.userContentController`) |
| native → web | `webView.evaluateJavascript("window.__brazeBridge && window.__brazeBridge.receive(<action>, <json>)")` (`MainActivity.sendToWebRaw`) | `webView.evaluateJavaScript(...)` same `window.__brazeBridge.receive(action, payload)` call (`WebViewController.send`) |

`web-template/src/braze/bridge.ts` (`nativePost`) tries the iOS handler
first, then Android — the same web bundle runs in both shells. When neither
exists, `getBridge()` returns the **harness** bridge (plain browser, dev
only): it logs actions to the console and serves static fixtures. It is a
render aid only; nothing real happens in the harness.

### Handshake

1. Web boots, installs `window.__brazeBridge.receive`, posts `webReady`
   (with a sync envelope, section 4).
2. Native replies: `ready` → `connection` → `profiles` → `pushPermission` →
   cached `contentCards` (Android `handleWebReady`; iOS `case "webReady"`).
3. The web-side emitters replay the last value to late subscribers, because
   native can send `connection`/`profiles` before React effects attach
   (`bridge.ts` `emitter()` comment — this closes a real splash-hang race).

### Action vocabulary (summary)

Web → native: `webReady`, `changeUser`, `setCustomAttribute`,
`logCustomEvent`, `logPurchase`, `requestContentCardsRefresh`,
`logContentCardImpression`, `logContentCardClick`, `requestPushPermission`,
`saveCredentialProfile`, `selectCredentialProfile`, `listProfiles`
(+ Android-only alias `showContentCards`, iOS-only `requestPushReadiness`).

Native → web: `ready`, `connection`, `profiles`, `contentCards`,
`pushPermission`, `push` (foreground push → branded in-app banner),
`navigate` (deep link from a push/IAM tap).

Full per-action payload tables, platform differences, and the Control Room
demo-command action set are in
[references/bridge-actions.md](references/bridge-actions.md).

Every SDK-mutating call on both platforms is followed by
`requestImmediateDataFlush()` so dashboard effects are demo-fast rather than
waiting for the SDK's batch interval.

## 4. The `braze-demo-sync/v1` envelope and echo suppression

Identity (`changeUser`) can be initiated by three authorities: the web UI,
the native shell, and the Control Room. Native answers every identity change
with a `connection` message that carries the identity back to the web — so
without suppression the web would re-issue `changeUser`, looping forever and
repeatedly calling the real SDK `changeUser` (which resets sessions and
clears Content Card caches). The envelope makes each identity assertion
identifiable so both sides can drop echoes and duplicates.

Fields (`web-template/src/braze/sync.ts`, mirrored in `MainActivity.kt` and
`BrazeManager.swift`):

| Field | Value |
|---|---|
| `protocol` | Literal `braze-demo-sync/v1` |
| `sessionId` | UUID minted once per web page / native process lifetime |
| `runtimeId` | Applied pack id (e.g. `lumo-default`) |
| `configHash` | Applied pack config hash |
| `authority` | `web` \| `native` \| `control_room` |
| `reason` | `default` \| `manual` \| `profile_select` \| `command` \| `recovery` |
| `timestamp` | Epoch millis |

Dedup mechanism: both sides compute the signature
`externalId|protocol|sessionId|runtimeId|configHash|authority|reason`
(timestamp deliberately excluded). The web keeps `lastOutboundSig` and
`lastObservedNativeSig` and skips a publish matching either; native keeps
`lastIdentitySyncSignature` + `hasAppliedSdkIdentity` and logs
`changeUser deduped(<id>)` when it drops one. A genuinely new identity or a
new reason/authority produces a new signature and goes through.

Side effect worth knowing: when the external id actually changes, both
shells clear their card cache and push an empty `contentCards` array to the
web so stale cards never render for the wrong user.

The Control Room compares the `runtimeHash` and rendered-source evidence in
device telemetry against the applied pack to detect stale deployment drift —
the discipline rule "re-apply and confirm runtimeHash agreement before
presenting" rests on this envelope.
See `lumo-architecture-contract` for the invariant itself.

## 5. Content Cards routing

The **native SDK is the source of truth** — the web never fetches cards.

1. Native subscribes to SDK card updates (`subscribeToContentCardsUpdates`
   on Android, `contentCards.subscribeToUpdates` on iOS).
2. Filtering: Android keeps cards where
   `!isControl && !isRemoved && !isDismissed`; iOS keeps
   `card.control == nil && !card.removed`. Control-group and removed cards
   never reach the web.
3. Normalization to the web `NormalizedCard` shape:
   `{id, title, description, imageUrl, url, extras, placement}` — `extras`
   are the dashboard key/value pairs stringified, and
   `placement = extras["placement"] ?? "inbox"`.
4. Web routing: `BrazeBridgeProvider.cardsForPlacement(placement)` filters
   the normalized list; `ContentCardSlot` renders each surface defined in
   the pack's `content.contentCardSurfaces` (fields: `id`, `placement`,
   `surface`, `screen`, `title`, `variant`, `emptyBehavior`, `maxCards`).
   A card whose `extras.placement` matches no surface only ever appears on
   the `inbox` placement default.
5. Impression/click flow back over the bridge
   (`logContentCardImpression` / `logContentCardClick` with `cardId`) and
   native calls the real `card.logImpression()` / `card.logClick()` from
   its card-id cache.

Observable predicates:
- Card visible in the Braze dashboard but not the app → check the campaign's
  key/value pair `placement` matches a `contentCardSurfaces[].placement` in
  the applied pack, then check the "Content Cards updated: N" count in the
  Android debug drawer (long-press the WebView) or `content_cards` events in
  Control Room activity.
- Cards render in the plain browser but "not in the shell" → the browser is
  the harness showing layout-only fixtures
  (`web-template/src/harness/fixtures.ts`); it never shows real cards. Only
  the shells do.

## 6. Control Room REST usage and why it is demo-safe

The Control Room (host machine) is the only place REST calls happen. All go
through `callBraze()` in `tools/demo-launcher.mjs`:
`Authorization: Bearer <key>` against `${restEndpoint}${path}`, responses
logged into a ledger after `redactSecrets()` masking.

### Endpoints used (preset type → REST call)

| Preset type | Endpoint | Body targets |
|---|---|---|
| `rest_event` | `POST /users/track` | `events: [{external_id, name, time, properties}]` |
| `rest_attribute` | `POST /users/track` | `attributes: [{external_id, ...}]` |
| `rest_purchase` | `POST /users/track` | `purchases: [{external_id, product_id, currency, price, quantity, time, properties}]` |
| `campaign_trigger` | `POST /campaigns/trigger/send` | `campaign_id` + `recipients: [{external_user_id, trigger_properties, send_to_existing_only}]` |
| `canvas_trigger` | `POST /canvas/trigger/send` | `canvas_id` + same recipients shape |
| `profile_export` | `POST /users/export/ids` | `external_ids: [<active user>]` + `fields_to_export` |
| `braze_rest_request` | Any validated path | Custom, validated (below) |

(`sdk_event` / `sdk_attribute` / `sdk_purchase` preset types are **not**
REST — they are device commands executed through the bridge by the shell.)

### Why it is safe (`validateBrazeRestRequest` + `restRequestForPayload`)

| Guard | Rule |
|---|---|
| Single recipient | Preset bodies are always built around the single active `externalId`; campaign/canvas triggers **must** include explicit `recipients` or validation fails |
| Broadcast blocked | `body.broadcast === true` is rejected |
| Methods | GET/POST/PUT/PATCH only; **DELETE is blocked** outright |
| Destructive blocklist | `/users/delete`, `/users/merge`, `/users/external_ids/*`, `/campaigns/trigger/schedule/delete`, `/canvas/trigger/schedule/delete`, `/messages/schedule/delete`, `/email/blacklist`, `/email/bounce/remove`, `/email/spam/remove` |
| Path hygiene | Must be relative, start with `/`, no absolute URLs, no `..` traversal |
| Size cap | Request body ≤ 64 KB |
| Log redaction | Response/ledger keys matching `api_key/authorization/bearer/token/secret/password` become `[redacted]`; key previews render as `abcd••••wxyz` (`mask()`) |

### REST key resolution order

Session key first, then per-pack env var, then global env var, then a
disabled-by-default legacy file path. Full resolution order and env var
naming rule: `lumo-config-and-flags` §2 "Braze REST keys" (the owning index
for this fact — verified there against `restCredentialStatus`).

The endpoint itself comes from pack `secrets.properties` →
`braze.restEndpoint` (normalized to `https://` + no trailing slash). It is
configuration, not a secret. Running triggers during a demo is
`lumo-run-and-operate`'s job; this section only explains the mechanics.

## 7. Push model across teammate workspaces

One shared Firebase project (`braze-sc-demo-shell`) and one shared Android
app (`com.braze.demoshell`) serve every teammate. What is per-teammate:

| Shared (from Git) | Per teammate (never shared) |
|---|---|
| `google-services.json` client config | Braze workspace + its SDK API key/endpoint (entered locally) |
| Android app id / Firebase project | Firebase **service account JSON uploaded into their OWN Braze workspace** push settings |
| Web/app code | FCM registration token — generated fresh per app install |

The three classic failure modes (all real past incidents): service-account
JSON not uploaded into the *presenting* teammate's workspace; wrong SDK
key/endpoint pair; a token belonging to a different install. Tokens are
never copied between machines — each install mints its own and registers it
with whichever workspace its SDK key points at. For the step-by-step
fresh-machine push runbook use `lumo-push-readiness-campaign`; for
symptom-driven triage use `lumo-debugging-playbook`.

## 8. FCM token lifecycle in this app (Android)

All verified in `MainActivity.kt`.

Refresh triggers — `refreshPushReadiness(reason)` runs on:

| Reason | When |
|---|---|
| `launch` | `onCreate` |
| `resume` | `onResume` |
| `web_ready` | Web posts `webReady` |
| `change_user` | Every applied `changeUser` |
| `command` (or payload reason) | Control Room `requestPushReadiness` demo command |

Each run does two things:
1. **Trust diagnostics**: GETs `https://braze-images.com/` and
   `https://firebaseinstallations.googleapis.com/` (3 s timeout) and posts a
   `trust_diagnostics` telemetry event — this is the Zscaler/TLS canary.
2. **Token registration**: `FirebaseMessaging.getInstance().token`; on
   success `braze.registeredPushToken = token` followed by
   `requestImmediateDataFlush()`, then `fcm_token` success telemetry with an
   18-char token preview.

Retry ladder: if the fetch fails with a message containing
`SERVICE_NOT_AVAILABLE` (case-insensitive), it retries up to
`FCM_TOKEN_MAX_RETRIES = 4` times with delays
`FCM_TOKEN_RETRY_DELAYS_MS = 2s / 5s / 10s / 20s`, emitting
`fcm_token` warning telemetry (`retryScheduled: true`) per attempt. Other
errors fail immediately with `fcm_token` error telemetry.

All telemetry POSTs to the Control Room callback
(`BuildConfig.LAUNCHER_CALLBACK_URL`, normally
`http://10.0.2.2:<port>/api/device-events`). The debug drawer (long-press
the WebView) shows the token preview and has an "FCM Copy" button.

### iOS APNs equivalent

`AppDelegate.swift`: launch checks notification settings; if
authorized/provisional it calls `registerForRemoteNotifications()`. Success
lands in `didRegisterForRemoteNotificationsWithDeviceToken` →
`braze.notifications.register(deviceToken:)` + UserDefaults flags
(`braze.demo.ios.apnsTokenRegistered`, `apnsTokenLength`); failure records
`apnsRegistrationError`. `requestPushReadiness` reports `apns_token`
telemetry: `success` (token present), `warning` (permission granted, waiting
for the registration callback), `error` (permission not granted).

Hard constraint: **unsigned simulator builds never receive APNs tokens.**
The launcher builds iOS with `CODE_SIGNING_ALLOWED=NO`, which works for
everything *except* push (`ios-shell/project.yml` comment; diagnostics carry
`signedBuildRequired: true`). Real iOS push requires an org-signed build
plus APNs credentials in the Braze workspace.

Foreground pushes on both platforms are forwarded to the web as a `push`
bridge message and rendered as a **branded in-app banner** (iOS deliberately
suppresses the native banner via `brandedForegroundPush = true` — the honest
way to get a branded push icon without per-brand native builds).

## 9. Braze dashboard touchpoints this repo assumes

Everything below lives in **each teammate's own Braze workspace** and must
be created there — the repo only references it:

| Assumption | Where the repo references it |
|---|---|
| Custom events used as campaign/IAM triggers (e.g. `onboarding_completed`, pack `flavorEvents` names and their anchors) | Pack `brand.flavorEvents`, launcher `sdk_event` presets |
| Content Card campaigns carrying a key/value pair `placement=<surface placement>` | Pack `content.contentCardSurfaces[].placement` (unmatched cards default to `inbox`) |
| API-triggered campaigns/canvases whose ids appear in `campaign_trigger`/`canvas_trigger` presets (`payload.campaignId` / `payload.canvasId`) | Pack `launcher.presets` — ids are workspace-specific, so a pack shared to another teammate needs those ids re-created/updated for their workspace |
| Push enabled: Firebase service account uploaded (Android), APNs credentials (iOS) | Section 7 |

Android also sets
`com_braze_trigger_action_minimum_time_interval_seconds = 5`
(`build.gradle.kts` resValue): re-triggering the same IAM within 5 seconds
will not display — not a bug.

## When NOT to use this skill

- Step-by-step "get push working on this machine" → `lumo-push-readiness-campaign`.
- Actually running triggers/presets during a demo, Control Room operation → `lumo-run-and-operate`.
- What may be committed, secrets handling, sanitization, `public:check` → `lumo-secrets-and-sanitization`.
- Full config-axis index (every pack field, env var, launcher flag, `local.properties` key) → `lumo-config-and-flags`.
- Symptom→fix triage (push not arriving, Zscaler, stale runtime) → `lumo-debugging-playbook`.
- Design invariants and the WHY behind the architecture → `lumo-architecture-contract`.
- Building/altering demo stories, screens, packs-as-content → the `braze-demo-app-builder` skill / `braze-demo-builder` plugin (see `lumo-plugin-workflow`).

## Provenance and maintenance

Verified 2026-07-03 against the repo at commit `9ff55c7` by reading:
`web-template/src/braze/bridge.ts`, `web-template/src/braze/sync.ts`,
`web-template/src/braze/BrazeBridgeProvider.tsx`,
`web-template/src/brand/content.ts`,
`web-template/src/components/ContentCardSlot.tsx`,
`web-template/src/screens/Setup.tsx`,
`android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`,
`.../BrazeDemoBridge.kt`, `.../CredentialStore.kt`,
`android-shell/app/build.gradle.kts`, `android-shell/app/google-services.json`,
`ios-shell/Sources/{AppDelegate,WebViewController,BrazeManager}.swift`,
`ios-shell/project.yml`, `tools/demo-launcher.mjs`,
`demo-packs/Lumo/demo-pack.json`, `demo-packs/README.md`,
`docs/solcon-onboarding.md`, `docs/demo-runtime-architecture.md`.

Re-verification one-liners for facts that can drift:

```sh
# SDK version pins + why-comments
grep -n -B2 "android-sdk-ui\|firebase-messaging" android-shell/app/build.gradle.kts
grep -n -B1 -A4 "braze-swift-sdk" ios-shell/project.yml
# Bridge action vocabulary
grep -n '"[a-zA-Z]*" ->' android-shell/app/src/main/java/com/braze/demoshell/BrazeDemoBridge.kt
grep -n 'case "' ios-shell/Sources/WebViewController.swift
grep -n "post('" web-template/src/braze/bridge.ts
# Sync envelope + dedup
grep -n "SYNC_PROTOCOL\|lastOutboundSig\|lastObservedNativeSig" web-template/src/braze/sync.ts
grep -n "lastIdentitySyncSignature\|deduped" android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt
# REST safety + key resolution
grep -n -A12 "function validateBrazeRestRequest\|function restCredentialStatus" tools/demo-launcher.mjs
# FCM retry ladder + trust URLs
grep -n "FCM_TOKEN_RETRY_DELAYS_MS\|FCM_TOKEN_MAX_RETRIES\|braze-images.com" android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt
# Content Card filtering/normalization
grep -n "isControl\|placement" android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt | head
grep -n "control == nil\|placement" ios-shell/Sources/BrazeManager.swift
```

### Open questions / candidates

- iOS shell is dev-mode only (web always from the Vite dev server; bundled
  assets are a stated M2 milestone) — treat iOS-specific bridge behavior as
  more likely to change than Android's.
- `requestPushReadiness` exists as an iOS *bridge* action but on Android only
  as a Control Room demo command; whether the web ever calls it directly is
  UI-dependent — verify in `web-template/src` before relying on it.
