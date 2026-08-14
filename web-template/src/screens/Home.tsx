import { useEffect } from 'react'
import { useBraze } from '../braze/BrazeBridgeProvider'
import { AnchorEvents } from '../braze/events'
import { brandConfig } from '../brand/brandConfig'
import { appContent, bannerSurfacesForScreen, contentCardSurfaceForScreen, type ContentItem } from '../brand/content'
import { BrandLogo, PointsBadge, Section, SectionHeader, Chip } from '../components/ui'
import { ContentCardSlot } from '../components/ContentCardSlot'
import { ItemCard } from '../components/ItemCard'
import { NativeBannerSlot } from '../components/NativeBannerSlot'

export function Home() {
  const { firstName, points, fireAnchor } = useBraze()

  useEffect(() => {
    fireAnchor(AnchorEvents.SCREEN_VIEWED, { screen: 'home', section: 'main' }, 'home')
  }, [fireAnchor])

  const contentCardSurface = contentCardSurfaceForScreen('home')
  const bannerSurfaces = bannerSurfacesForScreen('home')

  const openItem = (item: ContentItem) =>
    fireAnchor(
      AnchorEvents.CONTENT_VIEWED,
      { id: item.id, name: item.title, category: item.category, type: 'product', price: item.meta },
      item.title,
    )

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto bg-surface pb-4">
      {/* Header */}
      <div className="bg-brand px-4 pb-5 pt-14 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo size={32} />
            <span className="text-lg font-bold">{brandConfig.appName}</span>
          </div>
          <PointsBadge points={points} />
        </div>
        <h1 className="mt-4 text-2xl font-bold leading-tight">Hi {firstName} 👋</h1>
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

      {bannerSurfaces.map((surface) => (
        <Section key={surface.id} className="mt-4">
          <NativeBannerSlot placement={surface.placement} height={surface.height} />
        </Section>
      ))}

      {contentCardSurface && <ContentCardSlot surface={contentCardSurface} />}

      {/* Local content rails (always present → never empty) */}
      {appContent.rails.map((rail) => (
        <Section key={rail.id} className="mt-5">
          <SectionHeader title={rail.title} />
          <div className="no-scrollbar snap-x-rail flex gap-3 overflow-x-auto pb-1">
            {rail.items.map((item) => (
              <ItemCard key={item.id} item={item} onClick={openItem} />
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}
