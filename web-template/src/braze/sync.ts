import { activeRuntimeManifest } from '../brand/activeDemoConfig.generated'

export const SYNC_PROTOCOL = 'braze-demo-sync/v1' as const

export type SyncAuthority = 'web' | 'native' | 'control_room'
export type SyncReason = 'default' | 'manual' | 'profile_select' | 'command' | 'recovery'

export interface SyncEnvelope {
  protocol: typeof SYNC_PROTOCOL
  sessionId: string
  runtimeId: string
  configHash: string
  authority: SyncAuthority
  reason: SyncReason
  timestamp: number
}

export interface IdentitySyncState {
  readonly sessionId: string
  envelope(reason?: SyncReason, authority?: SyncAuthority): SyncEnvelope
  requestWebIdentitySync(
    externalId: string,
    publish: (externalId: string, sync: SyncEnvelope) => void,
    reason?: SyncReason,
  ): boolean
  observeNativeIdentity(externalId: string, sync?: Partial<SyncEnvelope>): boolean
}

function makeSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function normalizeExternalId(value: string): string {
  return String(value ?? '').trim()
}

function isSyncReason(value: unknown): value is SyncReason {
  return (
    value === 'default' ||
    value === 'manual' ||
    value === 'profile_select' ||
    value === 'command' ||
    value === 'recovery'
  )
}

function isSyncAuthority(value: unknown): value is SyncAuthority {
  return value === 'web' || value === 'native' || value === 'control_room'
}

function signature(externalId: string, sync: Partial<SyncEnvelope>): string {
  return [
    normalizeExternalId(externalId),
    sync.protocol ?? SYNC_PROTOCOL,
    sync.sessionId ?? 'session',
    sync.runtimeId ?? activeRuntimeManifest.id,
    sync.configHash ?? activeRuntimeManifest.configHash,
    sync.authority ?? 'unknown',
    sync.reason ?? 'unknown',
  ].join('|')
}

export function createIdentitySyncState(): IdentitySyncState {
  const sessionId = makeSessionId()
  let lastOutboundSig = ''
  let lastObservedNativeSig = ''

  function envelope(reason: SyncReason = 'manual', authority: SyncAuthority = 'web'): SyncEnvelope {
    return {
      protocol: SYNC_PROTOCOL,
      sessionId,
      runtimeId: activeRuntimeManifest.id,
      configHash: activeRuntimeManifest.configHash,
      authority,
      reason,
      timestamp: Date.now(),
    }
  }

  return {
    sessionId,
    envelope,
    requestWebIdentitySync(externalId, publish, reason = 'manual') {
      const id = normalizeExternalId(externalId)
      if (!id) return false

      const sync = envelope(isSyncReason(reason) ? reason : 'manual', 'web')
      const nextSig = signature(id, sync)
      if (nextSig === lastOutboundSig || nextSig === lastObservedNativeSig) return false

      lastOutboundSig = nextSig
      publish(id, sync)
      return true
    },
    observeNativeIdentity(externalId, sync = {}) {
      const id = normalizeExternalId(externalId)
      if (!id) return false

      const normalizedSync: Partial<SyncEnvelope> = {
        protocol: sync.protocol ?? SYNC_PROTOCOL,
        sessionId: sync.sessionId ?? sessionId,
        runtimeId: sync.runtimeId ?? activeRuntimeManifest.id,
        configHash: sync.configHash ?? activeRuntimeManifest.configHash,
        authority: isSyncAuthority(sync.authority) ? sync.authority : 'native',
        reason: isSyncReason(sync.reason) ? sync.reason : 'manual',
      }
      const nextSig = signature(id, normalizedSync)
      if (nextSig === lastObservedNativeSig) return false

      lastObservedNativeSig = nextSig
      return true
    },
  }
}
