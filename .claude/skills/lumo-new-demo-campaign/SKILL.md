---
name: lumo-new-demo-campaign
description: >-
  Implement an approved Braze demo in the Lumo Demo Shells repo. This is the
  single automatic implementation entry for either a focused approved change
  to an existing pack or an end-to-end approved blueprint that needs a neutral
  pack, product build, Braze wiring, device proof, rehearsal, and handoff. Use
  only after target belief, hero journey, signal/surface contract, and non-goals
  are approved. For ambiguous evidence, unbounded screenshots, Canvas-first
  mapping, or "what should I build", use braze-solution-demo-campaign first.
---

# Lumo New-Demo Campaign

Own approved implementation from the first repository edit through the
requested proof. Keep one approval boundary: this skill executes a decided
story; it does not manufacture one from incomplete evidence.

## Confirm The Entry Gate

Before editing, identify the approved target belief, hero journey, exact
signal/surface contract, and explicit non-goals.

- If any of those decisions could materially change what gets built, invoke
  `braze-solution-demo-campaign` and stop implementation.
- If they are approved, stay in this skill for both a focused change and an
  end-to-end campaign. Do not route an automatic request directly to the
  builder or pack-authoring compatibility skills.
- A dashboard id or workspace check may remain an explicit implementation
  dependency. Never invent it.

## Select One Execution Depth

**Focused implementation** applies when an approved existing pack needs a
bounded screen, event story, surface, preset, launch link, or native SDK flow.
Implement only the accepted change, run its relevant proof, update the pack
handoff, and stop. Do not create a new pack or force a full rehearsal unless
the accepted outcome requires one.

**End-to-end campaign** applies when the approved blueprint still needs a pack
and must finish as a durable, device-proven, rehearsed demo. Run every relevant
campaign gate through handoff.

## Load Detail Only When It Becomes Relevant

- For either execution depth, read
  [references/build-and-validate.md](references/build-and-validate.md) before
  the first edit. It owns intake, optional neutral-pack scaffold, delegated
  build gates, and the apply/validate loop.
- When implementing product UI, events, Content Cards, Banners, IAM, push
  previews, launch links, or native SDK behavior, read
  [../braze-demo-app-builder/SKILL.md](../braze-demo-app-builder/SKILL.md).
  Then read only the builder reference named for the feature. The builder is
  an internal/manual compatibility skill; this campaign remains the owner.
- When creating or editing `demo-pack.json`, assets, `notes.md`, pack-local
  credentials, or public promotion, read
  [../lumo-demo-pack-authoring/SKILL.md](../lumo-demo-pack-authoring/SKILL.md).
  Read its `references/pack-schema.md` only when exact field or preset shapes
  are needed. Pack authoring is an internal/manual compatibility skill.
- Read
  [references/device-and-dashboard-proof.md](references/device-and-dashboard-proof.md)
  only when acceptance requires a native shell, live Braze object, dashboard
  mapping, or push.
- Read
  [references/rehearsal-and-handoff.md](references/rehearsal-and-handoff.md)
  only for an end-to-end campaign, rehearsal, presenter handoff, or public
  promotion.

Do not copy specialist instructions into this skill. Follow the referenced
owner and return here for orchestration and completion.

## Execute The Focused Path

1. Inspect the approved blueprint when present, the active pack, its generated
   `notes.md`, and the files that own the requested behavior.
2. State the bounded acceptance proof and the explicit non-goals.
3. Load the builder and/or pack expert instructions only as routed above.
4. Implement the minimum coherent slice. Keep the app action, SDK operation,
   wire payload, dashboard trigger, visible response, fallback, and notes on
   one contract.
5. Run the relevant apply, structural, web, and native checks from the build
   reference and the builder QA reference.
6. Update `notes.md` for every changed Content Card, Banner, IAM, push, or
   dashboard mapping. Report unresolved external dependencies plainly.

## Execute The End-To-End Path

1. Resolve implementation inputs without reopening the approved story.
2. Create a neutral local pack unless an approved pack already exists.
3. Delegate bounded product and SDK implementation to the internal builder.
4. Apply and validate until runtime artifacts are coherent and reproducible.
5. Prove the required native and dashboard behavior on the presenting setup.
6. Verify push only when it is part of the approved story.
7. Rehearse twice, complete the durable handoff, and record fallbacks.

Each numbered step has a gate in the routed reference. Stop at a failed gate;
do not compensate by widening scope or substituting a visual mock for native
or dashboard proof.

## Completion Standard

For focused work, finish only when the accepted change works through its real
runtime owner, relevant checks pass, and the handoff matches the implemented
contract.

For an end-to-end campaign, finish only when the pack re-applies cleanly,
runtime and rendered-source evidence agree, required live Braze behavior has
been proven, the scripted story passes twice, and the owner can reproduce the
setup from the pack handoff without relying on chat history.

Route first-time machine setup to `lumo-build-and-env`, first-time Android push
bring-up to `lumo-push-readiness-campaign`, regression diagnosis to
`lumo-debugging-playbook`, and commit/publish gates to
`lumo-change-control-and-qa`. Use `lumo-secrets-and-sanitization` only when the
work actually touches credentials, distribution, or sanitization.
