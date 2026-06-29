# Braze Demo Web Template

Brand-agnostic React render surface for demo packs. The active pack is generated
from `demo-packs/<pack>/demo-pack.json`; do not edit
`src/brand/activeDemoConfig.generated.ts` by hand.

## Run

```sh
npm install
npm run dev
```

Vite serves `http://localhost:5173`. In a browser, the app renders in a phone
frame with harness fixtures. There are no browser-side controls and no normal
browser setup flow; use the Braze Demo Control Room for all setup and actions:

```sh
cd ..
npm run demo:launcher
```

## Runtime Files

- `src/brand/activeDemoConfig.generated.ts`: active brand/content/runtime config.
- `public/demo-runtime.json`: active runtime manifest copied into `dist`.
- `public/demo-assets/<pack-id>/`: synced demo-pack assets.

## Bridge Contract

`src/braze/bridge.ts` is the single native/web seam. Native shells send
connection diagnostics that include runtime id, config hash, source URL, and
whether an explicit source override is active. Browser harness mode reports the
same generated runtime manifest for render-only checks.

Content Cards are routed by the normalized `extras.placement` value. New app
surfaces should declare `content.contentCardSurfaces` in the active demo pack and
render them with `ContentCardSlot` or `ContentCardInbox`. Contextual slots hide
when no real cards exist; inbox-style slots may show an empty state. The native
SDK remains the source of truth, while the web layer logs impressions when cards
render and clicks before local URL/deeplink handling.

## Control Boundary

The browser renders the demo. The Control Room owns demo selection, workspace
and user setup, event presets, Wolt flows, push/IAM/Content Card orchestration,
REST triggers, validation, builds, and the live ledger.

New demo app UI should not include presenter/demo controls. If a product UI
contains a real user-switching affordance, call `useBraze().changeUser(id)` so
the native App SDK captures the identity change in shell builds. Keep all
non-product demo actions in the Braze Demo Control Room.
