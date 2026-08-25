# Android Push Bring-Up Runbook

Detailed companion to `../SKILL.md`. Read and execute top to bottom only for
first-time Android push proof. If push worked before on the same install and
workspace, stop and use `lumo-debugging-playbook`.

## Contents

- [Phase 0: Android Preconditions](#phase-0-android-preconditions)
- [Phase 1: Workspace Firebase Setup](#phase-1-workspace-firebase-setup)
- [Phase 2: Selected-Pack SDK Credentials](#phase-2-selected-pack-sdk-credentials)
- [Phase 3: Canonical Android Launch](#phase-3-canonical-android-launch)
- [Phase 4: Notification Permission](#phase-4-notification-permission)
- [Phase 5: Token And Identity](#phase-5-token-and-identity)
- [Phase 6: End-To-End Delivery](#phase-6-end-to-end-delivery)
- [Phase 7: Preserve The Proof](#phase-7-preserve-the-proof)

## Phase 0: Android Preconditions

Run from the repository root:

```sh
node tools/lumo.mjs android doctor
```

Gate: exit 0 with Android-relevant Java, adb, emulator, dedicated AVD, and
Firebase client config checks passing. Android-targeted doctor intentionally
does not let Xcode block this path.

Check the dedicated AVD explicitly when needed:

```sh
~/Library/Android/sdk/emulator/emulator -list-avds | grep -x Braze_Demo_API_36
```

If tools or the AVD never existed, run:

```sh
node tools/lumo.mjs android setup
```

The supported AVD is the rootable `pixel_10_pro` /
`system-images;android-36.1;google_apis;arm64-v8a` profile. If provisioning
reports profile drift, do not recreate automatically: `RECREATE_AVD=1`
destroys all app data and identity.

On the corporate network, confirm the host Zscaler root exists in the macOS
System keychain:

```sh
security find-certificate -a -c "Zscaler Root CA" \
  /Library/Keychains/System.keychain >/dev/null && \
  echo ZSCALER_CA_PRESENT || echo ZSCALER_CA_ABSENT
```

Absent off-network is acceptable. Absent on the corporate path requires IT's
supported host setup before emulator trust can be prepared.

## Phase 1: Workspace Firebase Setup

The teammate's own Braze workspace must hold the Firebase service-account
credential for the shared Firebase project used by package
`com.braze.demoshell`.

1. Obtain the service-account JSON through the approved off-repo handoff.
2. Upload it in that workspace's Android Push Settings.
3. Confirm the dashboard shows Firebase credentials configured.
4. Collect the Android SDK API key and SDK endpoint from the same workspace.
5. Collect REST access only if the proof will be triggered from Control Room.

The repository cannot verify this dashboard gate. Require a current visual or
screen-share confirmation; “a colleague configured it” is not evidence for
this workspace. If the teammate lacks permission or the credential is
unavailable, stop and escalate rather than inventing a workaround.

Never place service-account JSON in `android-shell/app/google-services.json`.
That committed file is public Firebase client configuration, not a server
credential.

## Phase 2: Selected-Pack SDK Credentials

Recommended path:

```sh
npm run lumo:cockpit
```

Open the printed URL. Select the actual pack, open **01 Demo Cockpit**, expand
SDK configuration, enter the SDK API key and SDK endpoint/cluster, then save.
The launcher writes selected-pack local credential state and re-applies the
pack. A REST key, when needed, remains session-only.

Confirm presence without printing values:

```sh
grep -q '^braze.apiKey=.' android-shell/local.properties && \
  echo SDK_KEY_SEEDED || echo SDK_KEY_MISSING
grep -q '^braze.endpoint=.' android-shell/local.properties && \
  echo ENDPOINT_SEEDED || echo ENDPOINT_MISSING
```

Both must be seeded and Control Room must show SDK ready. If not, verify that
the selected pack is the pack whose local secrets were saved. Never edit
`local.properties` directly; it is generated and will be replaced.

SDK endpoints omit the URL scheme. REST endpoints include `https://`.

## Phase 3: Canonical Android Launch

```sh
node tools/lumo.mjs android start --pack <id>
node tools/lumo.mjs android status
```

The start path applies the pack, prepares web assets, builds, reuses or starts
the expected AVD, verifies the Swipe keyguard, probes supported trust state,
installs only if the APK differs while preserving data, maintains clock
coverage, applies identity, and waits for native runtime/render/trust proof.

Gate: job reaches `Ready`, status reports one healthy authority, and Control
Room Device/Trust/User evidence matches the selected pack and active user.

Branches:

- Missing AVD/tools: return to Phase 0.
- Gradle or runtime build failure: use `lumo-debugging-playbook`; this is not
  a push-specific branch.
- Trust telemetry times out: inspect `/tmp/lumo-demo-emulator.log` and the
  guided Trust/clock card, then relaunch once.
- Persistent trust missing/broken: return to the parent skill and read its
  explicitly linked Zscaler mechanics reference. Use explicit repair only
  when the probe requires it.
- Off-network message says no host Zscaler CA was found: expected; continue.

## Phase 4: Notification Permission

The app prompts once per install on recent Android versions. Re-request with
the Control Room **Request push permission** control or Android debug drawer's
**Push** action.

Verify:

```sh
~/Library/Android/sdk/platform-tools/adb shell dumpsys package \
  com.braze.demoshell | grep POST_NOTIFICATIONS
```

Gate: `android.permission.POST_NOTIFICATIONS: granted=true`, native drawer
shows permission granted, and Control Room receives the permission evidence.
If Android no longer presents the system prompt, enable notifications in the
emulator's app settings.

## Phase 5: Token And Identity

1. Apply the intended external ID in Control Room and wait for the native
   identity echo.
2. Run **Verify Android HTTPS trust**.
3. Run **Verify push readiness**.
4. Long-press the Android WebView and confirm the drawer shows the same
   external ID, expected credential profile, granted permission, and a token
   preview rather than `pending`.

Gate: Trust is ready and Push token is ready for the active platform, SDK
device, and external ID.

| Evidence | Next action |
|---|---|
| Trust failing plus no token | Use the guided Trust/clock card and the corporate trust reference |
| `FCM token retry scheduled` / `SERVICE_NOT_AVAILABLE` | Allow built-in 2/5/10/20 second retries; persistent failure often means trust/network |
| Token reported for another user | Apply the intended user and rerun readiness |
| `FCM unavailable` | Recheck committed Firebase client config and doctor |
| Waiting for telemetry forever | Confirm Android is selected and relaunch canonically |

Do not copy the full token into notes or chat. If comparison is essential,
use the drawer's local copy action and compare it directly with the current
user profile in Braze.

## Phase 6: End-To-End Delivery

Send from the same workspace established in Phase 1 to the active external
ID:

- Use a dashboard test send, or
- Use an approved `campaign_trigger` Story Control with session REST access.

Gate:

- Background app: system notification renders in the emulator shade.
- Foreground app: branded in-app banner renders and Control Room records
  foreground-push evidence.

If Braze reports sent but the device is silent, inspect in this order:

1. Workspace-side Firebase service account belongs to the shared project.
2. Active user's current Android device/token belongs to this install.
3. Notification permission remains granted.
4. Selected-pack SDK key/endpoint target the sending workspace.
5. Trust and token readiness remain green for the active user.

Foreground banner missing while background notification works is an app/web
regression; route to `lumo-debugging-playbook`.

## Phase 7: Preserve The Proof

- Keep app data and the AVD intact between proof and demo.
- Rehearse with `node tools/lumo.mjs android start --pack <id>`; it preserves
  data and re-proves trust/runtime state.
- If app data or the AVD is reset, expect a new SDK identity/token and repeat
  Phases 3 through 6.
- Record non-secret dashboard mappings and the date/outcome of the proof in
  ignored pack notes.
- On demo day, normal readiness belongs to `lumo-run-and-operate`; this full
  campaign does not auto-run again unless first-time proof was invalidated.
