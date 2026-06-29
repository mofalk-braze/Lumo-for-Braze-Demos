import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, Server } from 'lucide-react'
import { useBraze } from '../braze/BrazeBridgeProvider'
import { AnchorEvents, StandardAttributes } from '../braze/events'
import { brandConfig } from '../brand/brandConfig'
import { BrandLogo } from '../components/ui'

export function Account() {
  const { firstName, attributes, points, connection, fireAnchor, setAttribute, requestPush } = useBraze()
  const navigate = useNavigate()
  const [pushOptIn, setPushOptIn] = useState(false)

  useEffect(() => {
    fireAnchor(AnchorEvents.SCREEN_VIEWED, { screen: 'account', section: 'main' }, 'account')
  }, [fireAnchor])

  const tier = String(attributes[StandardAttributes.LOYALTY_TIER] ?? '—')
  const categories = (attributes[StandardAttributes.FAVORITE_CATEGORIES] as string[]) ?? []

  const togglePush = () => {
    const next = !pushOptIn
    setPushOptIn(next)
    setAttribute('push_opt_in', next)
    fireAnchor(AnchorEvents.PREFERENCE_UPDATED, { key: 'push_opt_in', value: next }, `push_opt_in=${next}`)
    if (next) requestPush()
  }

  const redeem = () => {
    const cost = 150
    const next = Math.max(0, points - cost)
    setAttribute(StandardAttributes.LOYALTY_POINTS, next)
    fireAnchor(
      AnchorEvents.LOYALTY_EVENT,
      { action: 'redeem', amount: cost, balance: next, reward: '€5 voucher' },
      `redeem 150 → €5 voucher`,
    )
  }

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto bg-surface pb-4">
      <div className="bg-white px-4 pb-5 pt-14">
        <div className="flex items-center gap-3">
          <BrandLogo size={52} />
          <div>
            <h1 className="text-xl font-bold text-ink">{firstName}</h1>
            <p className="text-sm capitalize text-muted">{tier} member · {points} pts</p>
          </div>
        </div>
      </div>

      {/* Profile attributes */}
      <div className="mt-4 px-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Profile (Braze attributes)</p>
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <Row label="Loyalty tier" value={tier} />
          <Row label="Points" value={String(points)} />
          <Row label="Home location" value={String(attributes[StandardAttributes.HOME_LOCATION] ?? '—')} />
          <Row label="Lifecycle stage" value={String(attributes[StandardAttributes.LIFECYCLE_STAGE] ?? '—')} />
          <Row label="Favorite categories" value={categories.join(', ') || '—'} last />
        </div>
      </div>

      {/* Braze workspace (setup) */}
      <div className="mt-4 px-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Braze workspace</p>
        <button
          onClick={() => navigate('/setup')}
          className="flex w-full items-center gap-3 rounded-card border border-line bg-white px-4 py-3 text-left"
        >
          <Server size={18} className="text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-ink">Connected workspace</span>
            <span className="block truncate text-[12px] text-muted">{connection.label}</span>
          </span>
          <ChevronRight size={16} className="text-muted" />
        </button>
      </div>

      {/* Actions that emit anchor events */}
      <div className="mt-4 px-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Preferences</p>
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <button onClick={togglePush} className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <Bell size={18} className="text-brand" />
            <span className="flex-1 text-[14px] font-semibold text-ink">Push notifications</span>
            <span className={`h-6 w-10 rounded-full p-0.5 transition ${pushOptIn ? 'bg-brand' : 'bg-line'}`}>
              <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${pushOptIn ? 'translate-x-4' : ''}`} />
            </span>
          </button>
          <button onClick={redeem} className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-brand-accent text-[10px] font-bold text-white">★</span>
            <span className="flex-1 text-[14px] font-semibold text-ink">Redeem 150 pts → €5 voucher</span>
            <ChevronRight size={16} className="text-muted" />
          </button>
        </div>
      </div>

      <p className="mt-6 px-4 text-center text-[11px] text-muted">
        {brandConfig.displayName} · Braze demo · {firstName}
      </p>
    </div>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${last ? '' : 'border-b border-line'}`}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[13px] font-semibold text-ink">{value}</span>
    </div>
  )
}
