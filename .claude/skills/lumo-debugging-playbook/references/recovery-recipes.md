# Regression Recovery Recipes

Detailed companion to `../SKILL.md`. Read the section matching the symptom
family only after the main regression loop identifies that layer.

## Contents

- [Android Push Regression](#android-push-regression)
- [Android Emulator And Trust](#android-emulator-and-trust)
- [Blank Or Failed WebViews](#blank-or-failed-webviews)
- [Apply Build And Runtime Drift](#apply-build-and-runtime-drift)
- [Content Cards Banners And IAM](#content-cards-banners-and-iam)
- [Control Room And Telemetry](#control-room-and-telemetry)

## Android Push Regression

Use this section only when push was previously proven on this install and
workspace. Preserve app data and the AVD.

1. In Control Room, confirm the active platform and external ID.
2. Run **Verify Android HTTPS trust** and **Verify push readiness**.
3. Long-press the Android WebView and compare the drawer's profile, endpoint,
   external ID, permission, and token preview with Control Room evidence.
4. If trust is healthy but the token is absent, allow the built-in FCM retry
   schedule to finish. `SERVICE_NOT_AVAILABLE` can be transient but often
   masks corporate TLS interception.
5. If a token exists, verify that the same active external ID has a
   push-enabled Android device in the same Braze workspace used to send.

| Evidence | Confirmed layer | Repair and verification |
|---|---|---|
| Trust check names an HTTPS failure | Emulator trust | Run one canonical Android start. If it explicitly reports broken persistent trust, read the Zscaler mechanics reference and use explicit repair once. Re-run both HTTPS probes. |
| SDK profile/endpoint absent | Selected-pack credentials | Save SDK key/endpoint on the selected pack, re-apply, rebuild/reinstall through canonical start, then confirm SDK configuration telemetry. |
| `google-services.json` missing/invalid | Firebase client config | Restore the committed public client JSON; never use service-account JSON here. Rebuild and rerun doctor. |
| Token ready for another user | Stale identity binding | Apply the intended user, wait for native echo, then rerun push readiness. |
| Token ready but delivery silent | Workspace/service-account/target mismatch | Reconfirm the sending workspace's Firebase service account and the active user's current install before changing the app. |
| Permission denied | Android notification permission | Re-request with the Control Room control or drawer; if Android suppresses the prompt, enable notifications in Settings. |

Never wipe data to refresh a token. That creates a new install and destroys
the known-good comparison.

## Android Emulator And Trust

Read `/tmp/lumo-demo-emulator.log` before changing the AVD.

- Missing `Braze_Demo_API_36`: if it never existed, route to setup. If it was
  deleted after prior use, reprovisioning is required and identity loss must
  be acknowledged.
- Wrong AVD profile: provisioning may offer `RECREATE_AVD=1`; this is
  destructive and requires explicit authorization.
- Secure/locked keyguard: unlock manually and migrate to non-secure Swipe.
  Never guess or enter a PIN.
- Google Play image: unsupported because corporate trust repair needs a
  rootable `google_apis` image.
- Persistent trust missing/broken: normal `TRUST_MODE=auto` intentionally
  refuses the mutation. Read the Zscaler mechanics reference and perform one
  explicit repair only when the probe demands it.
- Trust broke after a manual cold start: canonical start can restore the
  volatile Conscrypt mount when persistent system trust remains healthy.

Verify with:

```sh
node tools/lumo.mjs android start --pack <id>
node tools/lumo.mjs android status
```

The job must reach `Ready` with correlated runtime/render/trust evidence.

## Blank Or Failed WebViews

Android:

- Long-press the WebView. Confirm bundled source, pack id, deployment hash,
  credential profile, and recent load errors.
- If an Android development URL override is active, clear it through Expert
  Diagnostics and relaunch. A stopped host does not prove the native override
  cleared; require new bundled-source evidence.
- Re-apply and use canonical start rather than editing generated assets.

iOS:

```sh
curl -sI http://localhost:5173 | head -1
xcrun simctl launch --console booted com.braze.masquerade
```

The current iOS shell requires the Vite server at port 5173. Connection
refused means start `cd web-template && npm run dev`. A missing ignored Xcode
project requires `cd ios-shell && xcodegen generate`. Unsigned simulator push
absence is expected, not a WebView regression.

## Apply Build And Runtime Drift

Run the exact failing stage once and stop at the first error:

```sh
node tools/demo-launcher.mjs --pack <id> --apply-only
cd web-template && npm run build
cd ../android-shell && ./gradlew :app:validateDemoWebAssets :app:assembleDebug
```

- Pack validation or apply error: use the exact-message catalog and repair
  the source pack.
- Error in `activeDemoConfig.generated.ts`: repair the pack/source and
  re-apply; never patch the generated file.
- Missing web `dist/index.html`: apply/build the selected pack.
- Pack/config/runtime disagreement in Android assets: perform canonical
  start, which applies, builds, installs/reuses, and proves one deployment.
- iOS project missing: run xcodegen. Do not casually change the Braze Swift
  SDK pin in `ios-shell/project.yml`.

Verify:

```sh
npm run validate:demo-runtime
node tools/lumo.mjs android start --pack <id>
```

The validator proves generated/built agreement; the native handshake proves
the installed device source.

## Content Cards Banners And IAM

Separate three questions: was the message delivered, was it routed to the
expected placement/trigger, and did the surface render it?

Content Cards:

- Read the filtered native update count in Control Room **05 Help &
  Troubleshooting → Content Cards**, Expert **Debug Events** entry type
  `content_cards` (`payload.count`), or the Android drawer log line
  `Content Cards updated: N`. The emitting source is `handleContentCards` in
  `android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`.
- Compare the dashboard `placement` extra with the pack surface placement
  character-for-character. Android defaults a missing placement to `inbox`;
  web placement filters are exact.
- The native count is after Android removes control, removed, and dismissed
  cards. A zero count can therefore mean wrong audience/user, every returned
  card was filtered, or a previously dismissed card is no longer active.
  Target the active user and send a fresh eligible card; do not reset app data.
- A non-zero count with an empty surface points to placement or render routing,
  not delivery. Compare each card's normalized placement with the declared
  surface.
- A browser harness shows fixtures, not proof of real Braze delivery. Judge
  real cards in a native shell.
- Refresh once through Story Controls or the Android drawer.
- A surface using `emptyBehavior: "hide"` disappears when empty by design.

Banners:

- Use the guided Banner card to distinguish absence of delivery evidence from
  a route/placement mismatch.
- Confirm the pack declares the intended Banner surface and the dashboard
  message targets the same active user and placement contract.
- Prove the result in the native shell and Activity Feed, not only in the
  dashboard preview.

IAM:

- Confirm native IAM registration succeeded.
- Trigger the exact configured SDK event and inspect its payload evidence.
- Wait beyond the configured trigger-action minimum before repeating an
  event; it is currently one second in `android-shell/app/build.gradle.kts`.
- Blank IAM media with successful trigger evidence is usually trust; rerun
  the Android HTTPS trust check.

## Control Room And Telemetry

- Always open the URL actually printed; the default port can auto-increment.
- If device telemetry is absent while the app is running, compare the current
  launcher port with the callback context baked during launch. Canonical
  relaunch rebinds it.
- A trust-telemetry timeout occurs after install/launch and marks the job
  failed. Check whether native telemetry could reach the launcher; do not
  declare the app ready by sight.
- Exact or correlated repeated telemetry should deduplicate. Compare
  correlation IDs before filing a duplicate-event defect.
- Use Current session or Clear for a rehearsal. Clear archives first and
  creates a new session boundary.
- Export the redacted bundle for escalation; never share raw state.
