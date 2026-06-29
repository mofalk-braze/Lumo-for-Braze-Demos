import type { AnchorEventName } from '../braze/events'
import { activeBrandConfig } from './activeDemoConfig.generated'

// ---------------------------------------------------------------------------
// BrandConfig — the single source of per-app truth. Cloning an app from
// screenshots = fill this in + build the screens. The Braze spine, bridge,
// anchor events, and Control Room presets never change.
// ---------------------------------------------------------------------------

export interface FlavorEvent {
  /** snake_case, follows the same nomenclature as anchors. */
  name: string
  label: string
  /** Which anchor this rolls up to (for reliable triggering & EVENT_MAP). */
  anchor: AnchorEventName
  /** If true, firing this flavor event ALSO emits its mapped anchor. */
  emitAnchor?: boolean
  sample?: Record<string, unknown>
}

export interface TabConfig {
  id: string
  label: string
  /** lucide-react icon name. */
  icon: string
}

export interface BrandConfig {
  appName: string
  displayName: string
  tagline?: string
  /** Short word/initials used by the placeholder logo. */
  logoText: string
  colors: {
    brand: string
    brandDark: string
    brandLight: string
    accent: string
    ink: string
    muted: string
    line: string
    surface: string
  }
  /** Bottom-nav tabs, in order. First is the default route. */
  tabs: TabConfig[]
  /** App-specific events for storytelling. Triggers should still target anchors. */
  flavorEvents: FlavorEvent[]
  demoUser: {
    externalId: string
    firstName: string
    /** Keyed by StandardAttributes (+ any app-specific keys). */
    attributes: Record<string, unknown>
  }
}

export const brandConfig: BrandConfig = activeBrandConfig
