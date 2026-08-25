# Device And Dashboard Proof

Read this reference only when acceptance requires a native shell, live Braze
object, dashboard mapping, or push.

## Contents

- [Launch The Required Device](#launch-the-required-device)
- [Wire And Record Dashboard Objects](#wire-and-record-dashboard-objects)
- [Verify Push](#verify-push)

## Launch The Required Device

Start the Control Room for the preferred operator flow:

```sh
npm run lumo:cockpit
```

For an agent-driven Android launch:

```sh
node tools/lumo.mjs android start --pack <id>
node tools/lumo.mjs android status
```

Android launch applies the pack, builds the web distribution, validates and
assembles the APK, then installs and launches it. If the job fails part-way,
the emulator may still show an old install; do not treat that screen as proof.
Keep the Control Room authority running so it owns clock coverage and
correlated telemetry until an explicit stop.

For iOS, launch from Control Room. The simulator shell uses the Vite server,
so keep this process running for the session:

```sh
cd web-template && npm run dev
```

The readiness gate is correlated native evidence for the intended pack,
runtime hash, canonical rendered source, and active user, with no warning
chips. A visible page or matching URL alone is insufficient. Android launch
must also clear its native HTTPS trust checks.

Use `/tmp/lumo-demo-emulator.log` for emulator launch evidence and long-press
the Android WebView for on-device diagnostics. Route TLS, stale runtime, blank
WebView, or launch regressions to `lumo-debugging-playbook`.

## Wire And Record Dashboard Objects

Perform dashboard mutations only with the user's authorization in the
presenting teammate's workspace.

1. Build the campaign or Canvas around the approved canonical trigger. Prove
   that the real product action and its fallback preset emit the documented
   event and property types.
2. For Content Cards, set dashboard key `placement` to the exact pack
   `contentCardSurfaces[].placement` value.
3. For Banners, configure the exact `content.bannerSurfaces` placement id and
   verify it on the mapped native screen. Browser placeholders prove layout,
   not delivery.
4. Put API-triggered campaign or Canvas ids into the approved pack preset,
   then re-run the apply-and-validate loop.
5. Complete the pack `notes.md` mappings for every Content Card, Banner, IAM,
   push, campaign or Canvas, audience, presenter action, proof, and fallback.

The gate passes only when `notes.md` has no unresolved mapping placeholders or
drift warnings, and the app action, flavor/anchor behavior, fallback preset,
dashboard trigger, and notes describe the same contract.

For an unavailable, read-only, or externally controlled integration, record
the exact manual dependency and do not claim the object was created.

## Verify Push

Run this section only when push is part of the approved story. Use
`lumo-push-readiness-campaign` for the decision-gated machine, workspace,
token, and live-delivery workflow.

The active platform and external id must report a token for the current
install. A token from a different or previous install is not delivery proof.
Finish only after a real push visibly arrives on the presenting device through
the same trigger path intended for the live demo.
