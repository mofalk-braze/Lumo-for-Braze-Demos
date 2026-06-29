import { useState } from 'react'
import { Check, Plus, RefreshCw } from 'lucide-react'
import { useBraze } from '../braze/BrazeBridgeProvider'
import type { CredentialProfile } from '../braze/bridge'
import { brandConfig } from '../brand/brandConfig'
import { BrandLogo } from '../components/ui'

/** Friendly cluster labels → Braze SDK endpoints (no scheme). */
const CLUSTERS: { label: string; endpoint: string }[] = [
  { label: 'US-01', endpoint: 'sdk.iad-01.braze.com' },
  { label: 'US-02', endpoint: 'sdk.iad-02.braze.com' },
  { label: 'US-03', endpoint: 'sdk.iad-03.braze.com' },
  { label: 'US-04', endpoint: 'sdk.iad-04.braze.com' },
  { label: 'US-05', endpoint: 'sdk.iad-05.braze.com' },
  { label: 'US-06', endpoint: 'sdk.iad-06.braze.com' },
  { label: 'US-07', endpoint: 'sdk.iad-07.braze.com' },
  { label: 'US-08', endpoint: 'sdk.iad-08.braze.com' },
  { label: 'EU-01', endpoint: 'sdk.fra-01.braze.eu' },
  { label: 'EU-02', endpoint: 'sdk.fra-02.braze.eu' },
]

/** In-app Braze workspace setup — the SC pastes a key, picks a cluster, and
 *  connects. Profiles are saved (native UserDefaults) so the same demo can be
 *  re-run later without re-entering anything. */
export function Setup({ onDone }: { onDone?: () => void }) {
  const { profiles, connection, saveProfile, selectProfile } = useBraze()

  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState(CLUSTERS[2].endpoint)
  const [externalId, setExternalId] = useState(brandConfig.demoUser.externalId)
  const [firstName, setFirstName] = useState(brandConfig.demoUser.firstName)
  const [lastName, setLastName] = useState('')
  const [initials, setInitials] = useState('')
  const [homeLocation, setHomeLocation] = useState(String(brandConfig.demoUser.attributes.home_location ?? ''))
  const [homeAddress, setHomeAddress] = useState(String(brandConfig.demoUser.attributes.home_address ?? ''))
  const [loyaltyTier, setLoyaltyTier] = useState(String(brandConfig.demoUser.attributes.loyalty_tier ?? ''))
  const [loyaltyPoints, setLoyaltyPoints] = useState(String(brandConfig.demoUser.attributes.loyalty_points ?? ''))
  const [favoriteCategories, setFavoriteCategories] = useState(
    Array.isArray(brandConfig.demoUser.attributes.favorite_categories)
      ? brandConfig.demoUser.attributes.favorite_categories.join(', ')
      : '',
  )
  const [webURL, setWebURL] = useState('')

  const canSave = Boolean(name.trim() && apiKey.trim() && endpoint && externalId.trim())

  const handleSave = () => {
    if (!canSave) return
    saveProfile({
      name: name.trim(),
      apiKey: apiKey.trim(),
      endpoint,
      externalId: externalId.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      initials: initials.trim(),
      homeLocation: homeLocation.trim(),
      homeAddress: homeAddress.trim(),
      loyaltyTier: loyaltyTier.trim(),
      loyaltyPoints: loyaltyPoints.trim() ? Number(loyaltyPoints) : undefined,
      favoriteCategories: favoriteCategories
        .split(',')
        .map((category) => category.trim())
        .filter(Boolean),
      webURL: webURL.trim() || undefined,
    })
    onDone?.()
  }

  const exportProfiles = () => {
    navigator.clipboard?.writeText(JSON.stringify(profiles, null, 2))
  }
  const importProfiles = () => {
    const raw = window.prompt('Paste profiles JSON:')
    if (!raw) return
    try {
      const list = JSON.parse(raw) as CredentialProfile[]
      list.forEach((p) => saveProfile(p))
    } catch {
      /* ignore malformed paste */
    }
  }

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto bg-surface">
      <div className="bg-brand px-5 pb-6 pt-14 text-white">
        <div className="flex items-center gap-2">
          <BrandLogo size={34} />
          <span className="text-lg font-bold">{brandConfig.appName}</span>
        </div>
        <h1 className="mt-4 text-2xl font-bold leading-tight">Connect to Braze</h1>
        <p className="text-sm text-white/85">Point this app at a Braze workspace.</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold">
          <span className={`h-2 w-2 rounded-full ${connection.connected ? 'bg-emerald-300' : 'bg-amber-300'}`} />
          {connection.label}
        </div>
      </div>

      {/* Saved profiles */}
      {profiles.length > 0 && (
        <div className="px-5 pt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Saved workspaces</p>
          <div className="space-y-2">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => p.id && selectProfile(p.id)}
                className={`flex w-full items-center justify-between rounded-card border bg-white p-3 text-left ${
                  p.active ? 'border-brand ring-1 ring-brand' : 'border-line'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink">{p.name}</p>
                  <p className="truncate text-[12px] text-muted">{p.endpoint} · {p.externalId}</p>
                  {p.webURL && <p className="truncate text-[11px] text-muted/80">Override: {p.webURL}</p>}
                </div>
                {p.active && <Check size={18} className="shrink-0 text-brand" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* New / edit profile form */}
      <div className="px-5 pt-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Add a workspace</p>
        <div className="space-y-3 rounded-card border border-line bg-white p-4">
          <Field label="Profile name" value={name} onChange={setName} placeholder="e.g. Lumo Demo (US-03)" />
          <Field label="SDK API key" value={apiKey} onChange={setApiKey} placeholder="xxxxxxxx-xxxx-…" mono />
          <Field label="External user ID" value={externalId} onChange={setExternalId} placeholder="demo-user" mono />
          <div className="grid grid-cols-2 gap-2">
            <Field label="First name" value={firstName} onChange={setFirstName} placeholder="Alex" />
            <Field label="Last name" value={lastName} onChange={setLastName} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Initials" value={initials} onChange={setInitials} placeholder="Auto" />
            <Field label="Home location" value={homeLocation} onChange={setHomeLocation} placeholder="Berlin" />
          </div>
          <Field label="Home address" value={homeAddress} onChange={setHomeAddress} placeholder="Karl-Liebknecht-Straße 29" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Loyalty tier" value={loyaltyTier} onChange={setLoyaltyTier} placeholder="Champion" />
            <Field label="Loyalty points" value={loyaltyPoints} onChange={setLoyaltyPoints} placeholder="830" />
          </div>
          <Field
            label="Favorite categories"
            value={favoriteCategories}
            onChange={setFavoriteCategories}
            placeholder="restaurants, grocery, offers"
          />
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-muted">SDK endpoint</label>
            <select
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[14px] text-ink"
            >
              {CLUSTERS.map((c) => (
                <option key={c.endpoint} value={c.endpoint}>
                  {c.label} — {c.endpoint}
                </option>
              ))}
            </select>
          </div>
          <details className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <summary className="cursor-pointer text-[12px] font-bold text-amber-800">Advanced web source override</summary>
            <p className="mb-2 mt-2 text-[12px] leading-snug text-amber-800">
              Leave this empty for the generated demo runtime. Use it only for local recovery or source diagnostics.
            </p>
            <Field label="Override URL" value={webURL} onChange={setWebURL} placeholder="http://localhost:5173 or https://..." mono />
          </details>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            <Plus size={16} /> Save &amp; Connect
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-5 text-[12px] font-semibold text-brand">
        <button onClick={exportProfiles} className="flex items-center gap-1"><RefreshCw size={13} /> Export JSON</button>
        <button onClick={importProfiles}>Import JSON</button>
        {onDone && <button onClick={onDone} className="text-muted">Done</button>}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-semibold text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[14px] text-ink placeholder:text-muted/50 ${
          mono ? 'font-mono text-[12px]' : ''
        }`}
      />
    </div>
  )
}
