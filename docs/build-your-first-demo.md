# Build Your First Demo

This guide starts after the Android setup contract passes. It explains how to
turn discovery, screenshots, or an existing Braze Canvas into one small app
story that another SolCon can rebuild, operate, and troubleshoot.

Do not start by copying screens or creating campaigns. First agree on the
experience contract that both sides will implement.

## The Outcome

A working demo is one observable loop:

```text
product action -> native SDK/profile evidence -> Braze decision
               -> visible response -> proof or fallback
```

The app clone is not the demo by itself. A Canvas is not the demo by itself.
The demo exists when the same typed signal, identity, placement, and expected
result agree across the app, native SDK, Braze workspace, Control Room, and
handoff notes.

Keep the first version small:

- one target belief;
- one hero journey;
- usually five to seven beats;
- no more than three capabilities that need explanation;
- usually no more than two live message surfaces or channels;
- no more than seven presenter controls;
- a written fallback for every network- or workspace-dependent beat.

These are warning thresholds, not product limits. If IAM, Content Cards, and
push are all requested, consider keeping the least reliable or least important
one in `RESERVE` until the core loop is proven.

## Use The Agent Front Door

Start the coding agent in the repository root. Claude Code discovers the
committed project skills automatically. Other coding agents must read
`AGENTS.md` and the owning `.claude/skills/<skill>/SKILL.md` before acting.

Use this first prompt when the story is incomplete:

```text
Use the project skill braze-solution-demo-campaign. Help me turn the evidence
and screenshots I provide into the smallest credible Braze demo story. Start
by recommending one target belief and one hero journey. Classify facts,
assumptions, and discovery gaps; define the exact app action, native SDK signal,
typed payload, Braze decision, visible response, proof, and fallback for every
beat. Challenge unnecessary channels and complexity. Do not create a pack,
copy Lumo, edit code, or mutate Braze until I approve the DEMO.md blueprint.
```

That skill owns story shaping. After approval it hands the blueprint to
`lumo-new-demo-campaign`, which owns the build, device proof, dashboard handoff,
rehearsal, and completion gates. `braze-demo-app-builder` implements focused
approved screens and event-story features; it is not the first stop for an
unbounded screenshot folder.

## The Three Artifacts

Keep intent, runtime configuration, and operator handoff separate.

### `DEMO.md` — What And Why

The approved blueprint records:

- target belief, audience, meeting, and hero journey;
- customer facts, Braze facts, assumptions, and discovery questions;
- the beat-by-beat experience and typed data contract;
- `LIVE`, `RESERVE`, `TALK`, and `DROP` scope;
- explicit non-goals and simulation boundaries;
- proof, reset, and fallback expectations.

Use the source template at
`.claude/skills/braze-solution-demo-campaign/assets/DEMO.md`. Once a neutral
pack exists, store the approved private copy at
`.demo-packs/<pack-id>/DEMO.md` and validate it with:

```sh
node .claude/skills/braze-solution-demo-campaign/scripts/check-demo-scope.mjs \
  .demo-packs/<pack-id>/DEMO.md
```

### `demo-pack.json` — What The Runtime Builds

The pack owns public app identity, theme, tabs, content, message surfaces,
flavor events, demo user defaults, and reusable story controls. Applying it
generates runtime config and native seed metadata. Never hand-edit generated
runtime files.

Private screenshot-built product code belongs under:

```text
.demo-packs/<pack-id>/app-source/web-template/src/screens/local-pack/
```

Expose it through `pack-app.tsx`. Keep private screens, routes, ids, and assets
out of tracked `web-template/src`.

### `notes.md` — How To Rebuild And Operate It

`lumo pack new` generates this handoff. Complete its story contract and exact
Content Card, Banner, IAM, push, audience, campaign/Canvas, proof, presenter,
reset, and fallback mappings.

`lumo pack validate` can return a structural `PASS` while warning about
unresolved placeholders or mapping drift. Those warnings mean the handoff is
unfinished. Resolve every warning before rehearsal or sharing.

## Start From Either Side

### Screenshots Or An App Concept

Use screenshots as visual evidence, not business discovery. Work forward:

1. Identify the real screen state and product action.
2. Decide what the native SDK must record or change.
3. Define the typed payload and identity.
4. Define the Braze decision that consumes it.
5. Choose the visible response and exact placement.
6. Define proof, reset, and fallback.

Eight to twelve screenshots usually provide enough navigation, density,
typography, and state coverage. They do not tell the agent which use case the
customer needs or which message channel belongs in the story.

### An Existing Campaign Or Canvas

Work backward from the real workspace object:

1. Inspect its entry criteria, audience, steps, channels, personalization
   inputs, delays, and exit conditions.
2. Identify the minimum app identity, state, event, attribute, purchase,
   placement, and screen needed to make it visible.
3. Record unknown ids, permissions, and workspace state as dependencies.
4. Build only the product actions and surfaces that make that object
   demonstrable.

An MCP or account connection can provide context. It does not prove that the
agent can create or edit Braze objects. For any workspace mutation use:

```text
inspect -> proposed diff -> approval -> apply -> read back
```

If the available integration is read-only, the agent must produce an exact
dashboard build sheet for the SolCon instead of claiming it created anything.

## Resolve The Chicken And Egg

Do not build the app first and ask what to trigger later. Do not build a large
Canvas first and ask what app could demonstrate it later.

Freeze this shared contract before either side builds:

| Contract Field | Example Shape |
|---|---|
| Product action | User saves a preference on the onboarding screen |
| Native SDK operation | Set an attribute and log a custom event |
| Canonical trigger | `preference_updated` |
| Typed payload | `preference_id: string`, `source: string` |
| Identity | Active external id in the selected pack and Braze app |
| Braze consumer | Action-based Canvas entry or campaign trigger |
| Visible response | Content Card on `recommendations_feed` |
| Proof | SDK event in Activity Feed plus visible native card |
| Fallback | Run the matching SDK preset and show saved proof |

Once this table is approved, the app implementation and dashboard build can
proceed in parallel. They rejoin at device proof and `notes.md` completion.

## Create A Clean Pack

For every new product concept, create a neutral private pack:

```sh
node tools/lumo.mjs pack new sample-loyalty --name "Sample Loyalty"
node tools/lumo.mjs pack open sample-loyalty --print
```

The neutral starter has one Home tab, neutral colors, no story event, no
presenter preset, and no selected Content Card, Banner, IAM, or push contract.
Add only what the approved blueprint requires.

Do not copy `demo-packs/Lumo` and strip it down. Do not use `duplicate` for a
new app concept. Duplication deliberately preserves the source app, styling,
story, events, placements, assets, and private surface; use it only when the
human explicitly wants a close variant:

```sh
node tools/lumo.mjs pack duplicate <source-id> <new-id> --name "<New Name>"
```

Credentials are never copied.

## Define The Data Contract

For each meaningful presenter or in-product action, record all of these:

| Field | Requirement |
|---|---|
| Product state | The screen and state the user can actually see |
| Action | The real tap, submit, save, purchase, or navigation |
| SDK method | `changeUser`, custom event, attribute, purchase, refresh, or push registration |
| Wire name | Stable snake-case event or attribute name |
| Properties | Exact keys, types, and representative values |
| Profile mutation | Which attribute or subscription state changes, if any |
| Braze consumer | Segment, campaign, Canvas entry, decision step, or personalization |
| Visible result | Exact channel, screen, slot, copy state, and timing |
| Proof | Activity evidence plus visible SDK-delivered result |
| Reset/fallback | How to repeat it safely and what to show when it fails |

Prefer a small, portable anchor vocabulary and put app-specific detail in typed
properties. A flavor event can make the app story recognizable, but the app
action, its flavor-to-anchor mapping, any fallback preset, the dashboard
trigger, and `notes.md` must name one canonical trigger that both paths emit.

Do not use a host REST event as proof that an on-device IAM can trigger. IAM
proof requires the native app SDK path for the active user.

## What The Native SDK Actually Sends

The product UI never initializes Braze directly. It sends an action across the
shared web-to-native bridge; Android or iOS executes the real Braze SDK method
for the active external id and requests an immediate data flush.

| Product Intent | Bridge Action And Payload | Native SDK Effect |
|---|---|---|
| Identify the demo user | `changeUser` with `{ externalId, sync }` | Changes SDK identity, clears cached cards for the old user, and reports the new connection |
| Track behavior | `logCustomEvent` with `{ name, properties? }` | Logs a custom event with typed Braze properties |
| Change profile state | `setCustomAttribute` with `{ key, value }` | Sets or unsets one typed custom attribute on the current user |
| Record value | `logPurchase` with `{ productId, price, currency?, quantity?, properties? }` | Logs a purchase; currency defaults to `USD` and quantity to `1` |
| Refresh persistent content | `requestContentCardsRefresh` | Requests a real SDK card refresh and returns normalized cards to the web surface |
| Prove card engagement | `logContentCardImpression` or `logContentCardClick` with `{ cardId }` | Calls the real cached card's impression or click method |
| Ask for notifications | `requestPushPermission` | Runs the native Android/iOS permission flow and reports the result |

A typical app event crosses the bridge in this shape:

```json
{
  "action": "logCustomEvent",
  "payload": {
    "name": "preference_updated",
    "properties": {
      "preference_id": "dark-roast",
      "source": "onboarding"
    }
  }
}
```

The property contract is part of the demo API. Keep `preference_id` and
`source` as strings everywhere: product code, fallback preset, Canvas entry or
decision, personalization, `DEMO.md`, and `notes.md`. Do not let a dashboard
operator silently rename a key or change its type.

Pack flavor helpers can log an app-specific flavor event and its portable
anchor as two SDK events. A Control Room preset logs only what its payload
declares. If the dashboard consumes the anchor and the fallback must mirror
both calls, use an `sdk_event_sequence`; a flavor-only preset is not an
equivalent fallback.

The Activity Feed receives correlated device telemetry shaped like
`{ platform, type, status, externalId, payload, result }`. That row proves that
the shell executed the SDK path; it is not a second Braze event and it is not a
copy of Braze's internal network request. Confirm the dashboard user or the
visible message when the story requires end-to-end proof.

Host-side `rest_event`, `rest_attribute`, and `rest_purchase` controls instead
call `/users/track` from the launcher. They are useful for controlled setup or
fallbacks, but they do not prove that the app's native SDK action occurred and
cannot trigger an on-device IAM as SDK evidence.

The exhaustive action and telemetry payload tables live in
`.claude/skills/braze-integration-reference/references/bridge-actions.md`.

## Choose The Message Surface

Choose a surface because it fits the product moment, not because the runtime
supports it.

| Surface | Use It When | Exact Contract | Minimum Proof |
|---|---|---|---|
| Content Card | The message should persist or live inside product content | Screen, slot, variant, empty behavior, and case-sensitive `extras.placement` | Native SDK delivers a card with the matching placement and it is visible in the intended slot |
| Banner | A prominent native-managed slot belongs in the current screen | Screen, mounted slot, unique Braze placement id, and height | Placement mount plus matching SDK update/render telemetry and visible creative |
| IAM | A just-in-time response follows an app action | Exact native SDK trigger, eligibility, re-eligibility, dismissal, and reset | Event evidence plus visible impression on the active user |
| Push | The story needs an out-of-app return moment | Active app/workspace/user, current install token, channel, deep link, and permission | Real dashboard delivery received and tapped on the presenting device |

Browser placeholders prove layout only. They do not prove native Content Card
or Banner delivery, IAM display, or push.

Push also requires the manually shared Firebase service account to be uploaded
to the presenting SolCon's Braze workspace. Each emulator install has its own
FCM registration token; never reuse or share a token from another machine.

## Build The Dashboard Sheet

Before creating Braze objects, have the agent return this table:

| Beat | Object | Entry Or Trigger | Audience | Properties And Types | Surface Or Placement | Personalization | Reset | Proof |
|---:|---|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |  |  |

Require exact values, not prose such as “trigger on onboarding.” Record object
ids only after they are observed or created. If the workspace is built
manually, paste the confirmed ids and results into the pack's `notes.md`.

## Apply, Launch, And Prove

After the approved app and pack are implemented:

```sh
node tools/lumo.mjs pack validate <pack-id>
node tools/demo-launcher.mjs --pack <pack-id> --apply-only
npm run validate:demo-runtime
node tools/lumo.mjs android start --pack <pack-id>
node tools/lumo.mjs android status
```

Require all of these before calling the app ready:

- the pack and generated runtime agree on `configHash` and `runtimeHash`;
- Android reports the same pack, bundled rendered source, SDK credentials, and
  active external id;
- the real app action emits the documented typed signal;
- the matching Braze object consumes that signal;
- each required message is visibly delivered on its declared native surface;
- the fallback preset emits the same canonical trigger as the app action;
- `notes.md` has no unresolved placeholder or mapping-drift warning.

Rehearse the exact story twice. Do not clear app data or wipe the AVD between
runs; that destroys SDK device identity and the push token.

## Use The Simplified Control Room

The Control Room opens in Guided mode at `00 First Demo`.

- `Pack` confirms the active app concept.
- `App` combines SDK, native runtime, trust, user, and any story-required push
  evidence.
- `Story` accepts only pack-owned or staged controls. Generic fallback
  templates cannot make it ready.
- If Story is missing, the next action copies the solution-campaign starter
  prompt before asking for SDK, REST, push, or device work.
- Once Story exists, the page shows its next runtime action, approved controls,
  and recent Activity Feed proof.
- `Help & Troubleshooting` keeps guided cards and the redacted diagnostic
  bundle available without exposing raw internals.

Use Expert mode for template engineering, raw REST requests, hashes, logs,
REST responses, and Android live-web override controls. A story that uses only
native SDK controls does not need a REST key. REST fields appear in Guided mode
only when an approved story control needs host-side REST.

## Troubleshoot In Order

1. Confirm the selected pack, bundled source, runtime hash, and active user.
2. Confirm the native SDK action and typed payload in Activity Feed.
3. Confirm the Braze user, audience, eligibility, and exact trigger.
4. Confirm the exact Content Card or Banner placement, IAM re-eligibility, or
   push token/channel state.
5. Use the safest action on the matching guided troubleshooting card.
6. Download the redacted diagnostic bundle and point the coding agent at it.

Do not paste API keys, raw service-account files, or registration tokens into
the agent prompt. Do not reset app data as a first troubleshooting step.

## Starter Prompt Library

### Shape A Story From Discovery And Screenshots

```text
Use braze-solution-demo-campaign. Here is the discovery summary and the path to
my screenshots. Recommend one target belief and one five-to-seven-beat journey.
Separate facts, assumptions, and questions; choose no more than two LIVE message
surfaces unless you explain the tradeoff. Draft DEMO.md with exact typed SDK
signals, Braze decisions, placements, proof, reset, fallback, and do-not-build
scope. Do not implement until I approve it.
```

### Reverse-Map An Existing Canvas

```text
Use braze-solution-demo-campaign. Inspect the Canvas/campaign information I
provide and work backward from its entry criteria, steps, channels, and
personalization. Define the minimum app screens, identity, SDK actions, typed
payloads, and message placements needed to demonstrate it. Mark every workspace
fact you cannot verify. Return a DEMO.md draft and dashboard/app contract before
building anything.
```

### Build The Approved App

```text
Use lumo-new-demo-campaign with the approved .demo-packs/<pack-id>/DEMO.md and
the screenshot folder I provide. Create the concept with lumo pack new, never by
copying Lumo. Delegate the private screenshot UI to braze-demo-app-builder,
keep it under the pack's app-source, and make every app action, SDK payload,
fallback preset, dashboard trigger, and notes.md mapping agree. Prove Android in
bundled mode and stop at any manual credential or Braze-workspace boundary.
```

### Produce The Dashboard Build Sheet

```text
Read the approved DEMO.md and implemented demo pack. Produce one exact Braze
dashboard build row per story beat: object type, entry/trigger, audience,
property names and types, personalization, placement, re-eligibility, reset,
and proof. Inspect before proposing any change. Do not claim to create objects
unless the available integration has write capability and I approve the diff.
```

### Diagnose A Failed Story

```text
Use lumo-debugging-playbook and lumo-diagnostics-and-tooling. Read the redacted
diagnostic bundle and the pack's notes.md. Identify the first broken link in the
chain from app action to SDK evidence to Braze decision to visible result. Do
not wipe the AVD or app data. Return the evidence, likely cause, safest next
action, and what will prove the fix.
```

### Rehearse And Hand Off

```text
Use lumo-new-demo-campaign for the final rehearsal gate. Verify the approved
story twice using only the Android app, Guided Control Room, and Presenter
Remote. Resolve every pack-validation handoff warning, complete notes.md, prove
each required native message, record the fallback for every risky beat, and
return a concise operator talk track plus a fresh-agent setup prompt.
```

## Definition Of Done

- The approved `DEMO.md` explains one coherent belief and explicit non-goals.
- The app is built from its own evidence and neutral pack, not Lumo styling.
- Every meaningful action has an exact SDK method, wire name, property type,
  Braze consumer, visible result, reset, proof, and fallback.
- Required Content Card and Banner placements match the dashboard exactly.
- IAM and push are proven through the native SDK on the active user.
- Guided `Pack`, `App`, and `Story` checks are ready.
- The two-run rehearsal passes without an app-data or emulator reset.
- `notes.md` lets another SolCon rebuild the dashboard and operate the story.
- Local credentials, screenshots, customer material, and private app code stay
  outside Git.
