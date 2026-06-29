import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import type { NormalizedCard } from '../braze/bridge'
import { SmartImage } from './SmartImage'

/** Renders a real Braze Content Card. `variant` adapts the layout per surface.
 *  Content Cards are data the app renders — this IS the channel, not a stand-in. */
export function ContentCardView({
  card,
  variant = 'feed',
  onClick,
  onImpression,
}: {
  card: NormalizedCard
  variant?: 'hero' | 'carousel' | 'feed' | 'inbox'
  onClick: (card: NormalizedCard) => void
  onImpression?: (card: NormalizedCard) => void
}) {
  const handle = () => onClick(card)

  useEffect(() => {
    onImpression?.(card)
  }, [card, onImpression])

  if (variant === 'hero') {
    return (
      <button
        onClick={handle}
        className="animate-fade relative flex w-full overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-dark p-4 text-left text-white shadow-card"
      >
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Offer</p>
          <h3 className="mt-1 text-lg font-bold leading-tight">{card.title}</h3>
          {card.description && <p className="mt-1 text-sm text-white/85">{card.description}</p>}
          <span className="mt-3 inline-block rounded-full bg-white px-4 py-1.5 text-sm font-bold text-brand">
            {card.extras.cta ?? 'View'}
          </span>
        </div>
      </button>
    )
  }

  if (variant === 'carousel') {
    return (
      <button
        onClick={handle}
        className="flex w-[220px] shrink-0 flex-col rounded-card border border-line bg-white p-3 text-left shadow-card"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-accent">Promo</span>
        <h3 className="mt-1 text-[15px] font-bold leading-tight text-ink">{card.title}</h3>
        {card.description && <p className="mt-1 text-[12px] text-muted">{card.description}</p>}
      </button>
    )
  }

  if (variant === 'inbox') {
    return (
      <button
        onClick={handle}
        className="flex w-full items-start gap-3 rounded-card border border-line bg-white p-3 text-left shadow-card"
      >
        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-bold leading-snug text-ink">{card.title}</h3>
          {card.description && <p className="mt-0.5 text-[12px] leading-snug text-muted">{card.description}</p>}
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-muted" />
      </button>
    )
  }

  // feed
  return (
    <button
      onClick={handle}
      className="flex w-full overflow-hidden rounded-card border border-line bg-white text-left shadow-card"
    >
      <SmartImage src={card.imageUrl} label={card.title} className="h-[88px] w-[88px] shrink-0 object-cover" />
      <div className="min-w-0 flex-1 p-3">
        <h3 className="truncate text-[15px] font-bold text-ink">{card.title}</h3>
        {card.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{card.description}</p>}
      </div>
    </button>
  )
}
