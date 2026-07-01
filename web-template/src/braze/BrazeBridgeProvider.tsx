import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  getBridge,
  type ConnectionStatus,
  type CredentialProfile,
  type NormalizedCard,
  type PushNotification,
  type PushPermission,
} from './bridge'
import { AnchorEvents, StandardAttributes, type AnchorEventName } from './events'
import { brandConfig, type FlavorEvent } from '../brand/brandConfig'
import { fixtureCards } from '../harness/fixtures'

export interface EventLogEntry {
  id: number
  name: string
  detail?: string
  kind: 'event' | 'attribute' | 'card' | 'push'
  ts: number
}

interface BrazeContextValue {
  kind: 'native' | 'harness'
  ready: boolean
  connection: ConnectionStatus
  activeProfile?: CredentialProfile
  pushPermission: PushPermission
  firstName: string
  displayUser: {
    firstName: string
    lastName: string
    initials: string
    homeLocation: string
    homeAddress: string
    loyaltyTier: string
    loyaltyPoints: number
    favoriteCategories: string[]
  }
  attributes: Record<string, unknown>
  points: number
  // Content cards
  contentCards: NormalizedCard[]
  cardsForPlacement: (placement: string) => NormalizedCard[]
  refreshCards: () => void
  impressCard: (card: NormalizedCard) => void
  clickCard: (card: NormalizedCard) => void
  // Events
  changeUser: (externalId: string) => void
  track: (name: string, properties?: Record<string, unknown>, detail?: string) => void
  fireAnchor: (anchor: AnchorEventName, properties?: Record<string, unknown>, detail?: string) => void
  fireFlavor: (flavor: FlavorEvent) => void
  logPurchase: (
    productId: string,
    price: number,
    currency: string,
    quantity?: number,
    properties?: Record<string, unknown>,
  ) => void
  // Attributes / push
  setAttribute: (key: string, value: unknown) => void
  requestPush: () => void
  // Credential profiles (setup)
  profiles: CredentialProfile[]
  saveProfile: (p: CredentialProfile) => void
  selectProfile: (id: string) => void
  // Push → branded in-app banner
  push: PushNotification | null
  dismissPush: () => void
  simulatePush: (p: PushNotification) => void
  navigationRoute: string | null
  // Demo feed
  eventLog: EventLogEntry[]
}

const BrazeContext = createContext<BrazeContextValue | null>(null)

function placementOf(card: NormalizedCard): string {
  const placement = card.placement || card.extras?.placement || 'inbox'
  if (placement === 'lumo_hero') return 'hero'
  if (placement === 'home_feed') return 'home'
  if (placement === 'inline_module') return 'inline'
  if (placement === 'account_panel') return 'account'
  return placement
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function listValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function makeInitials(firstName: string, lastName: string, fallback: string): string {
  const picked = [firstName, lastName].filter(Boolean).map((part) => part[0]).join('')
  return (picked || fallback || 'U').slice(0, 2).toUpperCase()
}

export function BrazeBridgeProvider({ children }: { children: ReactNode }) {
  const bridge = useMemo(() => getBridge(fixtureCards), [])

  const [ready, setReady] = useState(false)
  const [connection, setConnection] = useState<ConnectionStatus>({
    connected: false,
    label: '…',
  })
  const [pushPermission, setPushPermission] = useState<PushPermission>('default')
  const [contentCards, setContentCards] = useState<NormalizedCard[]>([])
  const [attributes, setAttributes] = useState<Record<string, unknown>>(
    brandConfig.demoUser.attributes,
  )
  const [profiles, setProfiles] = useState<CredentialProfile[]>([])
  const [push, setPush] = useState<PushNotification | null>(null)
  const [navigationRoute, setNavigationRoute] = useState<string | null>(null)
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([])
  const logSeq = useRef(0)
  const impressed = useRef<Set<string>>(new Set())

  const activeProfile = useMemo(() => profiles.find((profile) => profile.active), [profiles])

  const displayUser = useMemo(() => {
    const seeded = brandConfig.demoUser.attributes
    const fallbackFirst = brandConfig.demoUser.firstName
    const firstName = clean(activeProfile?.firstName) || clean(attributes.first_name) || fallbackFirst
    const lastName = clean(activeProfile?.lastName) || clean(attributes.last_name)
    const homeLocation =
      clean(activeProfile?.homeLocation) ||
      clean(attributes[StandardAttributes.HOME_LOCATION]) ||
      clean(seeded[StandardAttributes.HOME_LOCATION])
    const homeAddress =
      clean(activeProfile?.homeAddress) ||
      clean(attributes.home_address) ||
      homeLocation
    const loyaltyTier =
      clean(activeProfile?.loyaltyTier) ||
      clean(attributes[StandardAttributes.LOYALTY_TIER]) ||
      clean(seeded[StandardAttributes.LOYALTY_TIER])
    const loyaltyPoints = Number(
      activeProfile?.loyaltyPoints ??
        attributes[StandardAttributes.LOYALTY_POINTS] ??
        seeded[StandardAttributes.LOYALTY_POINTS] ??
        0,
    )
    const favoriteCategories =
      activeProfile?.favoriteCategories?.length
        ? activeProfile.favoriteCategories
        : listValue(attributes[StandardAttributes.FAVORITE_CATEGORIES]).length
          ? listValue(attributes[StandardAttributes.FAVORITE_CATEGORIES])
          : listValue(seeded[StandardAttributes.FAVORITE_CATEGORIES])

    return {
      firstName,
      lastName,
      initials: clean(activeProfile?.initials) || makeInitials(firstName, lastName, brandConfig.logoText),
      homeLocation,
      homeAddress,
      loyaltyTier,
      loyaltyPoints,
      favoriteCategories,
    }
  }, [activeProfile, attributes])

  const pushLog = useCallback((name: string, kind: EventLogEntry['kind'], detail?: string) => {
    logSeq.current += 1
    setEventLog((prev) =>
      [{ id: logSeq.current, name, kind, detail, ts: Date.now() }, ...prev].slice(0, 30),
    )
  }, [])

  // — Wire the bridge ------------------------------------------------------
  useEffect(() => {
    const unsubs = [
      bridge.subscribeToContentCards((cards) => {
        setContentCards(cards)
      }),
      bridge.subscribeToPushPermission(setPushPermission),
      bridge.subscribeToConnection(setConnection),
      bridge.subscribeToProfiles(setProfiles),
      bridge.subscribeToPush(setPush),
      bridge.subscribeToNavigation(setNavigationRoute),
    ]

    bridge.ready().then(() => {
      setReady(true)
      // Native owns the user identity (changeUser from the active credential
      // profile). The web only enriches that user with attributes + events.
      Object.entries(brandConfig.demoUser.attributes).forEach(([k, v]) =>
        bridge.setCustomAttribute(k, v),
      )
      bridge.requestContentCardsRefresh()
    })

    return () => unsubs.forEach((u) => u())
  }, [bridge])

  useEffect(() => {
    if (!ready) return
    const profileAttributes: Record<string, unknown> = {
      first_name: displayUser.firstName,
      last_name: displayUser.lastName,
      home_address: displayUser.homeAddress,
      [StandardAttributes.HOME_LOCATION]: displayUser.homeLocation,
      [StandardAttributes.LOYALTY_TIER]: displayUser.loyaltyTier,
      [StandardAttributes.LOYALTY_POINTS]: displayUser.loyaltyPoints,
      [StandardAttributes.FAVORITE_CATEGORIES]: displayUser.favoriteCategories,
    }
    Object.entries(profileAttributes).forEach(([key, value]) => {
      if (value !== '' && !(Array.isArray(value) && value.length === 0)) {
        bridge.setCustomAttribute(key, value)
      }
    })
  }, [bridge, displayUser, ready])

  // — Events ---------------------------------------------------------------
  const changeUser = useCallback(
    (externalId: string) => {
      const id = externalId.trim()
      if (!id) return
      bridge.changeUser(id)
      pushLog('change_user', 'event', id)
    },
    [bridge, pushLog],
  )

  const track = useCallback(
    (name: string, properties?: Record<string, unknown>, detail?: string) => {
      bridge.logCustomEvent(name, properties)
      pushLog(name, 'event', detail ?? (properties ? JSON.stringify(properties) : undefined))
    },
    [bridge, pushLog],
  )

  const fireAnchor = useCallback(
    (anchor: AnchorEventName, properties?: Record<string, unknown>, detail?: string) => {
      track(anchor, properties, detail)
    },
    [track],
  )

  const fireFlavor = useCallback(
    (flavor: FlavorEvent) => {
      track(flavor.name, flavor.sample, flavor.label)
      if (flavor.emitAnchor) track(flavor.anchor, flavor.sample, `↳ anchor of ${flavor.name}`)
    },
    [track],
  )

  const logPurchase = useCallback(
    (
      productId: string,
      price: number,
      currency: string,
      quantity = 1,
      properties?: Record<string, unknown>,
    ) => {
      bridge.logPurchase(productId, price, currency, quantity, properties)
      pushLog('purchase', 'event', `${productId} ${price} ${currency}`)
    },
    [bridge, pushLog],
  )

  // — Content cards --------------------------------------------------------
  const cardsForPlacement = useCallback(
    (placement: string) => contentCards.filter((c) => placementOf(c) === placement),
    [contentCards],
  )

  const refreshCards = useCallback(() => bridge.requestContentCardsRefresh(), [bridge])

  const impressCard = useCallback(
    (card: NormalizedCard) => {
      if (impressed.current.has(card.id)) return
      impressed.current.add(card.id)
      bridge.logContentCardImpression(card.id)
      pushLog('content_card_impression', 'card', card.title)
    },
    [bridge, pushLog],
  )

  const clickCard = useCallback(
    (card: NormalizedCard) => {
      bridge.logContentCardClick(card.id)
      pushLog('content_card_click', 'card', card.title)
      fireAnchor(
        AnchorEvents.OFFER_INTERACTION,
        {
          offer_id: card.extras.offer_id ?? card.id,
          offer_name: card.title,
          surface: placementOf(card),
          action: 'tapped',
        },
        card.title,
      )

      const target = card.extras.deeplink || card.url
      if (target) {
        if (target.startsWith('/')) {
          window.history.pushState({}, '', target)
          window.dispatchEvent(new PopStateEvent('popstate'))
        } else {
          window.location.href = target
        }
      }
    },
    [bridge, fireAnchor, pushLog],
  )

  // — Attributes / push ----------------------------------------------------
  const setAttribute = useCallback(
    (key: string, value: unknown) => {
      bridge.setCustomAttribute(key, value)
      setAttributes((prev) => ({ ...prev, [key]: value }))
      pushLog(key, 'attribute', String(Array.isArray(value) ? value.join(', ') : value))
    },
    [bridge, pushLog],
  )

  const requestPush = useCallback(() => {
    bridge.requestPushPermission()
    pushLog('push_permission_requested', 'push')
  }, [bridge, pushLog])

  // — Credential profiles --------------------------------------------------
  const saveProfile = useCallback((p: CredentialProfile) => bridge.saveCredentialProfile(p), [bridge])
  const selectProfile = useCallback((id: string) => bridge.selectCredentialProfile(id), [bridge])

  // — Push banner ----------------------------------------------------------
  const dismissPush = useCallback(() => setPush(null), [])
  // Dev/layout only: render the banner without a real push (real demos use the SDK).
  const simulatePush = useCallback((p: PushNotification) => setPush(p), [])

  const points = displayUser.loyaltyPoints

  const value: BrazeContextValue = {
    kind: bridge.kind,
    ready,
    connection,
    activeProfile,
    pushPermission,
    firstName: displayUser.firstName,
    displayUser,
    attributes,
    points,
    contentCards,
    cardsForPlacement,
    refreshCards,
    impressCard,
    clickCard,
    changeUser,
    track,
    fireAnchor,
    fireFlavor,
    logPurchase,
    setAttribute,
    requestPush,
    profiles,
    saveProfile,
    selectProfile,
    push,
    dismissPush,
    simulatePush,
    navigationRoute,
    eventLog,
  }

  return <BrazeContext.Provider value={value}>{children}</BrazeContext.Provider>
}

export function useBraze(): BrazeContextValue {
  const ctx = useContext(BrazeContext)
  if (!ctx) throw new Error('useBraze must be used within a BrazeBridgeProvider')
  return ctx
}
