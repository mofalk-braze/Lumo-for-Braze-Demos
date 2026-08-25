---
name: braze-solution-demo-campaign
description: Shape an incomplete or overgrown Braze demo idea into one approved, evidence-backed story before implementation. Use for "now what do I build", first-demo planning, weak or missing discovery, screenshot folders without a journey, an existing Canvas or campaign that needs an app experience, choosing Content Cards/Banners/IAM/push, defining SDK events and payloads, simplifying demo scope, or producing an agent implementation handoff. Once target belief, hero journey, data contract, surfaces, and non-goals are approved, route execution to lumo-new-demo-campaign instead of duplicating its build workflow.
---

# Braze Solution Demo Campaign

Own the decision before the build: turn evidence and gaps into the smallest
credible customer story. Do not reproduce pack, SDK, Control Room, setup,
validation, or rehearsal mechanics owned by the Lumo skills.

Read [references/solcon-operating-model.md](references/solcon-operating-model.md)
completely before substantive work. Use [assets/DEMO.md](assets/DEMO.md) as the
durable blueprint. While the draft exists only in the response, apply the scope
thresholds manually. After the approved blueprint has a private file path, run
`node .claude/skills/braze-solution-demo-campaign/scripts/check-demo-scope.mjs
<path/to/DEMO.md>` after material scope changes.

## Route First

- If the target belief, hero journey, data contract, surfaces, and non-goals
  are already approved, stop shaping and invoke `lumo-new-demo-campaign`.
- If the user only needs one focused product screen or event-story change in
  an existing approved pack, route through `lumo-plugin-workflow` to
  `braze-demo-app-builder`.
- If the request is ambiguous, screenshot-led, Canvas-led, feature-led, or
  becoming hard to explain, stay here until the story boundary is approved.
- Select `standard` for dashboard-heavy proof with no custom product build.
  Select `app-hybrid` when the proof needs a Lumo pack, native SDK event, or
  product surface.

## Orient

1. Establish the customer decision, problem and impact, audience, meeting,
   deadline, evidence, constraints, and explicit non-goals.
2. Classify every material statement as customer fact, Braze fact, inference,
   assumption, inspiration, or discovery question. Never convert product
   possibility into customer evidence.
3. Ask only questions that can change the chosen story. When context is thin,
   propose provisional assumptions visibly instead of requiring the SolCon to
   design the solution unaided.
4. Offer at most three customer-problem-led story hypotheses. Recommend one
   target belief and one hero journey; state the weakest assumption, what to
   cut, the simplest credible alternative, and what needs live Braze proof.
5. Keep the proposed frontstage small: usually one protagonist, one guardrail
   profile, five to seven beats, no more than three explained capabilities,
   two visible surfaces or channels, and five to seven presenter controls.
   Treat these as warning thresholds, not fixed product limits.

## Design The Proof Contract

Build the blueprint around one observable loop:

`app action -> SDK/profile evidence -> Braze decision -> visible response -> proof or guardrail`

For every beat, record all of the following before implementation:

- the real product state and user action;
- the native SDK operation (`changeUser`, custom event, attribute, purchase,
  Content Cards refresh, or push registration);
- the exact wire event or attribute name and typed example properties;
- the Braze object and decision using that signal;
- the visible response and exact app surface;
- the proof, reset, and safe fallback.

The app action, its flavor-to-anchor mapping, any Control Room fallback preset,
the dashboard trigger, and the generated pack `notes.md` must agree on the same
canonical trigger contract. A flavor event may make the story recognizable;
use a stable anchor for portable dashboard logic. If an operator preset must
reproduce an app action that emits both, use an SDK event sequence or explicitly
target the one event both paths emit. Do not imply that a raw REST event proves
an on-device IAM trigger.

Define the message surface precisely:

- Content Card: screen, slot, variant, empty behavior, and exact
  `extras.placement` value.
- Banner: screen, native slot, and exact Braze placement id.
- IAM: exact SDK trigger event, eligibility/re-eligibility, and reset.
- Push: active external id/app/workspace, token readiness, deep link, delivery
  proof, and a non-push fallback.

## Start From Either Side

For screenshots or an app concept, work forward from product action to data,
decision, and response. Extract the source app's visual system; do not inherit
the Lumo reference pack's style or story.

For an existing Canvas or campaign, work backward from its entry criteria,
message steps, personalization inputs, and channels. Identify the minimum app
action, SDK payload, identity state, placement, and visible screen needed to
make that object demonstrable. Treat unknown workspace state as an assumption
until inspected; connection never proves write capability.

## Produce The Approval Handoff

Use the compact `DEMO.md` template. Keep a draft in the response until a private
working location is known. For App/hybrid work, the approved copy belongs at
`.demo-packs/<pack-id>/DEMO.md` after `lumo pack new` creates the neutral pack.
It defines intent and scope; generated `notes.md` remains the dashboard and
operator handoff.

Before requesting approval, return:

- one recommended target belief and hero journey;
- evidence, assumptions, and remaining discovery questions;
- five-to-seven story beats and the exact signal/surface contract;
- LIVE / RESERVE / TALK / DROP scope and a clear do-not-build list;
- the weakest dependency and fallback;
- what the agent will build only after approval.

Approval means the user accepts the story boundary, not that every later
dashboard id already exists. Mark unresolved ids and workspace checks as
explicit implementation dependencies; never invent them.

## Hand Off Without Duplication

After approval, invoke `lumo-new-demo-campaign` with the completed blueprint,
source evidence, screenshots, authorized actions, and unresolved dependencies.
That skill owns neutral pack creation, delegated screenshot build, native proof,
dashboard wiring, notes, rehearsal, and handoff. Continue to challenge later
scope additions here only when they introduce a new journey, channel, persona,
decision point, or explained capability.

For any external API, MCP, publishing, or workspace mutation, use
`inspect -> proposed diff -> approval -> apply -> read back`. Do not claim that
an unavailable or read-only integration can create Braze objects.
