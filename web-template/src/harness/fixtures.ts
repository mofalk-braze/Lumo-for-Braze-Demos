import type { NormalizedCard } from '../braze/bridge'
import { activeAppContent, activeDemoPackId } from '../brand/activeDemoConfig.generated'

// ---------------------------------------------------------------------------
// Layout fixtures — DEV ONLY.
//
// Static placeholder Content Cards so the CC surfaces render while building the
// UI in a plain browser. The app's *baseline* content is local (see
// brand/content.ts) and always shows; these fixtures only populate the optional
// Content Card surfaces (the home "Recommended" rail + the inbox). Never used in
// a demo — the shell shows only real Content Cards from Braze.
//
// `placement` routes a card: home_feed (recommended rail) | inbox.
// ---------------------------------------------------------------------------

const defaultCards: NormalizedCard[] = [
  {
    id: 'fx_rec_1',
    title: 'Because you viewed earbuds',
    description: 'Save 15% on audio this week.',
    placement: 'home_feed',
    extras: { placement: 'home_feed', offer_id: 'rec_audio' },
  },
  {
    id: 'fx_rec_2',
    title: 'Members-only: free shipping',
    description: 'On orders over €25, just for you.',
    placement: 'home_feed',
    extras: { placement: 'home_feed', offer_id: 'rec_freeship' },
  },
  {
    id: 'fx_inbox_1',
    title: 'Your points are about to expire',
    description: '120 points expire in 7 days. Redeem them before they’re gone.',
    placement: 'inbox',
    extras: { placement: 'inbox' },
  },
  {
    id: 'fx_inbox_2',
    title: 'New: pay with points at checkout',
    description: 'You can now use points to cover part of any order.',
    placement: 'inbox',
    extras: { placement: 'inbox' },
  },
]

const woltCards: NormalizedCard[] = [
  {
    id: 'wolt_fx_offer_1',
    title: 'Heute nochmal Thai?',
    description: '20% Rabatt bei Preeda - Modern Thai. Nur fuer dich in Berlin.',
    imageUrl: '/demo-assets/wolt-food-delivery/public/merchant-food.jpg',
    placement: 'wolt_home_offer',
    extras: {
      placement: 'wolt_home_offer',
      offer_id: 'preeda_20',
      merchant_id: 'preeda',
      cta: 'Ansehen',
    },
  },
  {
    id: 'wolt_fx_offer_2',
    title: '10 EUR Rabatt auf deinen Einkauf',
    description: 'Code DEDEAL10 ab 25 EUR Bestellwert bei Wolt Market.',
    imageUrl: '/demo-assets/wolt-food-delivery/public/wolt-market.jpg',
    placement: 'wolt_home_offer',
    extras: {
      placement: 'wolt_home_offer',
      offer_id: 'dedeal10',
      merchant_id: 'wolt-market-cheese',
      cta: 'Einloesen',
    },
  },
  {
    id: 'wolt_fx_inbox_1',
    title: 'Nur noch eine Bestellung bis Champion bleibt',
    description: 'Bestelle vor dem 31.07.26, um dein aktuelles Level zu halten.',
    imageUrl: '/demo-assets/wolt-food-delivery/crops/rewards-champion.png',
    placement: 'notifications',
    extras: {
      placement: 'notifications',
      offer_id: 'champion_keep',
      cta: 'Level ansehen',
    },
  },
  {
    id: 'wolt_fx_inbox_2',
    title: 'Dein Gutschein wartet',
    description: 'DEDEAL10 wurde fuer deinen naechsten Einkauf vorgemerkt.',
    imageUrl: '/demo-assets/wolt-food-delivery/public/wolt-marketplace.jpeg',
    placement: 'notifications',
    extras: {
      placement: 'notifications',
      offer_id: 'dedeal10',
      cta: 'Zum Warenkorb',
    },
  },
]

const aktionMenschCards: NormalizedCard[] = [
  {
    id: 'aktion_fx_home_1',
    title: 'Extra-Chance wartet',
    description: 'Sichere dir zusätzliche Chancen für die nächste Ziehung.',
    imageUrl: '/demo-assets/aktion-mensch/winner-service.webp',
    placement: 'aktion_home_offer',
    extras: {
      placement: 'aktion_home_offer',
      offer_id: 'extra_chance_2026',
      cta: 'Jetzt sichern',
    },
  },
  {
    id: 'aktion_fx_home_2',
    title: 'Ziehungserinnerung aktivieren',
    description: 'Lass dich informieren, sobald neue Gewinnzahlen verfügbar sind.',
    placement: 'aktion_home_offer',
    extras: {
      placement: 'aktion_home_offer',
      offer_id: 'draw_reminder',
      cta: 'Aktivieren',
    },
  },
  {
    id: 'aktion_fx_inbox_1',
    title: 'Deine Gewinnzahlen sind da',
    description: 'Prüfe deine Lose und speichere sie für den nächsten Check.',
    placement: 'inbox',
    extras: {
      placement: 'inbox',
      offer_id: 'draw_results',
      cta: 'Prüfen',
    },
  },
]

export const fixtureCards: NormalizedCard[] =
  activeAppContent.harnessCards?.length
    ? activeAppContent.harnessCards
    : activeDemoPackId === 'wolt-food-delivery'
    ? woltCards
    : activeDemoPackId === 'aktion-mensch'
      ? aktionMenschCards
      : defaultCards
