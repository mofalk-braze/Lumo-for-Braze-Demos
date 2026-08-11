import { useEffect, useRef, type ReactNode } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useBraze } from './braze/BrazeBridgeProvider'
import { isInShell } from './braze/bridge'
import { BottomNav } from './components/BottomNav'
import { NotificationBanner } from './components/NotificationBanner'
import { PhoneFrame } from './components/PhoneFrame'
import { StatusBar } from './components/StatusBar'
import { BrandLogo } from './components/ui'
import { Home } from './screens/Home'
import { Inbox } from './screens/Inbox'
import { Account } from './screens/Account'
import { Setup } from './screens/Setup'
import { activeDemoPackId } from './brand/activeDemoConfig.generated'
import { WoltAppSurface } from './screens/wolt/WoltApp'
import { AktionMenschAppSurface } from './screens/aktion-mensch/AktionMenschApp'
import { resolvePackAppSurface } from './screens/packSurfaceRegistry'

/** The app surface: the active screen + bottom nav. Fills its container. */
function AppSurface({ shell }: { shell: boolean }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { navigationRoute } = useBraze()
  const lastNavigationRouteId = useRef<number | null>(null)
  const onSetup = pathname === '/setup'

  useEffect(() => {
    if (!navigationRoute || lastNavigationRouteId.current === navigationRoute.id) return
    lastNavigationRouteId.current = navigationRoute.id
    if (navigationRoute.route.startsWith('/')) navigate(navigationRoute.route)
  }, [navigationRoute, navigate])

  if (activeDemoPackId === 'wolt-food-delivery') {
    return (
      <>
        {!shell && <StatusBar theme="dark" />}
        <Routes>
          <Route path="/setup" element={<Setup onDone={() => navigate('/account')} />} />
          <Route path="/*" element={<WoltAppSurface />} />
        </Routes>
        <NotificationBanner />
      </>
    )
  }

  const PackAppSurface = resolvePackAppSurface(activeDemoPackId)
  if (PackAppSurface) {
    return (
      <>
        {!shell && <StatusBar theme="dark" />}
        <Routes>
          <Route path="/setup" element={<Setup onDone={() => navigate('/')} />} />
          <Route path="/*" element={<PackAppSurface />} />
        </Routes>
        <NotificationBanner />
      </>
    )
  }

  if (activeDemoPackId === 'aktion-mensch') {
    return (
      <>
        {!shell && <StatusBar theme="dark" />}
        <Routes>
          <Route path="/setup" element={<Setup onDone={() => navigate('/')} />} />
          <Route path="/*" element={<AktionMenschAppSurface />} />
        </Routes>
        <NotificationBanner />
      </>
    )
  }

  return (
    <>
      {!shell && <StatusBar theme={pathname === '/' ? 'light' : 'dark'} />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/account" element={<Account />} />
        <Route path="/setup" element={<Setup onDone={() => navigate('/account')} />} />
      </Routes>
      {!onSetup && <BottomNav />}
      <NotificationBanner />
    </>
  )
}

function Splash() {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface">
      <BrandLogo size={48} />
    </div>
  )
}

export default function App() {
  const { connection } = useBraze()
  const shell = isInShell()

  let content: ReactNode
  if (connection.label === '…') content = <Splash /> // awaiting first connection
  else if (shell && connection.setupNeeded) content = <Setup /> // native emergency setup only
  else content = <AppSurface shell={shell} />

  // In native shells the platform supplies device chrome.
  if (shell) return <div className="relative flex h-full flex-col bg-white">{content}</div>

  // Browser layout harness: render surface only. Controls live in Braze Demo Control Room.
  return (
    <div className="flex min-h-screen items-start justify-center p-6">
      <PhoneFrame>{content}</PhoneFrame>
    </div>
  )
}
