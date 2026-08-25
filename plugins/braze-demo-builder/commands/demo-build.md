---
description: Guided Braze demo app build with SolCon setup questions, Content Card placement advice, platform parity checks, and final handoff.
argument-hint: [demo goal, pack id, screenshots, or story notes]
allowed-tools: Read, Write, Edit, MultiEdit, Glob, Grep, Bash(git:*), Bash(rg:*), Bash(find:*), Bash(sed:*), Bash(wc:*), Bash(test:*), Bash(node:*), Bash(npm:*), Bash(xcodegen:*), Bash(xcodebuild:*), Bash(./gradlew:*)
---

Use the Braze Demo App Builder workflow to build or update a credible Braze demo app story for this repository.

User request and arguments:

```text
$ARGUMENTS
```

## 1. Ground In The Repo First

Before asking where anything lives, inspect the project sources that define current reality:

- `AGENTS.md`
- `demo-packs/README.md`
- `docs/demo-runtime-architecture.md`
- `web-template/README.md`
- `android-shell/README.md`
- `ios-shell/README.md`
- the active or requested `demo-packs/<pack>/demo-pack.json` or `.demo-packs/<pack>/demo-pack.json`
- relevant `web-template/src` screens/components
- `tools/demo-launcher.mjs` and pack `launcher.presets` when Control Room behavior is involved
- Android/iOS bridge files only when SDK behavior, push, IAM, launch links, purchases, Content Cards, or identity are involved

Read the committed canonical workflow at
`.claude/skills/braze-demo-app-builder/SKILL.md` and only the references it
routes for this task. Treat committed docs and code as source of truth if any
guidance conflicts.

## 2. Classify The Request

Classify the work before editing:

- product UI
- demo pack
- Control Room
- native bridge
- launch-link story
- documentation/setup only

State the classification and the minimal credible implementation surface.

Before continuing, confirm the target belief, hero journey, exact
signal/surface contract, and non-goals are approved. If they are not, read
`.claude/skills/braze-solution-demo-campaign/SKILL.md`, shape the blueprint,
and wait for approval. This command implements the approved story; it does not
duplicate the solution-campaign workflow.

## 3. Ask Required Setup Questions

Use the approved blueprint when present and ask only for missing inputs that
change implementation reliability. In Codex, use the native user-question
mechanism when it is available. In Claude or environments without that
mechanism, ask directly. Do not make a novice choose features from a blank
checklist; unresolved story selection belongs in the solution campaign.

Required inputs:

- app/customer concept and target SolCon story
- target platforms: web harness, Android, iOS, or all
- screenshots, product references, or brand assets
- logo/app icon PNG status and fallback if missing
- Braze story type: Content Cards, Banners, IAM, push, purchase, loyalty,
  lifecycle, REST-triggered campaign/canvas, or launch link
- Content Card placement intent and expected `extras.placement` values
- Braze dashboard setup needs: trigger events, campaign IDs, Canvas IDs, API-trigger properties, push readiness, APNs/FCM prerequisites, or universal/app link host files

Make reasonable defaults only for low-risk details. Do not invent a logo asset, dashboard ID, Content Card placement, source screenshot interpretation, or push/IAM claim when the missing answer changes demo reliability.

## 4. Content Card Advisory Pass

When Content Cards are in scope, recommend placements before coding:

- persistent surface: inbox, notifications, messages, account updates, or none
- contextual surface: home feed, recommendation rail, offer carousel, hero, account, status, onboarding, or none
- exact `extras.placement` values
- `content.contentCardSurfaces` entries to add or change
- variant: `inbox`, `feed`, `carousel`, or `hero`
- empty behavior: `empty-state` for inbox-like surfaces, `hide` for contextual slots
- one alternative not chosen and why

Use real SDK Content Cards in shell builds. Browser fixtures are layout-only.

## 5. Implementation Rules

- Demo packs are source of truth; generated runtime files are not hand-edited.
- Use `node tools/lumo.mjs pack new` for a new concept. It starts neutral with
  no assumed story or Braze channel. Use duplicate only for an explicitly
  requested close variant because it preserves source style and story.
- Product UI stays product-focused. Presenter/operator controls belong in the Control Room.
- New Claude-created, imported, customer, or prospect packs belong in ignored `.demo-packs/` unless the user explicitly asks for a sanitized public pack under `demo-packs/`.
- Put private screenshot-built code under the pack's
  `app-source/web-template/src/screens/local-pack/`, exposed by `pack-app.tsx`;
  never hardcode a private route, import, screen, pack id, or asset in tracked
  `web-template` source.
- Native shells own `changeUser`, events, purchases, push, IAM display, Content Cards, clicks, and impressions.
- REST API keys stay host-only and must not be written into committed files or generated web/native assets.
- Firebase service account JSON stays outside Git. It may be uploaded manually into a teammate's own Braze workspace for Android push, but must not be committed or generated into app assets.
- Preserve Android/iOS parity for pack application, runtime generation, asset packaging, launch flows, SDK bridge behavior, and Control Room controls. If parity is not applicable, document why.
- Source URL overrides are advanced diagnostics and should remain visible when active.
- Declare Banners through `content.bannerSurfaces`, mount `NativeBannerSlot` on
  the mapped screen, and treat browser output as layout preview only.
- Make the app action, flavor-to-anchor mapping, typed properties, fallback
  preset, dashboard trigger, and `notes.md` agree on one canonical event. Use
  `sdk_event_sequence` when a fallback must mirror both flavor and anchor
  events.

## 6. Validation And Handoff

Run or explicitly justify skipping:

```sh
npm run validate:demo-runtime
npm run security:scan
cd web-template && npm run build
```

Also run platform checks when relevant:

- Android shell/bridge/launch/SDK changes: `cd android-shell && ./gradlew :app:compileDebugKotlin`
- iOS shell/bridge/launch/SDK changes: `cd ios-shell && xcodegen generate && xcodebuild -project BrazeDemoShell.xcodeproj -scheme BrazeDemoShell -sdk iphonesimulator -derivedDataPath ./DerivedData CODE_SIGNING_ALLOWED=NO build`

Final response must include:

- changed subsystems
- validation commands and results
- skipped checks and reasons
- platform parity notes
- Content Card placements and Braze dashboard `extras.placement` values
- Banner screens and exact Braze placement ids
- logo/app icon decisions
- pack location (`demo-packs/` or `.demo-packs/`)
- remaining manual Braze dashboard setup
- unresolved `notes.md` placeholders or mapping-drift warnings; a structural
  pack PASS is not demo-ready while these remain
- any required SolCon operator notes
- generated pack `notes.md` with Content Card, Banner, IAM, push, proof, and
  fallback mappings
