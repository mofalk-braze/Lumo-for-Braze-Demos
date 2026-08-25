---
name: braze-demo-app-builder
description: Expert implementation manual for bounded, approved Braze demo app features in the pack-driven Android/iOS/Web runtime. Invoke manually for product screens, event stories, messaging surfaces, launch links, or native SDK-backed flows, or read it when lumo-new-demo-campaign delegates that implementation. It does not select the story or orchestrate an end-to-end campaign.
disable-model-invocation: true
metadata:
  short-description: Build credible Braze demo app features
---

# Braze Demo App Builder

This is the expert implementation layer beneath `lumo-new-demo-campaign`. Use
it to build a bounded approved feature inside this runtime, not to select a
story or orchestrate a full campaign. Manual invocation remains supported.
The goal is a credible Braze story, not a static mock or presenter surface.

## First Pass

Before editing, inspect:

- `AGENTS.md` for binding project rules and parity expectations
- active demo pack and `demo-packs/README.md`
- `docs/demo-runtime-architecture.md`
- relevant `web-template/src` screens/components
- Control Room presets in `tools/demo-launcher.mjs` and pack `launcher.presets`
- native bridge files only if the story needs Android/iOS SDK behavior
- the approved local `.demo-packs/<id>/DEMO.md`, when present, for target
  belief, hero journey, exact signal/surface contract, and non-goals

If those story decisions are not approved, stop and route to
`braze-solution-demo-campaign`. If they are approved but this skill was selected
automatically rather than invoked manually or read by `lumo-new-demo-campaign`,
return orchestration to `lumo-new-demo-campaign` before editing.

Classify the request before choosing files:

- product UI: app screen, route, component, content state
- demo pack: brand/content/events/user/presets/assets
- Control Room: presenter/operator action, REST trigger, build/run control
- native bridge: push, deep/app link, IAM-triggering SDK event, Content Cards, identity
- launch-link story: external link or push tap opens route and logs a native SDK event

## Boundaries

- Demo packs are the source of truth for public brand/content/demo metadata.
- Preserve `configHash` as the public configuration fingerprint and
  `runtimeHash` v2 as the active configuration-plus-assets-plus-private-surface
  deployment identity. Require rendered-source agreement for native readiness.
- New agent-created, imported, customer, or prospect packs belong in ignored
  `.demo-packs/`; only explicitly sanitized public packs belong in
  `demo-packs/`.
- Use `node tools/lumo.mjs pack new` for a new product concept. It is neutral
  and makes no channel or story assumptions. Use `pack duplicate` only for an
  explicitly requested close variant because it preserves the source style,
  story, events, placements, assets, and app surface.
- Screenshot-built or otherwise private product code belongs under the pack's
  ignored `app-source/web-template/src/screens/local-pack/`, exposed only by
  `pack-app.tsx`. Do not add customer/private routes, imports, ids, or screens
  to tracked `web-template/src`.
- The web app renders product UI. Do not add normal presenter controls to product screens.
- Control Room owns setup, orchestration, triggers, staged controls, validation, and activity logs.
- Android and iOS own real Braze SDK behavior: push, IAM display, Content Cards, custom events, purchases, and `changeUser`.
- Do not add the Braze Web SDK to `web-template`.
- Keep REST keys host-only. Do not commit credentials or place them in pack
  JSON, web assets, or native resources. Use ignored `secrets.properties`,
  native local config, Control Room session entry, or environment variables.
- Declare Braze Banner placements in `content.bannerSurfaces` with stable exact
  placement ids. Mount `NativeBannerSlot` on the declared screen; browser mode
  is layout preview only and Android/iOS native shells own real rendering.

## Reference Routing

- For runtime ownership and expected files, read [references/runtime-architecture.md](references/runtime-architecture.md).
- For screenshot-based UI work, read [references/design-from-screenshots.md](references/design-from-screenshots.md).
- For event names, properties, presets, Content Cards, IAMs, loyalty, offers, or delivery/safety stories, read [references/braze-story-patterns.md](references/braze-story-patterns.md).
- For push/deep link/universal link flows, read [references/launch-links.md](references/launch-links.md).
- Before finishing, read [references/qa-checklist.md](references/qa-checklist.md).

## Default Workflow

1. Ground in the repo first. Do not ask where files live if inspection can answer it.
2. Decide the minimum credible feature surface: product UI, pack data, Control Room preset, native bridge, or a combination. Route unresolved story selection to `braze-solution-demo-campaign` instead of returning a blank feature checklist.
3. Preserve existing runtime patterns and generated-file boundaries. Do not hand-edit generated active config files.
4. Build real product flows from screenshots or story goals. Avoid landing pages, fake dashboards, or demo-only buttons in the app.
5. Use stable Braze anchors and app-specific flavor events. Put specificity in
   event properties. Make the app action, flavor-to-anchor mapping, fallback
   preset, dashboard trigger, and `notes.md` agree on one canonical event. If
   an app action emits both flavor and anchor, use `sdk_event_sequence` when
   the fallback must mirror both, or make the preset emit the dashboard event.
6. If the demo claim depends on mobile SDK behavior, wire the native SDK path instead of faking it in web UI.
7. Validate with the checks in the QA reference and report exactly what passed or could not be run.
8. Complete the generated pack `notes.md` with Content Card, Banner, IAM, push,
   dashboard-object, proof, and fallback mappings before handoff.
   Treat unresolved handoff warnings or `<...>` placeholders as unfinished
   demo work even when structural pack validation passes.

## Common Prompt Interpretations

- "Add a screen for this story" means create a product screen plus any pack/events/presets needed to demo it.
- "Make this look like the screenshots" means extract layout, density, navigation, typography, state, and brand cues before coding.
- "Demo push to IAM" means link or push opens the app, native resolves identity, native logs a custom event, and the mobile IAM triggers from that event.
- "Set up a new app/customer concept" belongs to
  `lumo-new-demo-campaign`; this skill implements only the bounded build work
  that campaign delegates.
