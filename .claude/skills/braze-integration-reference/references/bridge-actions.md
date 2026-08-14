# Bridge Action Vocabulary — Full Reference

Verified 2026-07-03 against `web-template/src/braze/bridge.ts`,
`android-shell/app/src/main/java/com/braze/demoshell/BrazeDemoBridge.kt`,
`.../MainActivity.kt`, `ios-shell/Sources/WebViewController.swift`,
`ios-shell/Sources/BrazeManager.swift`, and `tools/demo-launcher.mjs`.

Envelope shape in both directions: `{ action: string, payload: any }`.
- Web → native: Android receives it as a JSON **string**
  (`window.brazeBridge.postMessage(JSON.stringify(...))`); iOS receives it as
  a structured object (`webkit.messageHandlers.brazeBridge.postMessage({...})`).
- Native → web: both platforms call
  `window.__brazeBridge.receive(action, payload)` via `evaluateJavaScript`.

## 1. Web → native actions

| Action | Payload | Native behavior (Android / iOS) |
|---|---|---|
| `webReady` | `{ sync: SyncEnvelope }` | Handshake: native replies `ready`, `connection`, `profiles`, `pushPermission` (Android; iOS reports push status async), cached `contentCards` (Android), then posts `runtime_ready` telemetry. Android also refreshes push readiness (`web_ready`). |
| `changeUser` | `{ externalId, sync }` | Dedup by sync signature; on a real change: clear card cache, empty `contentCards` to web, SDK `changeUser`, immediate flush, `connection` reply, `change_user` telemetry. Android also refreshes push readiness. |
| `setCustomAttribute` | `{ key, value }` | Typed set on the current SDK user (bool/int/long/float/double/string/array; `null` unsets on Android) + immediate flush + `sdk_attribute` telemetry. iOS supports bool/number/string/[String]. |
| `logCustomEvent` | `{ name, properties? }` | SDK `logCustomEvent` (+`BrazeProperties` when properties given) + immediate flush + `sdk_event` telemetry. |
| `logPurchase` | `{ productId, price, currency?, quantity?, properties? }` | SDK `logPurchase` (defaults `USD`, qty 1) + immediate flush + `sdk_purchase` telemetry. Skipped without `productId`. |
| `requestContentCardsRefresh` | — | SDK card refresh; Android also flushes and re-sends cached cards immediately; `content_cards_refresh` telemetry. |
| `showContentCards` | — | **Android only** — alias for `requestContentCardsRefresh`. |
| `logContentCardImpression` | `{ cardId }` | Real `card.logImpression()` from the native card cache; `content_card_impression` telemetry. |
| `logContentCardClick` | `{ cardId }` | Real `card.logClick()`; `content_card_click` telemetry. |
| `requestPushPermission` | — | Android: `POST_NOTIFICATIONS` runtime prompt (API 33+; auto-`granted` reply below 33). iOS: `UNUserNotificationCenter.requestAuthorization` then `registerForRemoteNotifications()`. Both reply `pushPermission` + telemetry. |
| `requestPushReadiness` | `{ reason? }` | **iOS bridge only** (on Android this exists only as a Control Room demo command). Reports `apns_token` telemetry (success/warning/error), re-registers for remote notifications when permission is granted. |
| `saveCredentialProfile` | `CredentialProfile` (`{ id?, name, apiKey, endpoint, externalId, webURL?, ... }`) | Persist + activate the workspace profile. Android **restarts the process** when apiKey/endpoint changed (SDK re-init requires it); otherwise re-runs `changeUser` + reloads the WebView. iOS re-initializes the Braze instance in-process and reloads the web. |
| `selectCredentialProfile` | `{ id }` | Activate a saved profile; same restart/re-init semantics as above. |
| `listProfiles` | — | Replies `profiles` with all saved profiles (`active` flag on the current one). |

Unknown actions: Android logs "Unknown bridge action"; iOS prints
"[bridge] unknown action". Nothing crashes.

## 2. Native → web actions

All delivered through `window.__brazeBridge.receive(action, payload)` and
fanned out by the web bridge's replaying emitters (`bridge.ts`).

| Action | Payload | Meaning |
|---|---|---|
| `ready` | `{}` | Handshake complete; resolves the web `bridge.ready()` promise. |
| `connection` | `{ connected, label, externalId, sync, setupNeeded, runtime, sourceUrl, sourceOverride, loadError? }` | Workspace/connection status. `runtime` carries `{ id, name, configHash, generatedAt, sourceMode, deviceId, externalId, pushPermission, pushTokenPresent, ... }`. `setupNeeded: true` = no SDK key/endpoint configured → web shows Setup. |
| `profiles` | `CredentialProfile[]` | Saved workspace profiles for the Setup screen. |
| `contentCards` | `NormalizedCard[]` | Filtered + normalized cards (see SKILL.md section 5). An empty array is meaningful — it clears the UI (sent on user change). |
| `pushPermission` | `"unsupported" \| "default" \| "granted" \| "denied"` | Current notification permission state. |
| `push` | `{ title, body, uri? }` | A REAL push arrived while the app was foreground → web renders the branded in-app banner. |
| `navigate` | `"/route"` | Native → web deep link (push tap deeplink, IAM click, or Control Room `navigate` command). Android only forwards routes starting with `/`. |

## 3. Control Room demo commands (host → shell, not the web bridge)

Delivered by `tools/demo-launcher.mjs`: Android via
`adb shell am start ... -a com.braze.demoshell.DEMO_COMMAND --es command <base64 JSON>`;
iOS via URL scheme `braze-demo://command?payload=<base64url JSON>`.
Command shape: `{ action, externalId?, payload?, callbackUrl? }` — the
launcher injects its `/api/device-events` callback automatically. Any
command carrying an `externalId` first applies `changeUser` with a
`control_room`/`command` sync envelope.

| Action | Notes |
|---|---|
| `changeUser` | Sets SDK identity. |
| `logCustomEvent` | Requires `payload.name`. |
| `setCustomAttribute` | `payload.attributes` map or `payload.key`+`payload.value`. |
| `logPurchase` | Requires `payload.productId`. |
| `requestContentCardsRefresh` | SDK card refresh. |
| `requestPushPermission` | Prompt/report permission. |
| `requestPushReadiness` | Re-run token/permission diagnostics (`fcm_token` / `apns_token` telemetry). |
| `requestTrustDiagnostics` | **Android only** — HTTPS trust canary against `braze-images.com` + `firebaseinstallations.googleapis.com`. |
| `navigate` | `payload.route` or `payload.uri` → web `navigate`. |
| `foregroundPush` | Simulated branded banner (`title`/`body`/`uri`) — display only, no SDK involvement. |

Commands needing a configured SDK (`changeUser`, `logCustomEvent`,
`setCustomAttribute`, `logPurchase`, `requestContentCardsRefresh`,
`requestPushReadiness`) fail with "Braze is not configured for the active
… profile" when no workspace profile with apiKey+endpoint is active.

## 4. Device telemetry event types (shell → Control Room callback)

POSTed as `{ platform, type, label, status, externalId, payload, result? }`
to `launcher.callbackUrl` (Android `http://10.0.2.2:<port>/api/device-events`,
iOS `http://localhost:<port>/api/device-events`).

| `type` | Emitted when |
|---|---|
| `runtime_ready` | Web handshake completed (carries runtime manifest + diagnostics + sync) |
| `bridge_action` | Every web → native bridge message (info) |
| `change_user` | SDK identity applied |
| `sdk_event` / `sdk_attribute` / `sdk_purchase` | SDK data calls |
| `content_cards` / `content_cards_refresh` | Card updates (with count) / refresh requests |
| `content_card_impression` / `content_card_click` | Card engagement logged |
| `push_permission` | Permission prompt results and launch-time state |
| `fcm_token` | Android token registered / retry scheduled / failed |
| `apns_token` | iOS token registered / waiting / failed |
| `trust_diagnostics` | Android HTTPS trust canary results |
| `foreground_push` | Foreground push forwarded to the web banner |
| `iam_manager` | Android IAM manager registration failure |
| `demo_command` | Control Room command executed/failed |

Re-verify this table:
```sh
grep -n 'type = "' android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt
grep -n 'type: "' ios-shell/Sources/WebViewController.swift ios-shell/Sources/AppDelegate.swift
```
