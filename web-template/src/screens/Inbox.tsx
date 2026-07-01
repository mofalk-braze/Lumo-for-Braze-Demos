import { useEffect } from 'react'
import { useBraze } from '../braze/BrazeBridgeProvider'
import { AnchorEvents } from '../braze/events'
import { ContentCardInbox } from '../components/ContentCardSlot'
import { usePlacementToggles } from '../placements/usePlacementToggles'

/** The Content Cards "home" — every cloned app gets this inbox surface. */
export function Inbox() {
  const { fireAnchor } = useBraze()
  const { toggles } = usePlacementToggles()

  useEffect(() => {
    fireAnchor(AnchorEvents.SCREEN_VIEWED, { screen: 'inbox', section: 'main' }, 'inbox')
  }, [fireAnchor])

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto bg-surface pb-4">
      <div className="bg-white px-4 pb-3 pt-14">
        <h1 className="text-2xl font-bold text-ink">Inbox</h1>
        <p className="text-sm text-muted">Your messages &amp; offers</p>
      </div>

      <div className="space-y-3 px-4 pt-4">
        <ContentCardInbox compact={toggles.compactCards} />
      </div>
    </div>
  )
}
