// ---------------------------------------------------------------------------
// BrazeBridge — the single seam between the web UI and Braze.
//
// In a DEMO the web UI runs inside the native iOS shell (WKWebView). All Braze
// access goes to the native Braze Swift SDK through this bridge — push, custom
// events, custom attributes, and Content Card *data* are the real app channel.
// In-app messages are NOT handled here: the Swift SDK renders them natively.
//
// While BUILDING the UI we run in a plain browser where there is no shell and no
// Braze. The "harness" implementation supplies static layout fixtures so screens
// render. It is a render aid only; all real controls live in the Braze Demo
// Control Room.
// ---------------------------------------------------------------------------

import { activeRuntimeManifest } from '../brand/activeDemoConfig.generated'
import { createIdentitySyncState, type SyncEnvelope, type SyncReason } from './sync'

/** A Braze Content Card, normalized for rendering. `extras` carries the
 *  dashboard key/value pairs; `placement` (from extras.placement) routes the
 *  card to a UI surface, defaulting to the inbox. */
export interface NormalizedCard {
  id: string
  title: string
  description?: string
  imageUrl?: string
  url?: string
  extras: Record<string, string>
  placement: string
}

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export type DemoRuntimeManifest = typeof activeRuntimeManifest

export interface ConnectionStatus {
  connected: boolean
  /** Human label for the active workspace / mode, shown in diagnostics only. */
  label: string
  externalId?: string
  /** Presenter-facing name selected in the Control Room for the active SDK user. */
  displayName?: string
  sync?: SyncEnvelope
  /** True when no workspace is configured yet in a native shell. */
  setupNeeded?: boolean
  runtime?: DemoRuntimeManifest
  sourceUrl?: string
  sourceOverride?: boolean
}

/** A saved SDK workspace/user profile. `webURL` is an explicit advanced override. */
export interface CredentialProfile {
  id?: string
  name: string
  apiKey: string
  endpoint: string
  externalId: string
  firstName?: string
  lastName?: string
  initials?: string
  homeLocation?: string
  homeAddress?: string
  loyaltyTier?: string
  loyaltyPoints?: number
  favoriteCategories?: string[]
  /** Explicit local web source override. Leave empty for generated runtime source. */
  webURL?: string
  active?: boolean
}

/** Diagnostics-only preview payload. Real mobile push display is native/OS-owned. */
export interface PushNotification {
  title: string
  body: string
  uri?: string
}

export interface BrazeBridge {
  readonly kind: 'native' | 'harness'

  /** Resolves once the underlying SDK (or harness) is ready. */
  ready(): Promise<void>

  // — User —
  changeUser(externalId: string, reason?: SyncReason): void
  setCustomAttribute(key: string, value: unknown): void

  // — Events —
  logCustomEvent(name: string, properties?: Record<string, unknown>): void
  logPurchase(
    productId: string,
    price: number,
    currency: string,
    quantity?: number,
    properties?: Record<string, unknown>,
  ): void

  // — Content Cards (data only; the app renders them) —
  requestContentCardsRefresh(): void
  subscribeToContentCards(cb: (cards: NormalizedCard[]) => void): () => void
  logContentCardImpression(cardId: string): void
  logContentCardClick(cardId: string): void
  dismissContentCard(cardId: string): void

  // — Banners (native SDK-owned view registered into an app placement) —
  mountBanner(placementId: string, rect: { x: number; y: number; width: number; height: number; viewportWidth: number }): void
  unmountBanner(placementId: string): void
  requestBannersRefresh(placementIds: string[]): void

  // — Push —
  requestPushPermission(): void
  subscribeToPushPermission(cb: (p: PushPermission) => void): () => void

  // — Connection status —
  subscribeToConnection(cb: (s: ConnectionStatus) => void): () => void

  /** Native → web deep-link target (e.g. from an IAM/push tap handled natively). */
  subscribeToNavigation(cb: (route: string) => void): () => void

  // — Credential profiles (setup screen) —
  saveCredentialProfile(profile: CredentialProfile): void
  selectCredentialProfile(id: string): void
  listProfiles(): void
  subscribeToProfiles(cb: (profiles: CredentialProfile[]) => void): () => void

  // — Push preview (diagnostics only; real push display stays native) —
  subscribeToPush(cb: (push: PushNotification) => void): () => void
}

// — tiny pub/sub helper (behavior subject) ----------------------------------
// Retains the last value and replays it (deferred) to late subscribers. This
// matters for the native bridge: the shell can send `connection`/`profiles`
// before React's useEffect attaches the listener, so a plain emitter would drop
// them and the UI would hang on the splash. Replay closes that race.
function emitter<T>() {
  const subs = new Set<(v: T) => void>()
  let hasLast = false
  let lastVal: T
  return {
    subscribe(cb: (v: T) => void) {
      subs.add(cb)
      if (hasLast) setTimeout(() => { if (hasLast) cb(lastVal) }, 0)
      return () => subs.delete(cb)
    },
    emit(v: T) {
      hasLast = true
      lastVal = v
      subs.forEach((cb) => cb(v))
    },
  }
}

// — Native bridge -----------------------------------------------------------
// Talks to the shell via `window.webkit.messageHandlers.brazeBridge.postMessage`
// (JS → Swift) and receives via `window.__brazeBridge.receive` (Swift → JS,
// invoked through WKWebView.evaluateJavaScript).
declare global {
  interface Window {
    webkit?: {
      messageHandlers?: Record<string, { postMessage: (msg: unknown) => void }>
    }
    brazeBridge?: {
      postMessage: (msg: string) => void
    }
    __brazeBridge?: { receive: (action: string, payload: unknown) => void }
  }
}

function nativePost(action: string, payload?: unknown): void {
  const iosHandler = window.webkit?.messageHandlers?.brazeBridge
  if (iosHandler) {
    iosHandler.postMessage({ action, payload })
    return
  }

  window.brazeBridge?.postMessage(JSON.stringify({ action, payload }))
}

function hasNativeBridge(): boolean {
  return Boolean(window.webkit?.messageHandlers?.brazeBridge || window.brazeBridge?.postMessage)
}

function createNativeBridge(): BrazeBridge {
  const post = nativePost
  const identitySync = createIdentitySyncState()

  const cards = emitter<NormalizedCard[]>()
  const push = emitter<PushPermission>()
  const conn = emitter<ConnectionStatus>()
  const nav = emitter<string>()
  const profiles = emitter<CredentialProfile[]>()
  const pushNotif = emitter<PushNotification>()
  let resolveReady: () => void
  const readyPromise = new Promise<void>((r) => (resolveReady = r))

  // Single entry point the shell calls via evaluateJavaScript.
  window.__brazeBridge = {
    receive(action, payload) {
      switch (action) {
        case 'ready':
          resolveReady()
          break
        case 'contentCards':
          cards.emit(payload as NormalizedCard[])
          break
        case 'pushPermission':
          push.emit(payload as PushPermission)
          break
        case 'connection':
          if ((payload as ConnectionStatus | null)?.externalId) {
            const status = payload as ConnectionStatus
            identitySync.observeNativeIdentity(status.externalId || '', status.sync)
          }
          conn.emit(payload as ConnectionStatus)
          break
        case 'profiles':
          profiles.emit(payload as CredentialProfile[])
          break
        case 'push':
          pushNotif.emit(payload as PushNotification)
          break
        case 'navigate':
          nav.emit(payload as string)
          break
      }
    },
  }

  // Tell native the web bridge is wired so it can complete the handshake
  // (native responds with 'ready' + 'connection').
  post('webReady', {
    sync: identitySync.envelope('default'),
    sourceUrl: window.location.href,
  })

  return {
    kind: 'native',
    ready: () => readyPromise,
    changeUser: (id, reason = 'manual') => {
      identitySync.requestWebIdentitySync(id, (externalId, sync) => {
        post('changeUser', { externalId, sync })
      }, reason)
    },
    setCustomAttribute: (key, value) => post('setCustomAttribute', { key, value }),
    logCustomEvent: (name, properties) => post('logCustomEvent', { name, properties }),
    logPurchase: (productId, price, currency, quantity, properties) =>
      post('logPurchase', { productId, price, currency, quantity, properties }),
    requestContentCardsRefresh: () => post('requestContentCardsRefresh'),
    subscribeToContentCards: cards.subscribe,
    logContentCardImpression: (id) => post('logContentCardImpression', { cardId: id }),
    logContentCardClick: (id) => post('logContentCardClick', { cardId: id }),
    dismissContentCard: (id) => post('dismissContentCard', { cardId: id }),
    mountBanner: (placementId, rect) => post('mountBanner', { placementId, rect }),
    unmountBanner: (placementId) => post('unmountBanner', { placementId }),
    requestBannersRefresh: (placementIds) => post('requestBannersRefresh', { placementIds }),
    requestPushPermission: () => post('requestPushPermission'),
    subscribeToPushPermission: push.subscribe,
    subscribeToConnection: conn.subscribe,
    subscribeToNavigation: nav.subscribe,
    saveCredentialProfile: (p) => post('saveCredentialProfile', p),
    selectCredentialProfile: (id) => post('selectCredentialProfile', { id }),
    listProfiles: () => post('listProfiles'),
    subscribeToProfiles: profiles.subscribe,
    subscribeToPush: pushNotif.subscribe,
  }
}

// — Harness bridge (browser, dev only) --------------------------------------
function createHarnessBridge(fixtures: NormalizedCard[]): BrazeBridge {
  const tag = 'color:#4F46E5;font-weight:bold'
  const log = (action: string, payload?: unknown) =>
    // eslint-disable-next-line no-console
    console.info(`%c[harness] ${action}`, tag, payload ?? '')

  const cards = emitter<NormalizedCard[]>()
  const push = emitter<PushPermission>()
  const conn = emitter<ConnectionStatus>()
  const nav = emitter<string>()
  const profiles = emitter<CredentialProfile[]>()
  const pushNotif = emitter<PushNotification>()
  const identitySync = createIdentitySyncState()
  let pushState: PushPermission = 'default'

  let currentCards = fixtures

  // Deliver fixtures on the next tick so subscribers attach first.
  const deliverCards = () => setTimeout(() => cards.emit(currentCards), 0)

  // Legacy localStorage-backed profiles remain importable for migration/testing.
  const PKEY = 'harness.profiles'
  const AKEY = 'harness.activeId'
  const loadProfiles = (): CredentialProfile[] => {
    try {
      return JSON.parse(localStorage.getItem(PKEY) || '[]') as CredentialProfile[]
    } catch {
      return []
    }
  }
  const saveProfiles = (list: CredentialProfile[]) => localStorage.setItem(PKEY, JSON.stringify(list))
  let activeId = localStorage.getItem(AKEY) || undefined
  const withActive = () => loadProfiles().map((p) => ({ ...p, active: p.id === activeId }))
  const activeProfile = () => loadProfiles().find((p) => p.id === activeId)
  const emitConnection = () => {
    const ap = activeProfile()
    conn.emit(
      ap
        ? {
            connected: true,
            label: `${ap.name} · ${ap.endpoint} (browser render)`,
            externalId: ap.externalId,
            sync: identitySync.envelope('default', 'native'),
            setupNeeded: false,
            runtime: activeRuntimeManifest,
            sourceUrl: window.location.href,
            sourceOverride: false,
          }
        : {
            connected: false,
            label: `${activeRuntimeManifest.name} · browser render`,
            sync: identitySync.envelope('default', 'native'),
            setupNeeded: false,
            runtime: activeRuntimeManifest,
            sourceUrl: window.location.href,
            sourceOverride: false,
          },
    )
  }

  return {
    kind: 'harness',
    ready: () => Promise.resolve(),
    changeUser: (id, reason = 'manual') => {
      identitySync.requestWebIdentitySync(id, (externalId, sync) => {
        log('changeUser', { externalId, sync })
        conn.emit({
          connected: true,
          label: `${activeRuntimeManifest.name} · browser render`,
          externalId,
          sync: identitySync.envelope(reason, 'native'),
          setupNeeded: false,
          runtime: activeRuntimeManifest,
          sourceUrl: window.location.href,
          sourceOverride: false,
        })
      }, reason)
    },
    setCustomAttribute: (key, value) => log('setCustomAttribute', { key, value }),
    logCustomEvent: (name, properties) => log(`logCustomEvent → ${name}`, properties),
    logPurchase: (productId, price, currency, quantity, properties) =>
      log('logPurchase', { productId, price, currency, quantity, properties }),
    requestContentCardsRefresh: () => {
      log('requestContentCardsRefresh')
      deliverCards()
    },
    subscribeToContentCards: (cb) => {
      const unsub = cards.subscribe(cb)
      deliverCards()
      return unsub
    },
    logContentCardImpression: (id) => log('logContentCardImpression', { cardId: id }),
    logContentCardClick: (id) => log('logContentCardClick', { cardId: id }),
    dismissContentCard: (id) => {
      log('dismissContentCard', { cardId: id })
      currentCards = currentCards.filter((card) => card.id !== id)
      cards.emit(currentCards)
    },
    mountBanner: (placementId, rect) => log('mountBanner (layout-only harness)', { placementId, rect }),
    unmountBanner: (placementId) => log('unmountBanner (layout-only harness)', { placementId }),
    requestBannersRefresh: (placementIds) => log('requestBannersRefresh (unavailable in harness)', { placementIds }),
    requestPushPermission: () => {
      log('requestPushPermission')
      pushState = 'granted'
      push.emit(pushState)
    },
    subscribeToPushPermission: (cb) => {
      const unsub = push.subscribe(cb)
      setTimeout(() => cb(pushState), 0)
      return unsub
    },
    subscribeToConnection: (cb) => {
      const unsub = conn.subscribe(cb)
      setTimeout(emitConnection, 0)
      return unsub
    },
    subscribeToNavigation: nav.subscribe,
    saveCredentialProfile: (p) => {
      const list = loadProfiles()
      const id = p.id || `p_${Date.now()}`
      const next: CredentialProfile = { ...p, id }
      const idx = list.findIndex((x) => x.id === id)
      if (idx >= 0) list[idx] = next
      else list.push(next)
      saveProfiles(list)
      activeId = id
      localStorage.setItem(AKEY, id)
      log('saveCredentialProfile', next)
      profiles.emit(withActive())
      emitConnection()
    },
    selectCredentialProfile: (id) => {
      activeId = id
      localStorage.setItem(AKEY, id)
      log('selectCredentialProfile', { id })
      profiles.emit(withActive())
      emitConnection()
    },
    listProfiles: () => profiles.emit(withActive()),
    subscribeToProfiles: (cb) => {
      const unsub = profiles.subscribe(cb)
      setTimeout(() => cb(withActive()), 0)
      return unsub
    },
    subscribeToPush: pushNotif.subscribe,
  }
}

// — Selection ---------------------------------------------------------------
let instance: BrazeBridge | null = null

/** Returns the active bridge, creating it on first use. `fixtures` are only used
 *  by the harness (ignored by the native bridge). */
export function getBridge(fixtures: NormalizedCard[] = []): BrazeBridge {
  if (instance) return instance
  const inShell = hasNativeBridge()
  if (inShell) document.documentElement.classList.add('in-shell')
  instance = inShell ? createNativeBridge() : createHarnessBridge(fixtures)
  return instance
}

export function isInShell(): boolean {
  return hasNativeBridge()
}
