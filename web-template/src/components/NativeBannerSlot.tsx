import { useEffect, useRef } from 'react'
import { getBridge, isInShell } from '../braze/bridge'

export function NativeBannerSlot({ placement, height = 96, refreshKey = '' }: { placement: string; height?: number; refreshKey?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bridge = getBridge()
    const update = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      bridge.mountBanner(placement, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: window.innerWidth })
    }
    update()
    bridge.requestBannersRefresh([placement])
    const observer = new ResizeObserver(update)
    if (ref.current) observer.observe(ref.current)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      bridge.unmountBanner(placement)
    }
  }, [placement, refreshKey])

  return <div ref={ref} style={{ height }} className="relative w-full overflow-hidden rounded-card bg-transparent">{!isInShell() && <div className="flex h-full items-center justify-center border border-dashed border-line text-xs text-muted">Banner placement preview: {placement}</div>}</div>
}
