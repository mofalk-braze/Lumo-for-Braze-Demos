---
name: braze-demo-app-builder
description: Compatibility entry point for implementing an approved Braze demo app feature in the pack-driven SolCon Android/iOS/Web runtime. Use for screenshot-built product screens, pack content, Control Room presets, Braze event stories, Content Card or Banner placements, IAM triggers, push previews, launch links, or native SDK-backed flows after the target belief and story boundary are clear. Route incomplete discovery, Canvas-first mapping, or "now what should I build" work to the canonical braze-solution-demo-campaign project skill first.
---

# Braze Demo App Builder

Use this skill to build real-feeling Braze demo app features inside this runtime. The goal is a credible product story backed by the mobile SDK, not a static mock or presenter control surface.

## Grounding

Before editing, inspect the relevant committed source of truth:

- `AGENTS.md` for project rules, parity expectations, generated-file boundaries, REST key handling, and validation requirements.
- `demo-packs/README.md` and the active committed `demo-packs/<pack>/demo-pack.json` or local `.demo-packs/<pack>/demo-pack.json` for pack schema, Content Card surfaces, assets, events, user metadata, and presets.
- `docs/demo-runtime-architecture.md` for runtime ownership, Control Room boundaries, bridge sync, readiness gates, and diagnostics.
- `web-template/README.md` plus relevant `web-template/src` screens/components for product UI and bridge usage.
- `android-shell/README.md` and Android bridge/activity files when SDK behavior, Android launch, FCM, trust, or packaged assets are in scope.
- `ios-shell/README.md` and iOS bridge/manager/app delegate files when SDK behavior, iOS launch, APNs, signing, or WebView behavior are in scope.

The canonical workflow is committed at
`.claude/skills/braze-demo-app-builder/SKILL.md`. Read it and only the relevant
linked references before editing. This plugin skill is a compatibility entry
point for namespaced command sessions; committed docs and the project skill win
if duplicated guidance drifts.

If the target belief, hero journey, signal/surface contract, and non-goals are
not approved, read
`.claude/skills/braze-solution-demo-campaign/SKILL.md` and shape the blueprint
before implementation. Do not use this compatibility layer as a second story
planning workflow.

## Classify The Work

Choose the smallest credible surface before editing:

- Product UI: app screen, route, component, content state, or screenshot translation.
- Demo pack: brand, content, events, user metadata, presets, assets, and Content Card surfaces.
- Control Room: presenter/operator action, REST trigger, readiness, validation, build/run control, diagnostics, or activity feed.
- Native bridge: push, deep/app link, IAM-triggering SDK event, Content Cards, identity, purchases, or SDK attributes.
- Launch-link story: external link or push tap opens a route and logs a native SDK event.

## Boundaries

- Demo packs are the source of truth for public brand/content/demo metadata. Applying a pack generates web runtime config, runtime manifests, synced assets, Android seed metadata, and iOS runtime defaults.
- `demo-packs/` is for sanitized public packs. New Claude-created, imported, customer, or prospect packs default to ignored `.demo-packs/` unless the user explicitly asks to prepare a sanitized public pack.
- Use `node tools/lumo.mjs pack new` for a new concept; it is neutral and makes
  no channel or story assumptions. Use duplicate only for an explicitly
  requested close variant because it preserves source style and story.
- Private screenshot-built source belongs under the pack's ignored
  `app-source/web-template/src/screens/local-pack/`, exposed by `pack-app.tsx`.
  Do not add a private route, import, screen, asset, or pack id to tracked
  `web-template` source.
- Do not hand-edit `web-template/src/brand/activeDemoConfig.generated.ts`, `web-template/public/demo-runtime.json`, synced demo assets, Android seed metadata, or iOS runtime defaults.
- The web app renders product UI only. Do not add presenter/demo controls to product screens.
- The Braze Demo Control Room owns setup, orchestration, triggers, staged controls, validation, build/run actions, diagnostics, and activity logs.
- Android and iOS shells own real Braze SDK behavior: `changeUser`, SDK custom events, purchases, IAM display, Content Cards, push, notification permission, clicks, and impressions.
- Do not add the Braze Web SDK to `web-template`.
- Keep REST API keys host-only. Do not write them into web assets, native resources, source files, demo packs, or committed files.
- Keep Firebase service account JSON outside Git. Teammates may upload it into their own Braze workspaces for Android push, but it must not be written into source, packs, generated assets, or committed files.
- Preserve SDK device identity by default. Treat app-data, simulator, emulator, or SDK storage resets as explicit recovery/testing actions only.
- Keep source URL overrides as visible advanced diagnostics, preferably local development origins unless a deliberate debug escape hatch is added.

## Guided Intake

Before implementation, use the approved blueprint when available and ask only
for missing details that change reliability. Route unresolved story selection
to `.claude/skills/braze-solution-demo-campaign/SKILL.md` rather than returning
a blank feature checklist.

Required intake for new or materially changed demo stories:

- App/customer concept and intended Lumo/SolCon audience.
- Target platforms: web harness, Android, iOS, or all.
- Source screenshots, product references, or brand assets.
- Logo/app icon PNG availability and fallback if missing.
- Braze story type: Content Cards, IAM, push, purchase, loyalty, lifecycle, REST-triggered campaign/canvas, or launch link.
- Content Card placement intent and expected dashboard `extras.placement` values.
- Required Braze dashboard setup: trigger events, campaign IDs, Canvas IDs, API-trigger properties, push readiness, APNs/FCM prerequisites, or universal/app link host files.

## Content Card Placement

When a request includes Content Cards, do an advisory placement pass before coding:

- Choose one persistent surface when the source app has notifications, messages, inbox, account updates, or the story needs persistence.
- Choose one contextual surface where cards fit naturally into the screenshot content: home feed, recommendation rail, offer carousel, hero module, account, status, or onboarding.
- Default to an inbox-style surface plus one contextual slot. Use only inbox when screenshots do not support a contextual slot. Add a new inbox-like surface only when persistence is central to the story.
- Use `content.contentCardSurfaces` for new screenshot-built apps. `content.contentCardRail` remains legacy compatibility.
- Use `extras.placement` as the canonical Braze routing key. Contextual slots use `emptyBehavior: "hide"`; inbox-like surfaces use `emptyBehavior: "empty-state"`.
- Prefer `ContentCardSlot`, `ContentCardInbox`, and `ContentCardView` from `web-template/src/components`.
- Native Android and iOS own refresh, normalization, clicks, and impressions; the web layer renders normalized data and logs render/click intent through the bridge.

## Banner Placement

- Declare stable exact Braze placement ids in `content.bannerSurfaces` with a
  local id, screen, and optional positive height.
- Mount `NativeBannerSlot` on the declared screen. Browser mode is a layout
  placeholder only; Android and iOS native SDK shells own real Banner refresh,
  mount, unmount, and rendering.
- Record every placement id, dashboard object, audience, test result, and
  fallback in generated `notes.md`.

## Story Patterns

- Use stable anchor events for portable triggers: `screen_viewed`, `content_viewed`, `content_engaged`, `offer_interaction`, `conversion_completed`, `loyalty_event`, and `preference_updated`.
- Use app-specific flavor events for storytelling, with specific context in properties such as `screen`, `surface`, `route_id`, `merchant_id`, `offer_id`, `action`, `value`, `currency`, or `weight`.
- Do not fake native IAMs in web UI when claiming mobile IAM behavior.
- Do not use REST events to claim on-device IAM triggering. Use SDK custom events for mobile IAM triggers.
- Add reusable app-specific controls as pack `launcher.presets` when the Control Room needs to present them.
- Keep the app action, flavor-to-anchor mapping, property types, fallback
  preset, dashboard trigger, and generated `notes.md` on one canonical event
  contract. Use `sdk_event_sequence` when the fallback must mirror both flavor
  and anchor events; never leave an anchor-triggered object with a flavor-only
  fallback.
- For launch-link stories, parse links in native code, resolve identity first, navigate the web product surface, then log the SDK event exactly once.

## Finish Criteria

Before finishing, run or explicitly justify skipping:

```sh
npm run validate:demo-runtime
npm run security:scan
cd web-template && npm run build
```

Run Android checks when Android shell, bridge, manifest, push, app links, SDK commands, launch flow, or generated Android metadata changed:

```sh
cd android-shell
./gradlew :app:compileDebugKotlin
```

Run iOS checks when iOS shell, bridge, `Info.plist`, push, universal links, SDK commands, launch flow, or generated iOS metadata changed:

```sh
cd ios-shell
xcodegen generate
xcodebuild -project BrazeDemoShell.xcodeproj -scheme BrazeDemoShell -sdk iphonesimulator -derivedDataPath ./DerivedData CODE_SIGNING_ALLOWED=NO build
```

Report changed subsystems, validation results, skipped checks, platform parity
notes, Content Card and Banner placements, the canonical app/preset/dashboard
trigger, logo/icon decisions, pack location (`demo-packs/` or `.demo-packs/`),
generated `notes.md`, and any manual Braze dashboard setup still required.
Treat unresolved handoff warnings or `<...>` placeholders as unfinished demo
work even when structural pack validation passes.
