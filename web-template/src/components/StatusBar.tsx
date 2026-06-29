import { Wifi } from 'lucide-react'

/** iOS-style status bar overlay — browser harness only. */
export function StatusBar({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const color = theme === 'light' ? '#FFFFFF' : '#1A1A1A'
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-50 flex h-11 items-center justify-between px-7 pt-1"
      style={{ color }}
    >
      <span className="font-sans text-[15px] font-semibold tracking-tight">9:41</span>
      <div className="flex items-center gap-1.5">
        <svg width="18" height="12" viewBox="0 0 18 12" fill={color} aria-hidden>
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5" width="3" height="7" rx="1" />
          <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" opacity="0.4" />
        </svg>
        <Wifi size={16} color={color} strokeWidth={2.4} />
        <div className="flex items-center gap-0.5">
          <div
            className="flex h-[12px] w-[24px] items-center justify-center rounded-[3px] border"
            style={{ borderColor: color }}
          >
            <span className="text-[7.5px] font-bold leading-none" style={{ color }}>
              82
            </span>
          </div>
          <div className="h-[4px] w-[1.5px] rounded-r" style={{ background: color }} />
        </div>
      </div>
    </div>
  )
}

export const STATUS_BAR_HEIGHT = 44
