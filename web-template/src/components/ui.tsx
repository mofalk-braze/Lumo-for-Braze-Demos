import type { ReactNode } from 'react'
import { brandConfig } from '../brand/brandConfig'

/** Rounded-square placeholder logo from brandConfig.logoText. */
export function BrandLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-brand font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {brandConfig.logoText}
    </div>
  )
}

/** Points pill: coin + balance. */
export function PointsBadge({ points }: { points: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 shadow-sm">
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent text-[10px] font-bold text-white">
        ★
      </div>
      <span className="text-base font-bold text-brand">{points}</span>
    </div>
  )
}

export function SectionHeader({
  title,
  action,
  onAction,
  className = '',
}: {
  title: string
  action?: string
  onAction?: () => void
  className?: string
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className={`text-[19px] font-bold text-ink ${className}`}>{title}</h2>
      {action && (
        <button onClick={onAction} className="text-sm font-semibold text-brand">
          {action}
        </button>
      )}
    </div>
  )
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-ink shadow-sm">
      {children}
    </span>
  )
}

export function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`px-4 ${className}`}>{children}</section>
}
