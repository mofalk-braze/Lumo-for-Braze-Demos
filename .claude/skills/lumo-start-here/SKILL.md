---
name: lumo-start-here
description: Route an unfamiliar or mixed Lumo Demo Shells request to one primary lifecycle workflow. Use when a teammate is new to the repository, asks "where do I start" or "which skill", asks an architecture/configuration/integration/pack-schema question, or combines setup, building, operating, troubleshooting, and handoff concerns without a clear first phase. Do not use as an extra overlay when a specific lifecycle skill already owns the request.
---

# Lumo Start Here

Choose one primary workflow, read it completely, and take its first safe action.
Do not preload every possibly related skill. Load a specialist only when the
primary workflow names it or the request explicitly targets that reference.

## Route With Three Questions

1. **Is the demo story approved?** An approved story has a target belief, hero
   journey, typed signal/surface contract, and explicit non-goals, normally in
   `.demo-packs/<id>/DEMO.md`.
2. **Has this worked on this machine before?** Never-working setup and
   previously-working regression are different workflows.
3. **Is the user asking how something works or asking to change/run it?** A
   factual lookup needs a specialist reference; an action needs a lifecycle
   owner.

## Primary Lifecycle Owner

| Request state | Read first | Continue only when |
|---|---|---|
| Fresh clone, new machine, missing AVD, first bundled launch | `../lumo-build-and-env/SKILL.md` | Setup is healthy; route first-time Android push separately if the demo needs it. |
| No approved story, screenshots without a journey, existing Canvas without an app proof, or “what should I build?” | `../braze-solution-demo-campaign/SKILL.md` | The user approves the blueprint. |
| Approved blueprint or focused change inside an approved story | `../lumo-new-demo-campaign/SKILL.md` | The durable implementation, proof, rehearsal, and handoff are complete. |
| Start, rehearse, present, switch packs, or use Control Room | `../lumo-run-and-operate/SKILL.md` | A readiness check fails or a regression appears. |
| Something previously worked and is now broken | `../lumo-debugging-playbook/SKILL.md` | Evidence identifies recovery or proves the issue fixed. |
| Android push has never worked for this teammate/workspace | `../lumo-push-readiness-campaign/SKILL.md` | End-to-end push is proved on the intended install. |
| Credential placement, sanitization, secret incident, or sensitive handoff | `../lumo-secrets-and-sanitization/SKILL.md` | The secret boundary is resolved. |
| Validate, finish, commit, push, publish, or hand off repository changes | `../lumo-change-control-and-qa/SKILL.md` | Every applicable gate has fresh evidence. |

## Specialist References

Read these directly only for the named question. They are compatibility and
expert references, not additional automatic workflow owners.

| Question | Read |
|---|---|
| Why the runtime is designed this way; standing invariants | `../lumo-architecture-contract/SKILL.md` |
| Flag, environment variable, command, key name, or default | `../lumo-config-and-flags/SKILL.md` |
| SDK, bridge, REST, Content Card routing, or push mechanics | `../braze-integration-reference/SKILL.md` |
| Pack schema, fields, lifecycle, or promotion mechanics | `../lumo-demo-pack-authoring/SKILL.md` |
| Diagnostic instrument or output interpretation | `../lumo-diagnostics-and-tooling/SKILL.md` |
| Documentation ownership and house style | `../lumo-docs-and-writing/SKILL.md` |
| Focused implementation mechanics delegated by the build campaign | `../braze-demo-app-builder/SKILL.md` |
| Optional namespaced plugin compatibility | `../lumo-plugin-workflow/SKILL.md` |

## Operating Rule

- One phase has one owner.
- A later phase may invoke a new owner after its gate is reached; that is a
  handoff, not simultaneous ownership.
- Root rules in `AGENTS.md` and committed code/docs remain authoritative.
- Deterministic setup, status, pack, and validation work belongs to `lumo`
  commands and repository scripts; skills choose and interpret those tools.
- The optional plugin never becomes a second source of truth.

The machine-readable inventory and realistic routing cases live in
`../../../tools/agent-skill-routing.json`. Use them when changing a skill name,
description, automatic-invocation status, or lifecycle handoff.
