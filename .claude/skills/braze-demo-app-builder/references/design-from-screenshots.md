# Design From Screenshots

Use this when screenshots, brand references, or a named app/product style drive the requested screen.

## Extract Before Building

From each screenshot, identify:

- primary job of the screen
- navigation model and persistent chrome
- density, spacing, list/card rhythm, and touch target size
- typography scale and hierarchy
- color roles, not just raw colors
- imagery/icon style
- empty, loading, error, and post-action states
- real content fields that make the screen credible

## Product UI Standards

- Build the actual usable screen first, not a landing page.
- Match the existing app's component patterns and routing.
- Use controls a real user would expect: tabs for views, toggles for binary choices, inputs for values, icon buttons for tools, menus for option sets.
- Keep repeated item cards compact with stable dimensions.
- Do not put demo explanations, keyboard shortcuts, or presenter instructions in the product UI.
- Do not put Control Room actions in product UI unless the requested app concept genuinely includes an operator/admin surface.

## Screenshot Translation

- Preserve information hierarchy over pixel copying.
- Use real-ish domain data, not lorem ipsum.
- If screenshots conflict with existing runtime patterns, keep runtime patterns and adapt the visual treatment.
- If brand assets are unavailable, use pack assets or generate/sync assets through the pack workflow.
- For customer-like examples, prefer fictional/local-only data unless the user explicitly supplies approved assets.
- Extract the source product's own color roles, typography, density, chrome,
  and interaction model. Do not begin from the Lumo reference pack's visual
  system and reskin it.
- Put private screenshot-built code under the ignored pack's
  `app-source/web-template/src/screens/local-pack/`, with `pack-app.tsx` as the
  adapter. Put its images under the same pack's `assets/`. Never add a private
  screen, route, import, pack id, or asset to tracked `web-template` source.

## Frontend Checks

- Run `cd web-template && npm run build`.
- Use browser rendering checks when layout risk is high.
- Check mobile viewport fit, bottom nav/system bar overlap, scroll containers, and long text.
- Verify no product text overlaps or gets clipped.
