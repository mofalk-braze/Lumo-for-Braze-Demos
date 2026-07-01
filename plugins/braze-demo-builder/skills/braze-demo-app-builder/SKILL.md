---
name: braze-demo-app-builder
description: Build or update credible Braze demo app features in the pack-driven SolCon Android/iOS/Web runtime. Use when creating or changing demo packs, screenshot-built product screens, Control Room presets, Braze event stories, Content Card surfaces and placements, IAM triggers, push previews, launch links, native SDK-backed flows, or SolCon demo setup handoffs.
---

# Braze Demo App Builder

Use this skill to build real-feeling Braze demo app features inside this runtime. The goal is a credible product story backed by the mobile SDK, not a static mock or presenter control surface.

## Grounding

Before editing, inspect the relevant committed source of truth:

- `AGENTS.md` for project rules, parity expectations, generated-file boundaries, REST key handling, and validation requirements.
- `demo-packs/README.md` and the active `demo-packs/<pack>/demo-pack.json` for pack schema, Content Card surfaces, assets, events, user metadata, and presets.
- `docs/demo-runtime-architecture.md` for runtime ownership, Control Room boundaries, bridge sync, readiness gates, and diagnostics.
- `web-template/README.md` plus relevant `web-template/src` screens/components for product UI and bridge usage.
- `android-shell/README.md` and Android bridge/activity files when SDK behavior, Android launch, FCM, trust, or packaged assets are in scope.
- `ios-shell/README.md` and iOS bridge/manager/app delegate files when SDK behavior, iOS launch, APNs, signing, or WebView behavior are in scope.
- `demo-studio/README.md` when packaged app install, first-run setup, workspace isolation, `.braze-demo-kit` import/export, or sharing flows are in scope.

Do not route to local `.claude/skills/...` references; those are ignored and are not part of distribution.

## Classify The Work

Choose the smallest credible surface before editing:

- Product UI: app screen, route, component, content state, or screenshot translation.
- Demo pack: brand, content, events, user metadata, presets, assets, and Content Card surfaces.
- Control Room: presenter/operator action, REST trigger, readiness, validation, build/run control, diagnostics, or activity feed.
- Demo Studio: packaged app setup, first-run flow, local workspace isolation, kit import/export, or internal sharing/install docs.
- Native bridge: push, deep/app link, IAM-triggering SDK event, Content Cards, identity, purchases, or SDK attributes.
- Launch-link story: external link or push tap opens a route and logs a native SDK event.

## Boundaries

- Demo packs are the source of truth for public brand/content/demo metadata. Applying a pack generates web runtime config, runtime manifests, synced assets, Android seed metadata, and iOS runtime defaults.
- Do not hand-edit `web-template/src/brand/activeDemoConfig.generated.ts`, `web-template/public/demo-runtime.json`, synced demo assets, Android seed metadata, or iOS runtime defaults.
- The web app renders product UI only. Do not add presenter/demo controls to product screens.
- The Braze Demo Control Room owns setup, orchestration, triggers, staged controls, validation, build/run actions, diagnostics, and activity logs.
- Braze Demo Studio wraps the same Control Room for local desktop use. Electron-only controls must appear inside the Control Room template and hide safely in browser mode.
- Studio imports portable `.braze-demo-kit` bundles into the active workspace's ignored `.demo-packs/<pack-id>/` folder. Do not treat kit bundles as complete runnable environments or a place for secrets.
- Android and iOS shells own real Braze SDK behavior: `changeUser`, SDK custom events, purchases, IAM display, Content Cards, push, notification permission, clicks, and impressions.
- Do not add the Braze Web SDK to `web-template`.
- Keep REST API keys host-only. Do not write them into web assets, native resources, source files, demo packs, or committed files.
- Preserve SDK device identity by default. Treat app-data, simulator, emulator, or SDK storage resets as explicit recovery/testing actions only.
- Keep source URL overrides as visible advanced diagnostics, preferably local development origins unless a deliberate debug escape hatch is added.

## Guided Intake

Before implementation, ask when any required setup input is missing. In Codex, use the native user-question tool when available. In Claude or tools without that mechanism, ask directly and wait.

Required intake for new or materially changed demo stories:

- App/customer concept and intended SolCon audience.
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

## Story Patterns

- Use stable anchor events for portable triggers: `screen_viewed`, `content_viewed`, `content_engaged`, `offer_interaction`, `conversion_completed`, `loyalty_event`, and `preference_updated`.
- Use app-specific flavor events for storytelling, with specific context in properties such as `screen`, `surface`, `route_id`, `merchant_id`, `offer_id`, `action`, `value`, `currency`, or `weight`.
- Do not fake native IAMs in web UI when claiming mobile IAM behavior.
- Do not use REST events to claim on-device IAM triggering. Use SDK custom events for mobile IAM triggers.
- Add reusable app-specific controls as pack `launcher.presets` when the Control Room needs to present them.
- For launch-link stories, parse links in native code, resolve identity first, navigate the web product surface, then log the SDK event exactly once.

## Finish Criteria

Before finishing, run or explicitly justify skipping:

```sh
npm run validate:demo-runtime
npm run security:scan
cd web-template && npm run build
```

When Demo Studio, packaging, install docs, first-run setup, or Electron bridge behavior changed, also run or justify skipping:

```sh
npm run demo:studio:check
npm run demo:studio:pack
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

Report changed subsystems, validation results, skipped checks, platform parity notes, Content Card placements, logo/icon decisions, and any manual Braze dashboard setup still required.
