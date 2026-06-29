// ---------------------------------------------------------------------------
// Event & attribute taxonomy — the reliable backbone you learn once.
//
// TWO LAYERS:
//  • Anchor events (below) are FIXED: same names, semantics, and nomenclature in
//    every cloned app. Build your IAM / Content Card / email / SMS / WhatsApp
//    campaigns on these once and they work everywhere. Specificity lives in
//    PROPERTIES, not in new event names.
//  • Flavor events are per-app and live in brandConfig — realistic, app-specific
//    events for storytelling. A flavor event may also emit its mapped anchor so
//    your anchor-based triggers never miss.
//
// You always find what exists via (a) the Braze Demo Control Room and (b) the
// generated EVENT_MAP.md.
// ---------------------------------------------------------------------------

export const AnchorEvents = {
  SCREEN_VIEWED: 'screen_viewed',
  CONTENT_VIEWED: 'content_viewed',
  CONTENT_ENGAGED: 'content_engaged',
  OFFER_INTERACTION: 'offer_interaction',
  CONVERSION_COMPLETED: 'conversion_completed',
  LOYALTY_EVENT: 'loyalty_event',
  PREFERENCE_UPDATED: 'preference_updated',
} as const

export type AnchorEventName = (typeof AnchorEvents)[keyof typeof AnchorEvents]

/** Standardized custom attributes — keep segmentation stories portable across
 *  apps. Add app-specific attributes via brandConfig.demoUser.attributes. */
export const StandardAttributes = {
  LOYALTY_TIER: 'loyalty_tier',
  LOYALTY_POINTS: 'loyalty_points',
  HOME_LOCATION: 'home_location',
  FAVORITE_CATEGORIES: 'favorite_categories',
  LIFECYCLE_STAGE: 'lifecycle_stage',
  LAST_CONVERSION_VALUE: 'last_conversion_value',
} as const

export interface AnchorMeta {
  name: AnchorEventName
  label: string
  /** What fires it in a real app. */
  firesWhen: string
  /** Property keys this anchor carries. */
  properties: string[]
  /** A representative payload the Control Room sends. */
  sample: Record<string, unknown>
}

/** Metadata that drives Control Room presets and EVENT_MAP.md generation. */
export const ANCHOR_CATALOG: AnchorMeta[] = [
  {
    name: AnchorEvents.SCREEN_VIEWED,
    label: 'Screen viewed',
    firesWhen: 'Any screen / tab opens',
    properties: ['screen', 'section'],
    sample: { screen: 'home', section: 'main' },
  },
  {
    name: AnchorEvents.CONTENT_VIEWED,
    label: 'Content viewed',
    firesWhen: 'Opens an item / product / article detail',
    properties: ['id', 'name', 'category', 'type', 'price'],
    sample: { id: 'sku_1042', name: 'Wireless Earbuds', category: 'electronics', type: 'product', price: 79.0 },
  },
  {
    name: AnchorEvents.CONTENT_ENGAGED,
    label: 'Content engaged',
    firesWhen: 'Saves / favorites / adds-to-cart / plays / shares',
    properties: ['id', 'name', 'action'],
    sample: { id: 'sku_1042', name: 'Wireless Earbuds', action: 'add_to_cart' },
  },
  {
    name: AnchorEvents.OFFER_INTERACTION,
    label: 'Offer interaction',
    firesWhen: 'Views / taps / redeems / dismisses a promo or coupon',
    properties: ['offer_id', 'offer_name', 'surface', 'action'],
    sample: { offer_id: 'promo_welcome', offer_name: 'Welcome bonus', surface: 'home_hero', action: 'redeemed' },
  },
  {
    name: AnchorEvents.CONVERSION_COMPLETED,
    label: 'Conversion completed',
    firesWhen: 'Completes the primary goal (purchase / booking / signup / redemption)',
    properties: ['type', 'value', 'currency', 'item_count'],
    sample: { type: 'purchase', value: 79.0, currency: 'EUR', item_count: 1 },
  },
  {
    name: AnchorEvents.LOYALTY_EVENT,
    label: 'Loyalty event',
    firesWhen: 'Earns / redeems points or changes tier',
    properties: ['action', 'amount', 'balance', 'tier', 'reward'],
    sample: { action: 'redeem', amount: 150, balance: 350, reward: '€5 voucher' },
  },
  {
    name: AnchorEvents.PREFERENCE_UPDATED,
    label: 'Preference updated',
    firesWhen: 'Changes a setting / preference / consent',
    properties: ['key', 'value'],
    sample: { key: 'category_optin', value: 'electronics' },
  },
]
