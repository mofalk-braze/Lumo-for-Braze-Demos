import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import type { NormalizedCard } from '../braze/bridge'
import { SmartImage } from './SmartImage'

/** Renders a real Braze Content Card. `variant` adapts the layout per surface.
 *  Content Cards are data the app renders — this IS the channel, not a stand-in. */
export function ContentCardView({
  card,
  variant = 'feed',
  compact = false,
  onClick,
  onImpression,
}: {
  card: NormalizedCard
  variant?: 'hero' | 'carousel' | 'feed' | 'inbox'
  compact?: boolean
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
        className={`animate-fade relative flex w-full overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-dark text-left text-white shadow-card ${compact ? 'p-3' : 'p-4'}`}
      >
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Offer</p>
          <h3 className={`mt-1 font-bold leading-tight ${compact ? 'text-base' : 'text-lg'}`}>{card.title}</h3>
          {card.description && <p className={`mt-1 text-white/85 ${compact ? 'line-clamp-2 text-xs' : 'text-sm'}`}>{card.description}</p>}
          <span className={`inline-block rounded-full bg-white font-bold text-brand ${compact ? 'mt-2 px-3 py-1 text-xs' : 'mt-3 px-4 py-1.5 text-sm'}`}>
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
        className={`flex shrink-0 flex-col rounded-card border border-line bg-white text-left shadow-card ${compact ? 'w-[172px] p-2.5' : 'w-[220px] p-3'}`}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-accent">Promo</span>
        <h3 className="mt-1 text-[15px] font-bold leading-tight text-ink">{card.title}</h3>
        {card.description && <p className={`mt-1 text-[12px] text-muted ${compact ? 'line-clamp-2' : ''}`}>{card.description}</p>}
      </button>
    )
  }

  if (variant === 'inbox') {
    return (
      <button
        onClick={handle}
        className={`flex w-full items-start gap-3 rounded-card border border-line bg-white text-left shadow-card ${compact ? 'p-2.5' : 'p-3'}`}
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
      <SmartImage src={card.imageUrl} label={card.title} className={`${compact ? 'h-[68px] w-[68px]' : 'h-[88px] w-[88px]'} shrink-0 object-cover`} />
      <div className={`min-w-0 flex-1 ${compact ? 'p-2.5' : 'p-3'}`}>
        <h3 className="truncate text-[15px] font-bold text-ink">{card.title}</h3>
        {card.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{card.description}</p>}
      </div>
    </button>
  )
}
