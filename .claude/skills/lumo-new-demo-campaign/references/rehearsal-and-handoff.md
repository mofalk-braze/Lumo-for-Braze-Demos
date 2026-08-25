# Rehearsal And Handoff

Read this reference for end-to-end campaigns, rehearsals, presenter handoffs,
or public pack promotion.

## Contents

- [Rehearsal Gate](#rehearsal-gate)
- [Day-Of Fallbacks](#day-of-fallbacks)
- [Durable Handoff](#durable-handoff)
- [Optional Public Promotion](#optional-public-promotion)

## Rehearsal Gate

Run the scripted story twice. Restart after a failed row because a fix can
invalidate earlier proof.

| Check | Required Evidence |
|---|---|
| Full story | Two scripted runs without improvising new controls or scope |
| Signal order | Activity Feed shows the expected SDK and host-trigger sequence |
| Runtime identity | Pack, runtime hash, canonical rendered source, and active user agree with no warning chips |
| Push story | Token and live delivery remain proven on the actual demo machine |
| Fallbacks | Every risky beat has a written fallback in `notes.md` |

The second run should use the same Control Room and device actions the
presenter will use live.

## Day-Of Fallbacks

- Preflight the launch job to `Ready`; rebuilding a stale installed runtime is
  not a live-meeting fix.
- First-launch before the meeting on networks with TLS inspection. Route trust
  failures to `lumo-debugging-playbook`.
- For push stories, pre-stage a Content Card or IAM proof of the same message
  and write the fallback into `notes.md`.
- Read the port printed by Control Room rather than assuming `4177` is free.
- Do not wipe app or emulator data minutes before a demo. That destroys SDK
  identity and the current push token.

## Durable Handoff

A durable pack satisfies every property below:

| Property | Evidence |
|---|---|
| Stable identity | Kebab-case pack id remains consistent across discovery, assets, runtime, and notes |
| Stable placements | Card and Banner strings match the dashboard contract verbatim |
| Stable signal contract | Product action, flavor/anchor mapping, fallback preset, dashboard trigger, and notes agree |
| Self-contained private app | Product source and assets remain inside the ignored pack boundaries |
| Complete notes | A teammate can rebuild dashboard mappings and presenter flow from `notes.md` alone |
| Generated integrity | Fresh apply and runtime validation pass without hand edits |
| Secret isolation | Credentials remain in approved ignored or host-only carriers |
| Repeatability | No-op re-apply preserves public and deployment identities |

Leave the owner with the pack path, required local credentials by key name,
dashboard dependencies, exact launch workflow, acceptance evidence, known
fallbacks, and any skipped checks. Do not make chat history part of the
operating procedure.

## Optional Public Promotion

Promote only after explicit user authorization. Read the internal
`lumo-demo-pack-authoring` instructions for sanitization and pack movement,
then use `lumo-change-control-and-qa` for the full publishing gate. Customer
names, customer assets, live identifiers, credentials, and private product
source must not enter the committed public tree.
