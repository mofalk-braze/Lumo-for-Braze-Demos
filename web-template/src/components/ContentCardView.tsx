import { useEffect } from 'react'
import { ChevronRight, X } from 'lucide-react'
import type { NormalizedCard } from '../braze/bridge'
import { SmartImage } from './SmartImage'

/** Renders a real Braze Content Card. `variant` adapts the layout per surface.
 *  Content Cards are data the app renders — this IS the channel, not a stand-in. */
export function ContentCardView({
  card,
  variant = 'feed',
  onClick,
  onImpression,
  onDismiss,
}: {
  card: NormalizedCard
  variant?: 'hero' | 'carousel' | 'feed' | 'inbox' | 'inboxEditorial'
  onClick: (card: NormalizedCard) => void
  onImpression?: (card: NormalizedCard) => void
  onDismiss?: (card: NormalizedCard) => void
}) {
  const handle = () => onClick(card)
  const dismiss = () => onDismiss?.(card)

  useEffect(() => {
    onImpression?.(card)
  }, [card, onImpression])

  if (variant === 'hero') {
    return (
      <button
        onClick={handle}
        className="animate-fade relative flex w-full overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-dark p-4 text-left text-white shadow-card"
      >
        {card.imageUrl && (
          <>
            <SmartImage
              src={card.imageUrl}
              label={card.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-brand-dark/60" />
          </>
        )}
        <div className="relative flex-1">
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
      <div className="relative w-[220px] shrink-0 overflow-hidden rounded-card border border-line bg-white shadow-card">
        {onDismiss && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Content Card entfernen"
            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-muted shadow-sm"
          >
            <X size={14} />
          </button>
        )}
        <button onClick={handle} className="flex min-h-[112px] w-full flex-col text-left">
          {card.imageUrl && (
            <SmartImage
              src={card.imageUrl}
              label={card.title}
              className="h-[96px] w-full object-cover"
            />
          )}
          <div className="p-3 pr-10">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-accent">Promo</span>
            <h3 className="mt-1 text-[15px] font-bold leading-tight text-ink">{card.title}</h3>
            {card.description && <p className="mt-1 text-[12px] text-muted">{card.description}</p>}
          </div>
        </button>
      </div>
    )
  }

  if (variant === 'inbox') {
    return (
      <div className="flex w-full items-start gap-2 rounded-card border border-line bg-white p-3 shadow-card">
        <button onClick={handle} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
          {card.imageUrl && (
            <SmartImage
              src={card.imageUrl}
              label={card.title}
              className="h-[64px] w-[64px] shrink-0 rounded-md object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-bold leading-snug text-ink">{card.title}</h3>
            {card.description && <p className="mt-0.5 text-[12px] leading-snug text-muted">{card.description}</p>}
          </div>
          <ChevronRight size={16} className="mt-1 shrink-0 text-muted" />
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Content Card entfernen"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted"
          >
            <X size={14} />
          </button>
        )}
      </div>
    )
  }

  if (variant === 'inboxEditorial') {
    const cta = card.extras.cta || 'Mehr erfahren'
    return (
      <article className="relative w-full overflow-hidden rounded-[24px] border border-line bg-white shadow-card">
        {onDismiss && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Content Card entfernen"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-muted shadow-sm"
          >
            <X size={17} />
          </button>
        )}
        <button type="button" onClick={handle} className="block w-full text-left">
          {card.imageUrl && (
            <SmartImage
              src={card.imageUrl}
              label={card.title}
              className="h-[178px] w-full object-cover"
            />
          )}
          <div className="p-5">
            <div className="flex items-start gap-3">
              <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[19px] font-bold leading-[1.2] tracking-[-0.02em] text-ink">{card.title}</h3>
                {card.description && (
                  <p className="mt-2 text-[14px] leading-5 text-muted">{card.description}</p>
                )}
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink">
                  {cta}
                  <ChevronRight size={17} className="text-muted" />
                </span>
              </div>
            </div>
          </div>
        </button>
      </article>
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
