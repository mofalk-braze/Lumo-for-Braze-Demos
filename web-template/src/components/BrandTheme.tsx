import { useEffect, type ReactNode } from 'react'
import { brandConfig } from '../brand/brandConfig'

/** Applies the active brand's colors as CSS variables so Tailwind's brand-*
 *  utilities resolve at runtime. Cloning a brand = change brandConfig colors. */
export function BrandTheme({ children }: { children: ReactNode }) {
  useEffect(() => {
    const c = brandConfig.colors
    const root = document.documentElement.style
    root.setProperty('--brand', c.brand)
    root.setProperty('--brand-dark', c.brandDark)
    root.setProperty('--brand-light', c.brandLight)
    root.setProperty('--brand-accent', c.accent)
    root.setProperty('--ink', c.ink)
    root.setProperty('--muted', c.muted)
    root.setProperty('--line', c.line)
    root.setProperty('--surface', c.surface)
    document.title = `${brandConfig.displayName} — Braze Demo`
  }, [])

  return <>{children}</>
}
