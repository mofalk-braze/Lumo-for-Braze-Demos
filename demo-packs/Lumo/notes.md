# Demo pack handoff

This file travels with the pack. Keep dashboard dependencies and rehearsal evidence here; never add API keys, tokens, service-account content, or other credential values.

## Pack identity

- Pack id: `lumo-default`
- Display name: Lumo
- Demo user external id: `lumo-demo-user`
- Owner: `<OWNER>`
- Last rehearsed: `<YYYY-MM-DD>`

## Braze dashboard mappings

### Content Cards

Create the card campaign or Canvas in Braze and add the exact key/value pair shown below. Placement matching is case-sensitive.

| App surface | Screen | Dashboard key/value | Render variant |
| --- | --- | --- | --- |
| `home-feed` | `home` | `extras.placement=home_feed` | `carousel` |
| `lumo-inbox` | `inbox` | `extras.placement=inbox` | `inbox` |

- Campaign or Canvas: `<CONTENT_CARD_CAMPAIGN_OR_CANVAS>`
- Audience or segment: `<CONTENT_CARD_AUDIENCE>`
- Test result: `<CONTENT_CARD_TEST_RESULT>`

### Banners

Create each Banner placement in Braze with the exact placement ID below. The native SDK owns rendering; the web app only declares the on-screen slot.

| App surface | Screen | Braze placement ID | Slot height |
| --- | --- | --- | --- |
| `lumo-home-banner` | `home` | `home_banner` | 96 px |

- Campaign or Canvas: `<BANNER_CAMPAIGN_OR_CANVAS>`
- Audience or segment: `<BANNER_AUDIENCE>`
- Test result: `<BANNER_TEST_RESULT>`

### In-app messages

| Story step | Dashboard delivery | Trigger event | App/Control Room action |
| --- | --- | --- | --- |
| Default IAM test | Action-based campaign | `demo_iam_trigger` | Control Room → Trigger IAM |
| Onboarding completed | Action-based campaign | `onboarding_completed` | App action or matching Control Room preset |
| Feature explored | Action-based campaign | `feature_explored` | App action or matching Control Room preset |
| Offer saved | Action-based campaign | `offer_saved` | App action or matching Control Room preset |

- Campaign or Canvas: `<IAM_CAMPAIGN_OR_CANVAS>`
- Re-eligibility or cooldown notes: `<IAM_REELIGIBILITY_NOTES>`
- Test result: `<IAM_TEST_RESULT>`

### Push

| Dashboard dependency | Mapping for this pack |
| --- | --- |
| Campaign or Canvas | `<PUSH_CAMPAIGN_OR_CANVAS>` |
| Recipient | External id `lumo-demo-user` on the active emulator install |
| Android app | Upload the approved Firebase service-account credential to the matching Braze Android Push settings outside Git. |
| Deep link or action | `<PUSH_DEEP_LINK_OR_ACTION>` |
| Test result | `<PUSH_TEST_RESULT>` |

Run Push readiness in the Control Room immediately before sending. Never copy an FCM registration token from another machine or install.

## Presenter sequence

1. `<OPENING_STATE>`
2. `<ACTION_AND_EXPECTED_IAM_OR_CONTENT_CARD>`
3. `<BANNER_OR_PUSH_PROOF>`
4. `<FALLBACK_IF_NETWORK_OR_DASHBOARD_IS_UNAVAILABLE>`

## Local-only setup

- SDK key, SDK endpoint, REST endpoint, demo identity override, and FCM sender id belong in ignored `secrets.properties` using documented key names only.
- The Braze REST API key stays in Control Room session memory or `BRAZE_REST_API_KEY_<PACK_ID>`; do not put it in this file or in the pack JSON.
- Firebase service-account files remain outside the repository and are handed off through an approved secret-sharing channel.

## Acceptance checklist

- [ ] Pack validates and applies with matching configHash/runtimeHash.
- [ ] Every Content Card appears only in its mapped placement.
- [ ] Every declared Banner placement renders on the expected screen.
- [ ] IAM triggers once in the rehearsed state and is re-eligible when expected.
- [ ] Android push readiness is green and a real push is received/tapped.
- [ ] Presenter sequence and offline fallback have both been rehearsed.
