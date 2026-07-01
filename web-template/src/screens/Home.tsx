import { useEffect, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { useBraze } from '../braze/BrazeBridgeProvider'
import { AnchorEvents } from '../braze/events'
import { brandConfig } from '../brand/brandConfig'
import { appContent, contentCardSurfaceByPlacement, type ContentItem } from '../brand/content'
import { BrandLogo, PointsBadge, Section, SectionHeader, Chip } from '../components/ui'
import { ContentCardSlot } from '../components/ContentCardSlot'
import { ItemCard } from '../components/ItemCard'
import {
  placementToggleLabels,
  placementToggleOrder,
  usePlacementToggles,
  type PlacementToggleKey,
} from '../placements/usePlacementToggles'

export function Home() {
  const { firstName, points, fireAnchor } = useBraze()
  const { toggles, setToggle } = usePlacementToggles()
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    fireAnchor(AnchorEvents.SCREEN_VIEWED, { screen: 'home', section: 'main' }, 'home')
  }, [fireAnchor])

  const heroSurface = contentCardSurfaceByPlacement('hero')
  const homeFeedSurface = contentCardSurfaceByPlacement('home')
  const inlineSurface = contentCardSurfaceByPlacement('inline')
  const placementPlaygroundEnabled = Boolean(appContent.placementPlayground)

  const openItem = (item: ContentItem) =>
    fireAnchor(
      AnchorEvents.CONTENT_VIEWED,
      { id: item.id, name: item.title, category: item.category, type: 'product', price: item.meta },
      item.title,
    )

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto bg-surface pb-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-dark to-brand px-4 pb-5 pt-14 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo size={32} />
            <span className="text-lg font-bold">{brandConfig.appName}</span>
          </div>
          <div className="flex items-center gap-2">
            <PointsBadge points={points} />
            {placementPlaygroundEnabled && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/16 text-white shadow-sm"
                aria-label="Open placement settings"
              >
                <SlidersHorizontal size={17} />
              </button>
            )}
          </div>
        </div>
        <h1 className="mt-4 text-2xl font-bold leading-tight">Hi {firstName}</h1>
        <p className="text-sm text-white/85">{brandConfig.tagline}</p>
      </div>

      {/* Categories (local) */}
      <Section className="no-scrollbar snap-x-rail mt-4 flex gap-2 overflow-x-auto pb-1">
        {appContent.categories.map((c) => (
          <button
            key={c}
            onClick={() => fireAnchor(AnchorEvents.CONTENT_VIEWED, { type: 'category', name: c.toLowerCase() }, c)}
          >
            <Chip>{c}</Chip>
          </button>
        ))}
      </Section>

      {/* Hero (local merchandising) */}
      <Section className="mt-4">
        <button
          onClick={() =>
            fireAnchor(
              AnchorEvents.OFFER_INTERACTION,
              { offer_id: 'home_hero', offer_name: appContent.hero.title, surface: 'home_hero', action: 'tapped' },
              appContent.hero.title,
            )
          }
          className="flex w-full flex-col rounded-card bg-gradient-to-br from-brand to-brand-dark p-5 text-left text-white shadow-card"
        >
          <h2 className="text-xl font-bold leading-tight">{appContent.hero.title}</h2>
          {appContent.hero.subtitle && <p className="mt-1 text-sm text-white/85">{appContent.hero.subtitle}</p>}
          {appContent.hero.cta && (
            <span className="mt-3 inline-block w-fit rounded-full bg-white px-4 py-1.5 text-sm font-bold text-brand">
              {appContent.hero.cta}
            </span>
          )}
        </button>
      </Section>

      {toggles.hero && heroSurface && (
        <ContentCardSlot surface={heroSurface} className="mt-4" compact={toggles.compactCards} />
      )}

      {toggles.homeFeed && homeFeedSurface && (
        <ContentCardSlot surface={homeFeedSurface} compact={toggles.compactCards} />
      )}

      {/* Local content rails (always present → never empty) */}
      {appContent.rails.map((rail, index) => (
        <div key={rail.id}>
          <Section className="mt-5">
            <SectionHeader title={rail.title} />
            <div className="no-scrollbar snap-x-rail flex gap-3 overflow-x-auto pb-1">
              {rail.items.map((item) => (
                <ItemCard key={item.id} item={item} onClick={openItem} />
              ))}
            </div>
          </Section>
          {index === 0 && toggles.inlineModule && inlineSurface && (
            <ContentCardSlot surface={inlineSurface} compact={toggles.compactCards} />
          )}
        </div>
      ))}

      {placementPlaygroundEnabled && settingsOpen && (
        <PlacementSettingsSheet
          toggles={toggles}
          onToggle={setToggle}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

function PlacementSettingsSheet({
  toggles,
  onToggle,
  onClose,
}: {
  toggles: Record<PlacementToggleKey, boolean>
  onToggle: (key: PlacementToggleKey, value: boolean) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-4 pb-4">
      <div className="w-full max-w-[390px] rounded-[18px] bg-white p-4 shadow-[0_20px_60px_rgba(23,19,31,0.28)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold leading-tight text-ink">Card placements</h2>
            <p className="mt-1 text-[12px] leading-snug text-muted">Local preview controls. These do not send data to Braze.</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted"
            aria-label="Close placement settings"
          >
            <X size={17} />
          </button>
        </div>

        <div className="space-y-2">
          {placementToggleOrder.map((key) => (
            <button
              key={key}
              onClick={() => onToggle(key, !toggles[key])}
              className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 text-left"
              aria-pressed={toggles[key]}
            >
              <span className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${toggles[key] ? 'bg-brand' : 'bg-line'}`}>
                <span className={`h-5 w-5 rounded-full bg-white shadow transition ${toggles[key] ? 'translate-x-5' : ''}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-ink">{placementToggleLabels[key].label}</span>
                <span className="block text-[11px] leading-snug text-muted">{placementToggleLabels[key].detail}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
