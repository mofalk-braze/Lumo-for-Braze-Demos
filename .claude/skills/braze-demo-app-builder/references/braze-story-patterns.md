# Braze Story Patterns

Use this when a request includes events, campaigns, IAMs, Content Cards, push, loyalty, offers, lifecycle, or "demo story" language.

## Event Model

Use stable anchor events for portable campaign triggers:

- `screen_viewed`
- `content_viewed`
- `content_engaged`
- `offer_interaction`
- `conversion_completed`
- `loyalty_event`
- `preference_updated`

Use flavor events for app-specific storytelling, and map them to anchors when useful. Keep specificity in properties such as `screen`, `surface`, `route_id`, `weight`, `merchant_id`, `offer_id`, `action`, `value`, or `currency`.

## Story Types

- Content Cards: native SDK fetches cards, web renders normalized card data by placement.
- IAM trigger: native SDK logs a custom event; Braze campaign targets the mobile app/user and displays the IAM natively.
- Push preview: Control Room can show a foreground push-style banner, but real push requires native push configuration.
- Offer story: Content Card or screen action logs `offer_interaction` with `surface` and `action`.
- Loyalty story: app action logs `loyalty_event` and updates visible user attributes when appropriate.
- Delivery/safety story: route/package screen logs a specific event such as `next_delivery_heavy_package` with properties like `weight`, `route_id`, and `stop_number`.

## Credibility Rules

- Do not fake native IAMs in web UI when claiming mobile IAM behavior.
- Do not use REST events to claim on-device IAM triggering. Use SDK custom events for on-device IAM triggers.
- Keep events centralized through existing bridge/provider helpers.
- Add Control Room presets for presenter actions, not product-only buttons.
- Include sample payloads in presets so the live demo is repeatable.

## Pack Presets

When adding reusable controls, prefer pack `launcher.presets` for app-specific stories. Use built-in Control Room presets for generic actions.

Each preset should have:

- clear `id`, `label`, and `description`
- correct `type` and transport/platform
- payload with realistic event or trigger properties
- no secrets
