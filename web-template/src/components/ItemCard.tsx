import type { ContentItem } from '../brand/content'
import { SmartImage } from './SmartImage'

/** Renders a piece of the app's OWN local content (a product / article / item).
 *  Not a Braze object — this is the app's baseline merchandising. */
export function ItemCard({ item, onClick }: { item: ContentItem; onClick: (item: ContentItem) => void }) {
  return (
    <button
      onClick={() => onClick(item)}
      className="flex w-[150px] shrink-0 flex-col overflow-hidden rounded-card border border-line bg-white text-left shadow-card"
    >
      <div className="relative">
        <SmartImage src={item.image} label={item.title} className="h-[110px] w-full object-cover" />
        {item.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-brand-accent px-2 py-0.5 text-[10px] font-bold text-white">
            {item.badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{item.title}</p>
        {item.subtitle && <p className="mt-0.5 text-[11px] text-muted">{item.subtitle}</p>}
        {item.meta && <p className="mt-1 text-[14px] font-bold text-brand">{item.meta}</p>}
      </div>
    </button>
  )
}
