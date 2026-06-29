import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useBraze } from '../braze/BrazeBridgeProvider'
import { brandConfig } from '../brand/brandConfig'
import { BrandLogo } from './ui'

/**
 * iOS-style banner for a REAL foreground push (delivered natively via the bridge),
 * or a dev simulate. Uses the app's OWN logo so a push looks on-brand without a
 * per-brand native build. The push is genuine — this only controls its in-app
 * (foreground) presentation, which is standard iOS app behavior.
 */
export function NotificationBanner() {
  const { push, dismissPush } = useBraze()
  const navigate = useNavigate()

  useEffect(() => {
    if (!push) return
    const t = window.setTimeout(dismissPush, 6000)
    return () => window.clearTimeout(t)
  }, [push, dismissPush])

  if (!push) return null

  return (
    <div className="absolute inset-x-0 top-0 z-[60] px-2 pt-2 animate-fade">
      <button
        onClick={() => {
          dismissPush()
          if (push.uri && push.uri.startsWith('/')) navigate(push.uri)
        }}
        className="flex w-full items-start gap-3 rounded-2xl bg-white/95 p-3 text-left shadow-lg backdrop-blur"
      >
        <BrandLogo size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {brandConfig.appName}
            </span>
            <span className="text-[11px] text-muted">now</span>
          </div>
          <p className="mt-0.5 text-[13px] font-bold leading-snug text-ink">{push.title}</p>
          <p className="line-clamp-2 text-[12px] leading-snug text-muted">{push.body}</p>
        </div>
        <span
          onClick={(e) => {
            e.stopPropagation()
            dismissPush()
          }}
          className="mt-0.5 shrink-0 text-muted"
          aria-label="Dismiss"
        >
          <X size={15} />
        </span>
      </button>
    </div>
  )
}
