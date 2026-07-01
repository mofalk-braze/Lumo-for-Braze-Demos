// ---------------------------------------------------------------------------

import { activeAppContent } from './activeDemoConfig.generated'
// Local app content — the app's OWN merchandising. This is what makes the app
// look full and real on its own; it never depends on Braze. Push + IAM are the
// hero Braze channels (layered on top); Content Cards are an optional add-on
// rendered in a designated rail + the inbox.
//
// STANDARDIZED: the content *model* (hero / categories / rails of items) and how
// the Home screen renders it.
// CUSTOMIZED per demo: the actual items, categories, copy, and images — the clone
// skill fills these from the app's screenshots so it matches the real app/industry.
// ---------------------------------------------------------------------------

export interface ContentItem {
  id: string
  title: string
  /** Category or short descriptor. */
  subtitle?: string
  /** e.g. a price "€79", rating "4.8★", duration "3 nights". */
  meta?: string
  /** e.g. "New", "-20%", "Popular". */
  badge?: string
  image?: string
  category?: string
}

export interface ContentRail {
  id: string
  title: string
  items: ContentItem[]
}

export interface HeroCard {
  title: string
  subtitle?: string
  cta?: string
}

export type ContentCardSurfaceType = 'inbox' | 'feed' | 'carousel' | 'hero' | 'account' | 'status'
export type ContentCardVariant = 'hero' | 'carousel' | 'feed' | 'inbox'
export type ContentCardEmptyBehavior = 'hide' | 'empty-state'

export interface ContentCardSurface {
  id: string
  /** Braze dashboard extras.placement value used to route cards into this surface. */
  placement: string
  /** Product surface archetype discovered from screenshots. */
  surface: ContentCardSurfaceType
  /** App screen/route where this surface renders. */
  screen: string
  title: string
  variant: ContentCardVariant
  /** Contextual surfaces normally hide when empty; inbox surfaces can show empty state. */
  emptyBehavior: ContentCardEmptyBehavior
  maxCards?: number
}

export interface PlacementToggleDefaults {
  hero: boolean
  homeFeed: boolean
  inlineModule: boolean
  inboxTab: boolean
  accountPanel: boolean
  compactCards: boolean
}

export interface PlacementPlaygroundContent {
  toggles: PlacementToggleDefaults
}

export interface AppContent {
  hero: HeroCard
  categories: string[]
  rails: ContentRail[]
  /** Braze Content Cards with this placement render as the personalized home
   *  rail (hidden when there are none — so the screen is never empty). */
  contentCardRail: { title: string; placement: string }
  /** Repeatable Content Card surface contract for screenshot-built apps. */
  contentCardSurfaces?: ContentCardSurface[]
  placementPlayground?: PlacementPlaygroundContent
  wolt?: WoltContent
  aktionMensch?: AktionMenschContent
}

export const appContent: AppContent = activeAppContent

const legacyHomeSurface: ContentCardSurface = {
  id: 'home-contextual',
  placement: appContent.contentCardRail.placement,
  surface: 'carousel',
  screen: 'home',
  title: appContent.contentCardRail.title,
  variant: 'carousel',
  emptyBehavior: 'hide',
}

export const inboxContentCardSurface: ContentCardSurface = {
  id: 'inbox',
  placement: 'inbox',
  surface: 'inbox',
  screen: 'inbox',
  title: 'Inbox',
  variant: 'inbox',
  emptyBehavior: 'empty-state',
}

export const contentCardSurfaces: ContentCardSurface[] =
  appContent.contentCardSurfaces?.length ? appContent.contentCardSurfaces : [legacyHomeSurface]

export function contentCardSurfaceForScreen(screen: string): ContentCardSurface | undefined {
  return contentCardSurfaces.find((surface) => surface.screen === screen && surface.surface !== 'inbox')
}

export function contentCardSurfacesForScreen(screen: string): ContentCardSurface[] {
  return contentCardSurfaces.filter((surface) => surface.screen === screen)
}

export function contentCardSurfaceByPlacement(placement: string): ContentCardSurface | undefined {
  return contentCardSurfaces.find((surface) => surface.placement === placement)
}

export interface WoltCategory {
  id: string
  title: string
  image?: string
  tint?: string
}

export interface WoltMerchant {
  id: string
  title: string
  subtitle: string
  image?: string
  logo?: string
  badge?: string
  badgeTone?: 'red' | 'purple'
  extraBadge?: string
  deliveryFee: string
  eta: string
  rating: string
  sponsored?: boolean
  category?: string
  tags?: string[]
  distance?: string
  menu?: WoltMenuSection[]
}

export interface WoltOrder {
  id: string
  merchant: string
  status: string
  date: string
  total: string
  logo?: string
  items: string[]
}

export interface WoltRail {
  id: string
  title: string
  cta?: string
  tone?: 'default' | 'pink'
  merchants: WoltMerchant[]
}

export interface WoltContent {
  assetBase: string
  address: string
  woltPlusCountry: string
  categories: WoltCategory[]
  services: WoltCategory[]
  repeatOrders: WoltMerchant[]
  orders: WoltOrder[]
  favorite: WoltMerchant
  offerRails: WoltRail[]
  featuredRail: WoltRail
  coupons?: WoltCoupon[]
  storyCards?: WoltStoryCard[]
  supermarketDeal: {
    title: string
    subtitle: string
    code: string
  }
  rewards: {
    tier: string
    progressPercent: number
    completed: number
    required: number
    keepUntil: string
  }
}

export interface WoltMenuItem {
  id: string
  title: string
  description: string
  price: number
  image?: string
  badge?: string
}

export interface WoltMenuSection {
  id: string
  title: string
  items: WoltMenuItem[]
}

export interface WoltCoupon {
  id: string
  code: string
  title: string
  description: string
  amount: number
  minimum: number
}

export interface WoltStoryCard {
  id: string
  title: string
  description: string
  placement: string
  cta: string
  targetMerchantId?: string
}

export interface AktionMenschProduct {
  id: string
  name: string
  number: string
  status: string
  source: string
}

export interface AktionMenschHomeCard {
  id: string
  title: string
  subtitle: string
  body?: string
  cta: string
  image?: string
  tone: 'mint' | 'white'
}

export interface AktionMenschDrawRow {
  label: string
  digits: string
}

export interface AktionMenschSettingItem {
  id: string
  label: string
  kind: 'toggle' | 'link'
  description?: string
  defaultOn?: boolean
}

export interface AktionMenschSettingSection {
  label: string
  items: AktionMenschSettingItem[]
}

export interface AktionMenschContent {
  assetBase: string
  drawDate: string
  nextDraw: {
    days: number
    hours: number
    minutes: number
    seconds: number
  }
  products: AktionMenschProduct[]
  homeCards: AktionMenschHomeCard[]
  drawRows: AktionMenschDrawRow[]
  settings: {
    sections: AktionMenschSettingSection[]
    moreLinks: string[]
  }
}
