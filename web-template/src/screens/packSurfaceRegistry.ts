import type { ComponentType } from 'react'

type PackSurfaceModule = {
  demoPackId?: string
  default?: ComponentType
}

// Private app surfaces stay in ignored pack-owned source and always copy into
// the same ignored local-pack container. The adapter opts the active surface
// into the public shell without customer-specific tracked paths or pack ids.
const packSurfaceModules = import.meta.glob<PackSurfaceModule>('./local-pack/pack-app.tsx', {
  eager: true,
})

export function resolvePackAppSurface(packId: string): ComponentType | null {
  for (const module of Object.values(packSurfaceModules)) {
    if (module.demoPackId === packId && module.default) return module.default
  }
  return null
}
