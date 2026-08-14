# Runtime Architecture

Use this when deciding where a Braze demo feature belongs.

## Ownership Model

- `demo-packs/<pack>/demo-pack.json` is the public source of truth for app concept, brand, content, demo user, flavor events, and pack presets.
- Applying a pack generates web config, public runtime manifest, synced assets, Android seed metadata, and iOS runtime defaults.
- `web-template` renders the product app. It may include real user-facing affordances such as login/profile/user switching only if those belong in the product story.
- Control Room owns demo operation: pack selection, setup, build/run, SDK commands, REST triggers, staged controls, diagnostics, and activity feed.
- Android and iOS shells own the native Braze SDK. They perform real `changeUser`, SDK custom events, purchases, Content Cards, IAM display, push, and notification permission flows.

## Generated Boundaries

- Do not hand-edit `web-template/src/brand/activeDemoConfig.generated.ts`.
- Do not hand-edit `web-template/public/demo-runtime.json` except through existing pack application utilities.
- Demo secrets stay out of generated web assets.
- Runtime id/runtimeHash must match across browser, Android, iOS, Control Room,
  and Presenter Remote. Android readiness also needs correlated canonical
  rendered-source evidence; a visible diagnostics-only override never counts
  as rehearsal or handoff readiness.

## Bridge Rules

- Web talks through `web-template/src/braze/bridge.ts` and `BrazeBridgeProvider`.
- Identity sync uses `braze-demo-sync/v1` metadata. Preserve `sessionId`,
  `runtimeId`, `configHash`, `runtimeHash`, `authority`, `reason`, and
  `timestamp`.
- Browser-origin identity requests must flow through the shared bridge/provider path.
- Trim external IDs; never lowercase them.
- If a story needs mobile behavior, execute it through Android/iOS SDK commands or native link handling.

## File Selection Heuristics

- Product screen: `web-template/src/screens`, shared components, pack content/assets.
- Event/story controls: pack `launcher.presets` or Control Room built-ins.
- Native push/link/IAM behavior: Android manifest/activity/bridge and iOS plist/app delegate/web controller/manager.
- Runtime validation: `tools/validate-demo-runtime.mjs`.
