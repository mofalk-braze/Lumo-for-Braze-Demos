# Braze Demo iOS Shell (M1)

The native iOS shell — the **Braze Swift SDK spine**. It hosts the web template
(`../web-template`) in a full-screen `WKWebView` and bridges between the web UI
and the SDK. In-app messages render via the SDK's **native** UI; push is **real
APNs**; Content Cards are **real CC data**. One bundle ID for all apps; per app
you swap the icon + display name and rebuild.

## Prerequisites

- Xcode 14+ on an **Apple-Silicon Mac** (real push to the Simulator needs this).
- `xcodegen` (`brew install xcodegen`).
- The web template running: `cd ../web-template && npm run dev` (serves `http://localhost:5173`).
- The active demo pack applied from the repo root, for example
  `node tools/demo-launcher.mjs --pack wolt-food-delivery --apply-only`.

## Generate & run

```bash
cd ios-shell
xcodegen generate              # creates BrazeDemoShell.xcodeproj from project.yml
open BrazeDemoShell.xcodeproj  # then ⌘R on an iPhone simulator
```

Or from the CLI (what was used to verify M1):

```bash
xcodebuild -project BrazeDemoShell.xcodeproj -scheme BrazeDemoShell \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ./DerivedData CODE_SIGNING_ALLOWED=NO build
xcrun simctl install booted ./DerivedData/Build/Products/Debug-iphonesimulator/BrazeDemoShell.app
xcrun simctl launch --console booted com.braze.masquerade   # --console shows bridge logs
```

## Add Braze credentials (to go live)

Credentials are **not** committed: `Sources/Config.swift` is git-ignored. On a
fresh clone, seed it from the template (or leave it empty and use Control Room
or an explicit local profile):

```bash
cp Config.example.swift Sources/Config.swift   # then fill in, or leave empty
```

The preferred path is the **Braze Demo Control Room**. Native/web setup screens
are fallback diagnostics only. With creds set, bridge calls hit the real
**app-channel** install; IAMs render natively; Content Cards flow into the demo
surfaces.

## Enable real push (per workspace, one-time)

Bundle ID is **`com.braze.masquerade`** — it reuses the org's already-registered
Masquerade App ID so the team's APNs `.p8` is valid for this app's push topic.

> **Push REQUIRES a properly signed build — the CLI ad-hoc build cannot do push.**
> Getting an APNs device token needs the `aps-environment` entitlement, which the
> Simulator only honors on a build signed by the **org Apple team** that owns
> `com.braze.masquerade`. (Ad-hoc/CLI signing with that entitlement is rejected at
> launch; a no-entitlement CLI build runs but never gets a token → user shows
> "Opted In" with no push token.)

**To get push (Simulator or device):**
1. Open `BrazeDemoShell.xcodeproj` in **Xcode**, sign into the **org Apple ID**
   (Settings → Accounts), select that **team** on the target (Signing & Capabilities,
   automatic). Run with ⌘R — Xcode creates a dev profile granting `aps-environment`.
2. In Braze → *Settings → iOS push*: upload the `.p8` + **Key ID** + **Team ID** +
   **App ID `com.braze.masquerade`**.
3. The app requests notification authorization on first launch, then
   auto-registers for remote notifications when authorized. The SDK uploads the
   token → the user shows a push token in Braze → campaigns deliver: lock screen,
   banner, Notification Center, **and in-foreground**. When a launcher callback
   URL is configured, the Control Room records permission and APNs registration
   telemetry.

The app icon shown in the push is this build's icon → brand it per app
(`Sources/Assets.xcassets/AppIcon.appiconset` + `CFBundleDisplayName`).

> CLI builds with `CODE_SIGNING_ALLOWED=NO` run fine for UI/bridge/IAM/Content
> Cards verification — just not push.

## How the bridge works

- **JS → native:** the web posts `{action, payload}` to
  `window.webkit.messageHandlers.brazeBridge`; `WebViewController` dispatches to
  `BrazeManager`. Contract matches `web-template/src/braze/bridge.ts`.
- **native → JS:** `BrazeManager`/`WebViewController` call
  `window.__brazeBridge.receive(action, payload)` via `evaluateJavaScript`
  (`ready`, `connection`, `contentCards`, `pushPermission`, `navigate`).
- Handshake: web posts `webReady` once mounted → native replies `ready` +
  `connection` including runtime id/hash/source diagnostics, then the web sends
  attributes and CC refresh through the bridge.

## Notes / gotchas (baked in)

- `Info.plist` allows http to localhost (`NSAllowsLocalNetworking`) for the dev server.
- iOS uses Vite at `http://localhost:5173` in development until bundled iOS
  web assets are added.
- WKWebView main-frame load failures are logged and sent through connection
  diagnostics.
- WKWebView loads with `.reloadIgnoringLocalCacheData` so a fresh web build is always used.
- Simulator installs preserve app data by default, so the Braze SDK device ID
  should remain stable across repeated launch flows unless the app data or
  simulator is explicitly erased. The Control Room Diagnostics view shows the
  last reported iOS SDK device ID.
- `setvbuf(stdout, …, _IONBF, …)` in `AppDelegate` makes `print()` appear live under `--console`.
- `SWIFT_VERSION = 5.0` (Swift 5 language mode) avoids Swift 6 strict-concurrency churn.
- The generated `.xcodeproj` is git-ignored — regenerate with `xcodegen generate`.

## Verified (M1)

Built against **Braze Swift SDK 11.9.0**, launched in the iOS 26.5 Simulator
(iPhone 17). The web template loads full-bleed (shell detected), and the bridge
carries `webReady → ready`, `changeUser`, all standard attributes, the
`screen_viewed` anchor event, and `requestContentCardsRefresh` from web → Swift.
Remaining (needs your creds + APNs key): real Braze data round-trip and a real
push appearing in the Simulator.
