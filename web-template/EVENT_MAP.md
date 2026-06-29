# Event Map — Lumo Rewards (demo brand)

> Auto-generated per app by the clone skill. This is your pre-demo cheat sheet:
> what each event is, where it fires in the UI, its properties, and how to
> trigger it. **Build reusable campaigns on the anchor events** — they are
> identical in every cloned app.

## Anchor events (fixed in every app)

| Event | Where it fires in this app | Properties | Trigger via |
|---|---|---|---|
| `screen_viewed` | On entering Home / Inbox / Account | `screen`, `section` | Naturally on nav, or Control Room |
| `content_viewed` | Tapping a category chip (Home) | `id?`, `name`, `category?`, `type`, `price?` | Category chip, or Control Room |
| `content_engaged` | (via flavor) wishlist add | `id`, `name`, `action` | Flavor event, or Control Room |
| `offer_interaction` | Tapping any Content Card (hero/carousel/feed/inbox) | `offer_id`, `offer_name`, `surface`, `action` | Tap a card, or Control Room |
| `conversion_completed` | — (wire to checkout in a fuller build) | `type`, `value`, `currency`, `item_count` | Control Room |
| `loyalty_event` | Account → "Redeem 150 pts" | `action`, `amount`, `balance`, `reward` | Redeem button, or Control Room |
| `preference_updated` | Account → push toggle | `key`, `value` | Toggle, or Control Room |

## Standard attributes (set on the demo user at launch)

| Attribute | Value |
|---|---|
| `loyalty_tier` | `gold` |
| `loyalty_points` | `450` (decrements on redeem) |
| `home_location` | `Berlin` |
| `favorite_categories` | `["electronics","travel"]` |
| `lifecycle_stage` | `active` |
| `last_conversion_value` | `79.00` |
| `push_opt_in` | set when the Account toggle is used |

## Flavor events (Lumo-specific, for storytelling)

| Event | Rolls up to | Also emits anchor? | Where |
|---|---|---|---|
| `search_performed` | `content_viewed` | no | Control Room (search UI TBD) |
| `wishlist_added` | `content_engaged` | yes | Control Room |
| `reward_unlocked` | `loyalty_event` | yes | Control Room |

## Suggested reusable campaigns (built on anchors)

- **Abandoned browse** → entry: `content_viewed`, no `conversion_completed` in 24h.
- **Cart recovery** → entry: `content_engaged{action:add_to_cart}`, no conversion.
- **Points-expiry nudge** → segment on `loyalty_points`, Content Card to Inbox.
- **Welcome push** → entry: first `screen_viewed`, channel: push.
- **Redemption receipt** → entry: `loyalty_event{action:redeem}`, push + email/SMS.
