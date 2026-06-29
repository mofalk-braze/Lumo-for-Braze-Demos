import { useLocation, useNavigate } from 'react-router-dom'
import { brandConfig } from '../brand/brandConfig'
import { resolveIcon } from './icons'

/** Bottom tab bar driven by brandConfig.tabs. */
export function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const active = pathname === '/' ? brandConfig.tabs[0].id : pathname.slice(1)

  return (
    <nav className="z-40 flex shrink-0 items-stretch justify-around border-t border-line bg-white px-2 pb-6 pt-2 shadow-nav">
      {brandConfig.tabs.map((tab, i) => {
        const Icon = resolveIcon(tab.icon)
        const isActive = active === tab.id || (i === 0 && pathname === '/')
        return (
          <button
            key={tab.id}
            onClick={() => navigate(i === 0 ? '/' : `/${tab.id}`)}
            className="flex flex-1 flex-col items-center gap-1 py-1"
          >
            <Icon size={22} className={isActive ? 'text-brand' : 'text-muted'} strokeWidth={isActive ? 2.4 : 2} />
            <span className={`text-[11px] font-semibold ${isActive ? 'text-brand' : 'text-muted'}`}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
