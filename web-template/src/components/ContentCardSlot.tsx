import { Inbox as InboxIcon } from 'lucide-react'
import { useBraze } from '../braze/BrazeBridgeProvider'
import type { ContentCardSurface } from '../brand/content'
import { ContentCardView } from './ContentCardView'
import { Section, SectionHeader } from './ui'

function limited<T>(items: T[], max?: number): T[] {
  return max && max > 0 ? items.slice(0, max) : items
}

function listClassFor(surface: ContentCardSurface): string {
  if (surface.variant === 'carousel') {
    return 'no-scrollbar snap-x-rail flex gap-3 overflow-x-auto pb-1'
  }
  if (surface.variant === 'hero') return 'space-y-3'
  return 'space-y-3'
}

export function ContentCardSlot({
  surface,
  className = 'mt-5',
  titleClassName = '',
  listClassName,
}: {
  surface: ContentCardSurface
  className?: string
  titleClassName?: string
  listClassName?: string
}) {
  const { cardsForPlacement, clickCard, impressCard } = useBraze()
  const cards = limited(cardsForPlacement(surface.placement), surface.maxCards)

  if (cards.length === 0 && surface.emptyBehavior === 'hide') return null

  return (
    <Section className={className}>
      {surface.title && <SectionHeader title={surface.title} className={titleClassName} />}
      {cards.length === 0 ? (
        <ContentCardEmptyState />
      ) : (
        <div className={listClassName ?? listClassFor(surface)}>
          {cards.map((card) => (
            <ContentCardView
              key={card.id}
              card={card}
              variant={surface.variant}
              onClick={clickCard}
              onImpression={impressCard}
            />
          ))}
        </div>
      )}
    </Section>
  )
}

export function ContentCardInbox({
  placement = 'inbox',
  maxCards,
}: {
  placement?: string
  maxCards?: number
}) {
  const { cardsForPlacement, clickCard, impressCard } = useBraze()
  const cards = limited(cardsForPlacement(placement), maxCards)

  if (cards.length === 0) return <ContentCardEmptyState />

  return (
    <>
      {cards.map((card) => (
        <ContentCardView
          key={card.id}
          card={card}
          variant="inbox"
          onClick={clickCard}
          onImpression={impressCard}
        />
      ))}
    </>
  )
}

function ContentCardEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-muted">
      <InboxIcon size={40} className="text-line" />
      <p className="text-sm">No messages yet.</p>
      <p className="text-xs">Content Cards sent from Braze land here.</p>
    </div>
  )
}
