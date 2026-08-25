---
name: lumo-push-readiness-campaign
description: >-
  Bring up and prove end-to-end Android push for a teammate or Braze workspace
  where push has never worked: verify the Android environment, workspace-side
  Firebase service account, selected-pack SDK credentials, rootable emulator
  trust, notification permission, FCM token binding, and a rendered test push.
  Use for "set up push", "first push", "push has never worked", "new teammate
  push", "configure Firebase for Braze", "prove FCM", or first-time corporate
  Zscaler push enablement. If the same install/workspace previously received
  push and stopped, use lumo-debugging-playbook. Android only; iOS push needs
  an org-signed build and is outside this campaign.
---

# Lumo Push Readiness Campaign

Prove one notification sent from the teammate's Braze workspace renders on
their Android emulator. This campaign owns first-time push bring-up, not every
demo preflight and not regression repair.

## First Decision: Has Push Ever Worked Here?

- Never, fresh teammate/workspace/install, or unknown: continue here.
- Worked before on this exact machine, install, user, and workspace: use
  `lumo-debugging-playbook` and preserve the known-good identity.
- Environment or AVD itself never worked: complete `lumo-build-and-env` first.
- iOS push: stop. Unsigned simulator builds cannot prove APNs delivery.

Do not merge these branches. First-time proof must establish dashboard-side
Firebase configuration and local identity; regression repair must not destroy
the previously proven install while searching for the change.

## Completion Contract

Do not declare readiness from a Braze “sent” status or a token alone. Done
means all gates pass for the same selected pack, Android install, external ID,
and Braze workspace:

1. Android-targeted doctor passes.
2. The workspace has the shared Firebase service-account credential.
3. The selected pack supplies the workspace's SDK key and endpoint.
4. Canonical launch proves runtime, render, trust, and clock readiness.
5. Android notification permission is granted.
6. An FCM token is registered for the active external ID.
7. A push sent from that workspace renders on the emulator.

Read
[references/push-runbook.md](references/push-runbook.md) before executing the
campaign. Follow its phases in order; it contains exact commands, expected
observations, and branches for each gate.

Read
[references/zscaler-trust-mechanics.md](references/zscaler-trust-mechanics.md)
only when the machine is on the corporate network, a trust probe fails, a cold
boot lost the Conscrypt mount, or the canonical launcher explicitly requires
`TRUST_MODE=repair`. Do not load or apply the repair mechanics speculatively.

## Fast Command Surface

The campaign uses these canonical host commands:

```sh
node tools/lumo.mjs android doctor
node tools/lumo.mjs android setup
node tools/lumo.mjs android start --pack <id>
node tools/lumo.mjs android status
```

Use Control Room for selected-pack credential entry, active-user application,
the trust and push-readiness controls, Activity Feed proof, and optional safe
campaign triggering. Do not launch the emulator manually for push work.

## Non-Negotiable Boundaries

- Firebase service-account JSON is a server credential. Transfer it outside
  Git and upload it to the teammate's Braze workspace; never save it in the
  repository or replace the committed Firebase client JSON with it.
- SDK key/endpoint belong to selected-pack local state. REST keys remain
  host-only session/environment state.
- Use the dedicated rootable `Braze_Demo_API_36` `google_apis` AVD. Google Play
  images cannot support the required corporate trust path.
- Never copy another machine's FCM token. Tokens identify one app install.
- Never use `RESET_APP_DATA=1`, uninstall, or `RECREATE_AVD=1` as a push fix.
  They destroy device identity and require the campaign to restart from
  launch, permission, token, and delivery proof.
- Never bypass failed trust, identity, or push readiness gating.
- Preserve the proven install between rehearsal and the meeting.

## Evidence To Retain

Record in the ignored pack `notes.md` without secrets or full tokens:

- Braze workspace/cluster and dashboard setup owner.
- Active external ID convention.
- Date the trust, token, background-notification, and foreground-banner gates
  last passed.
- Campaign/Canvas mapping used for proof.
- Any remaining manual handoff dependency.

For escalation, download the redacted diagnostic bundle. Never paste raw
launcher state, full FCM tokens, SDK keys, REST keys, or the Firebase
service-account JSON.

## Provenance

Re-check this campaign against `tools/lumo-android-cli.mjs`,
`tools/demo-launcher.mjs`, `tools/control-room-template.mjs`,
`android-shell/tools/run-demo-emulator.sh`,
`android-shell/tools/install-zscaler-system-ca.sh`,
`android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`, and
`docs/lumo-public-quickstart.md`.
