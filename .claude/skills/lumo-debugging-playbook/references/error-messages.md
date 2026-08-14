# Verbatim error-message catalog (with sources)

Exact strings you can grep for, mapped to their emitting source. Verified
2026-07-03. If a message stops matching, re-read the cited file — the code wins.

## Pack apply / validation

From `tools/demo-pack-utils.mjs`:

| Message | Meaning |
|---|---|
| `Demo pack not found: <id>` | No matching dir name or `demo-pack.json` id under `demo-packs/` or `.demo-packs/` |
| `<file> is missing required field: <key>` | `id`, `name`, `brand`, or `content` absent |
| `<file> id must be kebab-case: <id>` | id fails `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| `<file> has an incomplete brand section` | `brand.colors` missing, `brand.tabs` not an array, or `brand.demoUser` missing |
| `<file> has an incomplete content section` | `content.hero` missing, or `content.categories`/`content.rails` not arrays |
| `<file> content.contentCardSurfaces must be an array` | wrong type |
| `<file> content.contentCardSurfaces[N] is missing required string field: <key>` | one of `id`, `placement`, `surface`, `screen`, `title`, `variant`, `emptyBehavior` |
| `… has unsupported surface: <v>` | allowed: `inbox`, `feed`, `carousel`, `hero`, `account`, `status` |
| `… has unsupported variant: <v>` | allowed: `hero`, `carousel`, `feed`, `inbox` |
| `… has unsupported emptyBehavior: <v>` | allowed: `hide`, `empty-state` |
| `… maxCards must be a positive integer` | wrong type/value |
| `<file> launcher.presets must be an array` / `web.distDir must be a string` / `web.build must be an object or false` / `web.build.command must be a string` | wrong types |

From `tools/validate-demo-runtime.mjs` (`npm run validate:demo-runtime`):

| Message | Meaning |
|---|---|
| `Duplicate demo pack id: <id>` | Same id in more than one pack root |
| `Missing android-shell/.active-demo-pack marker.` | Never applied |
| `Missing generated web config. Apply a demo pack first.` | `activeDemoConfig.generated.ts` absent |
| `Missing public/demo-runtime.json. Apply a demo pack first.` | Runtime manifest absent |
| `Missing android-shell/app/google-services.json. Commit the shared Lumo Firebase client config.` | Committed public client config deleted |
| `Generated config configHash: expected <x>, got <y>` (assertEqual form) | Generated web config drifted from the active pack |
| `Android packaged runtime configHash: expected <x>, got <y>` | Built Android asset drifted |
| `iOS Config.swift demoConfigHash does not match the active pack.` | iOS runtime defaults drifted |

## Android build (`android-shell/app/build.gradle.kts`)

| Message | Meaning |
|---|---|
| `Missing <dist>/index.html. Apply a demo pack or build the configured web app before building Android.` | Web dist never built for the configured `demo.webDist` |
| `Generated demo runtime does not match selected pack <id>.` | Packaged `demo-runtime.json` id ≠ `local.properties` `demo.packId` |
| `Generated demo runtime does not match selected hash <hash>.` | Packaged hash ≠ `demo.configHash` |
| `android-shell/app/google-services.json is missing. The app can compile, but FCM token generation requires adding your Firebase config file before running a real push test.` | Gradle warning (build proceeds, FCM will not work) |

## Android runtime logs (logcat tags `BrazeDemoApplication`, `BrazeDemoShell`)

| Line | Meaning |
|---|---|
| `Braze runtime configuration applied: <bool>` | SDK configured from the active credential profile |
| `Braze API key/endpoint missing. Add a workspace in the Lumo setup screen.` | Silent-no-SDK mode: app runs, all Braze calls no-op |
| `changeUser skipped: Braze is not configured.` (also `Event skipped:` / `Purchase skipped:` / `Content Cards skipped:`) | Action hit the unconfigured SDK |
| `FCM token failed: <error> (retry N)` | Token fetch failed; retry scheduled only for `SERVICE_NOT_AVAILABLE`, max 4, backoff 2s/5s/10s/20s |
| `FCM token registered with Braze: <18 chars>...` | Success |
| `HTTPS trust diagnostics passed.` / `HTTPS trust diagnostics failed.` | On-device smoke check of `https://braze-images.com/` and `https://firebaseinstallations.googleapis.com/` (3s timeout each) |
| `IAM manager registered.` / `IAM manager registration failed: <e>` | In-app message display readiness |
| `Content Cards updated: <N>` | Cards after filtering control/removed/dismissed |
| `WebView load failed: <description>` | Main-frame load error; also sent to web as `loadError` |

## Emulator scripts (`android-shell/tools/`)

| Message | Source | Meaning |
|---|---|---|
| `Android AVD '<name>' does not exist.` | run-demo-emulator.sh | Provision first |
| `Refusing Google Play image. Use a rootable google_apis image.` | provision-demo-avd.sh | Play images blocked by design |
| `AVD already exists but does not match the dedicated demo profile.` | provision-demo-avd.sh | Prints current vs expected device/image; requires explicit `RECREATE_AVD=1` (destroys app data + SDK device identity) |
| `Emulator booted, but user 0 did not unlock. Unlock the AVD once or use an AVD without a lock screen.` | run-demo-emulator.sh | Unlock loop (~2 min) exhausted |
| `Android emulator system trust could not be prepared.` (+ remediation block) | run-demo-emulator.sh | Zscaler CA install failed; launch aborts |
| `Ready. Emulator log: /tmp/lumo-demo-emulator.log` | run-demo-emulator.sh | Success line |

## iOS runtime (console via `xcrun simctl launch --console booted com.braze.masquerade`)

| Line | Meaning |
|---|---|
| `[webview] load failed: <localizedDescription>` | WKWebView main-frame failure (`WebViewController.reportLoadFailure`); same text arrives in web `connection.loadError` |
| `[bridge ←] <action> <payload>` | JS → native bridge traffic (proves web loaded) |
| `[bridge] unknown action: <action>` | Web sent an action the shell does not implement |

## Control Room / launcher (`tools/demo-launcher.mjs`)

| Message | Meaning |
|---|---|
| `Port 4177 is in use; using <n>.` | Auto-increment (default start 4177, up to +20 attempts) |
| `Port <n> is already in use. Stop the existing process or choose --port <port>.` | Explicit `PORT`/`--port` conflicts are fatal instead |
| `No available launcher port found from <a> to <b>.` | All candidates busy |
| `Android HTTPS trust diagnostics timed out` / `Native Android trust diagnostics did not report before launch readiness timeout.` | Synthetic trust entry after `BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS` (default 15000 ms); launch job marked Failed, but the app is already installed and running |
| `Missing <dist>/index.html. Build the source app or set web.build in the demo pack.` | Pack with `web.build: false`/custom dist has no prebuilt output |
| `Launch the selected app and wait for native runtime telemetry.` | Control Room blocker: no device telemetry yet (check the callback-URL/port pitfall) |
| `<platform> reported pack <a>, expected <b>.` / `<platform> reported hash <x>, expected <y>.` | Runtime drift blocker — re-apply + rebuild + reinstall |
