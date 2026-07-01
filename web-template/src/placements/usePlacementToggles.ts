import { useCallback, useEffect, useState } from 'react'
import { appContent, type PlacementToggleDefaults } from '../brand/content'

export type PlacementToggleKey = keyof PlacementToggleDefaults

const STORAGE_KEY = 'lumo.placementToggles.v1'
const CHANGE_EVENT = 'lumo-placement-toggles-changed'

const fallbackToggles: PlacementToggleDefaults = {
  hero: true,
  homeFeed: true,
  inlineModule: true,
  inboxTab: true,
  accountPanel: true,
  compactCards: false,
}

export const placementToggleLabels: Record<PlacementToggleKey, { label: string; detail: string }> = {
  hero: {
    label: 'Hero card',
    detail: 'Top promotional Content Card on Home.',
  },
  homeFeed: {
    label: 'For you rail',
    detail: 'Horizontal card rail in the Home feed.',
  },
  inlineModule: {
    label: 'Inline module',
    detail: 'Contextual card between local content rails.',
  },
  inboxTab: {
    label: 'Inbox tab',
    detail: 'Persistent Content Cards in navigation.',
  },
  accountPanel: {
    label: 'Account panel',
    detail: 'Personalized card in Account.',
  },
  compactCards: {
    label: 'Compact cards',
    detail: 'Tighter rendering for placement demos.',
  },
}

export const placementToggleOrder: PlacementToggleKey[] = [
  'hero',
  'homeFeed',
  'inlineModule',
  'inboxTab',
  'accountPanel',
  'compactCards',
]

function defaults(): PlacementToggleDefaults {
  return appContent.placementPlayground?.toggles ?? fallbackToggles
}

function readToggles(): PlacementToggleDefaults {
  if (typeof window === 'undefined') return defaults()
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as Partial<PlacementToggleDefaults>
    return { ...defaults(), ...stored }
  } catch {
    return defaults()
  }
}

function writeToggles(next: PlacementToggleDefaults) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }))
}

export function usePlacementToggles() {
  const [toggles, setTogglesState] = useState<PlacementToggleDefaults>(() => readToggles())

  useEffect(() => {
    const sync = () => setTogglesState(readToggles())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const setToggle = useCallback((key: PlacementToggleKey, value: boolean) => {
    const next = { ...readToggles(), [key]: value }
    setTogglesState(next)
    writeToggles(next)
  }, [])

  const toggle = useCallback(
    (key: PlacementToggleKey) => setToggle(key, !readToggles()[key]),
    [setToggle],
  )

  return { toggles, setToggle, toggle }
}
