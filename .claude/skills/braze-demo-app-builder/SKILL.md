---
name: braze-demo-app-builder
description: Build credible Braze demo app features in the pack-driven Android/iOS/Web runtime. Use when creating or updating demo packs, product screens from screenshots, Control Room presets, Braze event stories, Content Cards, Banners, IAM triggers, push previews, launch links, or native SDK-backed demo flows.
metadata:
  short-description: Build credible Braze demo app features
---

# Braze Demo App Builder

Use this skill to build real-feeling demo app features inside this runtime. The goal is a credible Braze story, not a static mock or presenter control surface.

## First Pass

Before editing, inspect:

- `AGENTS.md` for binding project rules and parity expectations
- active demo pack and `demo-packs/README.md`
- `docs/demo-runtime-architecture.md`
- relevant `web-template/src` screens/components
- Control Room presets in `tools/demo-launcher.mjs` and pack `launcher.presets`
- native bridge files only if the story needs Android/iOS SDK behavior

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
2. Decide the minimum credible feature surface: product UI, pack data, Control Room preset, native bridge, or a combination.
3. Preserve existing runtime patterns and generated-file boundaries. Do not hand-edit generated active config files.
4. Build real product flows from screenshots or story goals. Avoid landing pages, fake dashboards, or demo-only buttons in the app.
5. Use stable Braze anchors and app-specific flavor events. Put specificity in event properties.
6. If the demo claim depends on mobile SDK behavior, wire the native SDK path instead of faking it in web UI.
7. Validate with the checks in the QA reference and report exactly what passed or could not be run.
8. Complete the generated pack `notes.md` with Content Card, Banner, IAM, push,
   dashboard-object, proof, and fallback mappings before handoff.

## Common Prompt Interpretations

- "Add a screen for this story" means create a product screen plus any pack/events/presets needed to demo it.
- "Make this look like the screenshots" means extract layout, density, navigation, typography, state, and brand cues before coding.
- "Demo push to IAM" means link or push opens the app, native resolves identity, native logs a custom event, and the mobile IAM triggers from that event.
- "Set up a new app/customer concept" means create or update a demo pack, assets, content, standard events, launcher presets, and validation notes.
