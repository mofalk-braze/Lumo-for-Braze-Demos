---
name: lumo-debugging-playbook
description: >-
  Diagnose and repair regressions in a Lumo environment or demo that worked
  before: failed Android/iOS/web launches or builds, emulator/trust/clock
  regressions, stale pack/runtime/render identity, Control Room blockers,
  Content Cards/Banners/IAM no longer appearing, or Android push that was
  previously proven and stopped. Use for "debug", "worked yesterday",
  "stopped working", "build failed", "blank screen", "hash mismatch",
  "cards/IAM missing", "emulator will not boot", or "push stopped arriving".
  For prerequisites that never worked use lumo-build-and-env; for Android push
  that has never been proven in this teammate's workspace use
  lumo-push-readiness-campaign.
---

# Lumo Debugging Playbook

Own the measurement-plus-fix loop for regressions. Preserve the failing state,
identify the failing layer, change only the confirmed cause, and prove the fix
with correlated evidence.

## First Decision: Regression Or Bring-Up

Ask one factual question before changing anything: **did this exact capability
ever work on this machine, install, and workspace?**

- No, fresh, or unknown environment prerequisites: `lumo-build-and-env`.
- Android app works but end-to-end push was never proven in this workspace:
  `lumo-push-readiness-campaign`.
- Yes, this capability previously worked and now fails: continue here.

Do not collapse the first-time and previously-working push paths. First-time
push requires workspace-side Firebase and credential proof; regression triage
must preserve the known-good install identity and search for what changed.

## Regression Loop

1. Reproduce once and record the exact failing action and time.
2. Open Control Room **05 Help & Troubleshooting**. Read the relevant guided
   card and perform its single safe next action.
3. If unresolved, switch to Expert and capture the first failing boundary:
   launcher job, runtime/render evidence, native telemetry, trust, SDK, or
   Braze delivery.
4. Run one discriminating experiment from the routing table below.
5. Fix only the confirmed layer; do not reset state as an experiment.
6. Re-run the original action and prove both technical readiness and the
   audience-facing outcome.

Use **Download redacted bundle** for escalation. Never share raw
`.demo-launcher/state.json`, full tokens, credential-bearing logs, or private
pack identifiers.

## Evidence And First Experiment

| Symptom | Read first | First safe experiment |
|---|---|---|
| Android launch/emulator failure | Launcher Logs, `/tmp/lumo-demo-emulator.log` | `node tools/lumo.mjs android status`, then one canonical start |
| Android push stopped | Trust/Push cards, Device Identity, drawer | Re-run Verify trust and Verify push readiness for the active user |
| Blank Android/iOS WebView | Rendered-source card, native log | Android: long-press drawer; iOS: `curl -sI http://localhost:5173` |
| Pack/hash/source mismatch | Runtime Contract vs Device Identity | `node tools/lumo.mjs android start --pack <id>` |
| Build/apply failure | First build error, not final summary | Run the failing apply/build once outside the UI |
| Content Card/Banner missing | Activity proof plus surface placement | Confirm delivery count and exact placement separately |
| IAM missing | SDK event evidence plus IAM registration/trust | Trigger once, wait beyond the minimum interval, inspect native log |
| Control disabled | Blocker tooltip and readiness row | Perform that row's one next action; do not bypass gating |

Read
[references/recovery-recipes.md](references/recovery-recipes.md) after the
first experiment identifies a symptom family. It contains the detailed,
least-destructive repair and verification recipes for push regressions,
emulator/trust, platform WebViews, build/runtime drift, Braze message surfaces,
and Control Room telemetry.

Read [references/error-messages.md](references/error-messages.md) only when an
exact pack, Gradle, Android, emulator, iOS, or launcher error needs to be
mapped back to its source.

Read the
[expert diagnostics reference](../lumo-diagnostics-and-tooling/SKILL.md) only
when the guided card, standard logs, and first experiment do not explain the
evidence, or when an expert needs the doctor/validator interpretation,
runtime-drift script, raw state schema, or full instrument catalog.
Diagnostics is an internal expert reference, not a second regression owner.

For a confirmed corporate trust-store repair branch, read the
[Zscaler trust mechanics](../lumo-push-readiness-campaign/references/zscaler-trust-mechanics.md)
before using `TRUST_MODE=repair`.

## Definition Of Fixed

A repair is complete only when:

- The original action succeeds twice without a new workaround.
- The launcher and device agree on pack id, `configHash`, `runtimeHash`,
  canonical rendered source, selected-pack credential context, and external
  ID.
- Android trust is ready; push is ready when that story requires it.
- The intended audience-facing surface appears and its Activity Feed proof is
  present.
- Any temporary Expert override is removed and bundled mode is restored.

## Safety Invariants

- Do not run `RESET_APP_DATA=1`, uninstall the app, erase a simulator, or use
  `RECREATE_AVD=1` without explicit authorization. They destroy SDK identity
  and push continuity and invalidate comparison with the known-good state.
- Do not hand-edit generated runtime or native seed files. Repair the pack or
  source and re-apply.
- Do not bypass runtime, identity, trust, or push gating to make a control
  clickable.
- Do not guess a device PIN. The supported Android keyguard is non-secure
  Swipe.
- Treat Android live-web overrides as temporary Diagnostics-only development
  state; prove bundled mode before handoff.

## Lifecycle Handoff

- Once repaired, return to `lumo-run-and-operate` for rehearsal.
- If the evidence reveals a missing prerequisite rather than a regression,
  use `lumo-build-and-env`.
- If push was never actually proven in this workspace, stop regression triage
  and run `lumo-push-readiness-campaign` from its first gate.
- Route code/doc changes discovered during repair through
  `lumo-change-control-and-qa` before commit.

## Provenance

Re-check recipes against `tools/demo-launcher.mjs`,
`tools/control-room-template.mjs`, `tools/validate-demo-runtime.mjs`,
`android-shell/tools/run-demo-emulator.sh`,
`android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt`,
`ios-shell/Sources/WebViewController.swift`, and
`web-template/src/braze/BrazeBridgeProvider.tsx`.
