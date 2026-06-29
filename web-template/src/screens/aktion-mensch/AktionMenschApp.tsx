import { useEffect, useState, type ReactNode } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleUserRound,
  Clipboard,
  Cloud,
  Clover,
  Home,
  Info,
  Menu,
  ScanLine,
  Ticket,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useBraze } from '../../braze/BrazeBridgeProvider'
import { AnchorEvents } from '../../braze/events'
import { appContent, type AktionMenschContent, type AktionMenschHomeCard } from '../../brand/content'
import { ContentCardView } from '../../components/ContentCardView'
import { SmartImage } from '../../components/SmartImage'

const aktion = appContent.aktionMensch as AktionMenschContent

export function AktionMenschAppSurface() {
  const [helpTopic, setHelpTopic] = useState<string | null>(null)
  const showHelp = (topic: string) => setHelpTopic(topic)

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#f1f1f1] text-[#282828]">
      <Routes>
        <Route path="/welcome" element={<WelcomeScreen />} />
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route path="/" element={<HomeScreen onHelp={showHelp} />} />
        <Route path="/start" element={<HomeScreen onHelp={showHelp} />} />
        <Route path="/lose" element={<TicketsScreen onHelp={showHelp} />} />
        <Route path="/add-ticket" element={<AddTicketScreen />} />
        <Route path="/pruefen" element={<DrawScreen onHelp={showHelp} />} />
        <Route path="/mehr" element={<MoreScreen onHelp={showHelp} />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
      <AktionBottomNav />
      {helpTopic && <HelpSheet topic={helpTopic} onClose={() => setHelpTopic(null)} />}
    </div>
  )
}

function WelcomeScreen() {
  const navigate = useNavigate()
  useScreenEvent('welcome')

  return (
    <PlainScreen className="bg-white px-5 pb-8 pt-16">
      <div className="flex flex-1 flex-col">
        <div className="flex justify-center pt-28">
          <Logo className="h-24 w-56 object-contain" />
        </div>
        <div className="mt-28">
          <h1 className="text-[34px] font-black leading-tight text-brand">
            Willkommen bei
            <br />
            Aktion Mensch!
          </h1>
          <p className="mt-7 text-[22px] leading-[1.35]">
            Mit unserer App hast du dein Ticket zum Glück immer dabei.
          </p>
          <p className="mt-5 text-[22px] leading-[1.35]">
            Verwalte deine Lose, überprüfe deine Gewinne und erhalte immer die neuesten Informationen zu unseren
            Aktionen.
          </p>
        </div>
        <div className="mt-auto">
          <PrimaryButton onClick={() => navigate('/onboarding')}>Start</PrimaryButton>
        </div>
      </div>
    </PlainScreen>
  )
}

function OnboardingScreen() {
  const navigate = useNavigate()
  useScreenEvent('onboarding_login')

  return (
    <PlainScreen className="bg-white px-5 pb-8 pt-12">
      <div className="mx-auto flex h-[300px] w-[300px] items-center justify-center">
        <TicketIllustration />
      </div>
      <h1 className="mt-6 text-[31px] font-black leading-tight text-brand">
        Einfache Los-Verwaltung
        <br />
        mit Kundenlogin
      </h1>
      <p className="mt-6 text-[22px] leading-[1.35]">
        Melde dich an, um die Lose aus deinem Kundenkonto auch direkt in der App zu sehen. So behältst du stets den
        Überblick.
      </p>
      <div className="mt-auto">
        <div className="mb-6 flex justify-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#282828]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#b7b7b7]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#b7b7b7]" />
        </div>
        <PrimaryButton onClick={() => navigate('/')}>Weiter</PrimaryButton>
      </div>
    </PlainScreen>
  )
}

function HomeScreen({ onHelp }: { onHelp: (topic: string) => void }) {
  const { cardsForPlacement, clickCard, impressCard, fireAnchor } = useBraze()
  const navigate = useNavigate()
  const cards = cardsForPlacement(appContent.contentCardRail.placement)
  useScreenEvent('home')

  return (
    <ScrollScreen>
      <header className="bg-gradient-to-br from-[#fff1f1] via-white to-[#eafff8] px-5 pb-6 pt-12">
        <div className="flex items-center justify-between">
          <Logo className="h-12 w-20 object-contain" />
          <button onClick={() => navigate('/settings')} className="rounded-full p-1" aria-label="Profil">
            <CircleUserRound size={31} strokeWidth={2.8} />
          </button>
        </div>
      </header>

      <section className="bg-white">
        <SmartImage
          src={`${aktion.assetBase}/winner-service.webp`}
          alt="Aktion Mensch Gewinnerin"
          className="h-[245px] w-full object-cover"
        />
        <div className="-mt-7 mx-5 rounded-[8px] bg-white px-4 py-5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
          <p className="text-[24px] leading-none">Nächste Ziehung in</p>
          <div className="mt-5 grid grid-cols-[1fr_12px_1fr_12px_1fr_12px_1fr] items-start gap-1">
            <CountdownUnit value={aktion.nextDraw.days} label="Tagen" />
            <Colon />
            <CountdownUnit value={aktion.nextDraw.hours} label="Stunden" />
            <Colon />
            <CountdownUnit value={aktion.nextDraw.minutes} label="Minuten" />
            <Colon />
            <CountdownUnit value={aktion.nextDraw.seconds} label="Sek." />
          </div>
        </div>
        <div className="mx-5 mt-1 rounded-[8px] bg-white px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <PrimaryButton onClick={() => navigate('/add-ticket')}>Erstes Los hinzufügen</PrimaryButton>
          <PrimaryButton className="mt-3" onClick={() => trackBuyTicket(fireAnchor)}>
            Los kaufen
          </PrimaryButton>
        </div>
      </section>

      <div className="space-y-6 px-5 py-7">
        {aktion.homeCards.map((card) => (
          <HomeCampaignCard key={card.id} card={card} onInfo={() => onHelp('aktion')} />
        ))}

        {cards.length > 0 && (
          <section>
            <h2 className="mb-3 text-[24px] font-black text-brand">{appContent.contentCardRail.title}</h2>
            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
              {cards.map((card) => (
                <ContentCardView
                  key={card.id}
                  card={card}
                  variant="carousel"
                  onClick={clickCard}
                  onImpression={impressCard}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </ScrollScreen>
  )
}

function TicketsScreen({ onHelp }: { onHelp: (topic: string) => void }) {
  const { fireAnchor, fireFlavor } = useBraze()
  const navigate = useNavigate()
  useScreenEvent('lose')

  const addTicket = () => {
    fireFlavor({
      name: 'aktion_los_added',
      label: 'Ticket added',
      anchor: AnchorEvents.CONTENT_ENGAGED,
      emitAnchor: true,
      sample: { product: 'Glücks-Los', surface: 'lose', method: 'manual' },
    })
    navigate('/add-ticket')
  }

  return (
    <ScrollScreen>
      <Header title="Deine Lose" action={<IconButton icon={Info} label="Informationen" onClick={() => onHelp('lose')} />} />
      <section className="space-y-4 px-5 py-6">
        {aktion.products.map((product) => (
          <button
            key={product.id}
            onClick={() =>
              fireAnchor(
                AnchorEvents.CONTENT_VIEWED,
                { type: 'ticket', product: product.name, source: product.source, status: product.status },
                product.name,
              )
            }
            className="w-full rounded-[8px] bg-white p-4 text-left shadow-[0_1px_5px_rgba(0,0,0,0.08)]"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-[5px] bg-[#179b83] text-white">
                <span className="text-[26px] leading-none">
                  Glücks
                  <br />
                  LOS
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[22px] font-black">{product.name}</p>
                <p className="mt-1 text-[15px] text-[#737373]">{product.number}</p>
                <div className="mt-3 flex items-center gap-2 text-[14px] font-bold text-[#159b83]">
                  {product.source === 'Kundenkonto' && <Cloud size={18} />}
                  <span>{product.status}</span>
                </div>
              </div>
              <ChevronRight className="mt-5 text-[#a6a6a6]" />
            </div>
          </button>
        ))}
        <PrimaryButton onClick={addTicket}>Los hinzufügen</PrimaryButton>
        <OutlineButton
          onClick={() =>
            fireAnchor(
              AnchorEvents.LOYALTY_EVENT,
              { action: 'account_link_requested', surface: 'lose' },
              'Kundenkonto verknüpfen',
            )
          }
        >
          Kundenkonto verknüpfen
        </OutlineButton>
      </section>
    </ScrollScreen>
  )
}

function AddTicketScreen() {
  const { fireAnchor, fireFlavor, logPurchase } = useBraze()
  const navigate = useNavigate()
  useScreenEvent('add_ticket')

  const addVia = (method: string) => {
    fireFlavor({
      name: 'aktion_los_added',
      label: 'Ticket added',
      anchor: AnchorEvents.CONTENT_ENGAGED,
      emitAnchor: true,
      sample: { product: 'Glücks-Los', surface: 'add_ticket', method },
    })
    logPurchase('gluecks_los', 18, 'EUR', 1, { method, product: 'Glücks-Los' })
    navigate('/lose')
  }

  return (
    <ScrollScreen>
      <Header title="Dein Los hinzufügen" leading={<IconButton icon={ArrowLeft} label="Zurück" onClick={() => navigate('/lose')} />} />
      <SmartImage
        src={`${aktion.assetBase}/add-ticket-hero.png`}
        alt="Aktion Mensch Lose"
        className="h-[250px] w-full bg-white object-contain"
      />
      <section className="px-8 pt-24">
        <PrimaryButton
          onClick={() =>
            fireAnchor(AnchorEvents.LOYALTY_EVENT, { action: 'account_linked', surface: 'add_ticket' }, 'Kundenkonto')
          }
        >
          Kundenkonto verknüpfen
        </PrimaryButton>
        <OutlineButton className="mt-3" onClick={() => addVia('manual')}>
          <TicketButtonContent icon={Ticket}>Losnummer eingeben</TicketButtonContent>
        </OutlineButton>
        <OutlineButton className="mt-3" onClick={() => addVia('qr_code')}>
          <TicketButtonContent icon={ScanLine}>QR-Code scannen</TicketButtonContent>
        </OutlineButton>
        <OutlineButton className="mt-3" onClick={() => addVia('clipboard')}>
          <TicketButtonContent icon={Clipboard}>Aus Zwischenablage einfügen</TicketButtonContent>
        </OutlineButton>
      </section>
    </ScrollScreen>
  )
}

function DrawScreen({ onHelp }: { onHelp: (topic: string) => void }) {
  const { fireAnchor } = useBraze()
  const [loading, setLoading] = useState(false)
  useScreenEvent('pruefen')

  const checkDraw = () => {
    setLoading(true)
    fireAnchor(
      AnchorEvents.CONTENT_VIEWED,
      { draw_date: '2026-06-21', surface: 'pruefen', has_saved_ticket: true },
      'Ziehung prüfen',
    )
    window.setTimeout(() => setLoading(false), 900)
  }

  return (
    <ScrollScreen>
      <Header title="Ziehung" action={<IconButton icon={Info} label="Informationen" onClick={() => onHelp('ziehung')} />} />
      {loading ? (
        <div className="flex min-h-[560px] flex-col items-center justify-center bg-white">
          <div className="flex items-center gap-4">
            <span className="h-6 w-6 rounded-full bg-[#6d6d6d]" />
            <span className="h-8 w-8 rounded-full bg-[#6d6d6d]" />
            <span className="h-6 w-6 rounded-full bg-[#6d6d6d]" />
          </div>
          <p className="mt-12 text-[26px] font-black text-brand">Einen Augenblick bitte</p>
          <p className="text-[22px]">Die Ziehung wird vorbereitet</p>
        </div>
      ) : (
        <section className="px-5 py-8">
          <h2 className="text-[25px] font-black text-brand">Bekanntgabedatum</h2>
          <p className="mt-4 text-[22px]">{aktion.drawDate}</p>
          <div className="mt-16 space-y-9">
            {aktion.drawRows.map((row, index) => (
              <DrawRow key={row.label} row={row} obscureFrom={index < 3 ? 3 : 1} />
            ))}
          </div>
          <article
            className="mt-12 w-full overflow-hidden rounded-[8px] bg-white text-left shadow-[0_1px_5px_rgba(0,0,0,0.08)]"
          >
            <SmartImage
              src={`${aktion.assetBase}/draw-winner.webp`}
              alt="Aktion Mensch Gewinnerin"
              className="h-[220px] w-full object-cover"
            />
            <div className="rounded-t-[18px] bg-[#c7f5df] px-5 py-7">
              <h3 className="text-[34px] font-black leading-tight text-brand">Dein Glück wartet schon auf dich</h3>
              <p className="mt-4 text-[24px] leading-tight">Sichere dir jetzt dein Los</p>
              <PrimaryButton className="mt-8" onClick={checkDraw}>Los auswählen</PrimaryButton>
            </div>
          </article>
          <p className="mt-12 text-[16px] leading-relaxed">
            Alle Angaben ohne Gewähr. Die Anzeige der Gewinnkategorien ist teilweise verkürzt, damit du sie schneller
            erfassen kannst.
          </p>
        </section>
      )}
    </ScrollScreen>
  )
}

function MoreScreen({ onHelp }: { onHelp: (topic: string) => void }) {
  const navigate = useNavigate()
  useScreenEvent('mehr')

  return (
    <ScrollScreen>
      <Header title="Einstellungen" compact />
      <section className="space-y-8 px-5 py-8">
        <ListGroup label="Hilfe">
          <ListRow label="Fragen und Antworten" onClick={() => onHelp('fragen')} />
          <ListRow label="Nachricht schreiben" onClick={() => onHelp('kontakt')} />
        </ListGroup>
        <ListGroup label="Informationen">
          {aktion.settings.moreLinks.slice(2).map((link) => (
            <ListRow key={link} label={link} onClick={() => onHelp(link)} />
          ))}
        </ListGroup>
        <OutlineButton onClick={() => navigate('/settings')}>Anmelden</OutlineButton>
        <p className="text-[17px] leading-relaxed">
          Veranstalter der Lotterie ist ausschließlich Aktion Mensch. Apple als Betreiber des App Stores ist weder für
          die Durchführung der Lotterie noch für die Bereitstellung der Gewinne verantwortlich.
        </p>
      </section>
    </ScrollScreen>
  )
}

function SettingsScreen() {
  const { fireAnchor, setAttribute } = useBraze()
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {}
    aktion.settings.sections.forEach((section) =>
      section.items.forEach((item) => {
        result[item.id] = Boolean(item.defaultOn)
      }),
    )
    return result
  })
  useScreenEvent('settings')

  const toggle = (id: string) => {
    setToggles((current) => {
      const next = !current[id]
      const attr = id.replace(/-/g, '_')
      setAttribute(attr, next)
      fireAnchor(AnchorEvents.PREFERENCE_UPDATED, { preference: attr, value: next, surface: 'settings' }, attr)
      return { ...current, [id]: next }
    })
  }

  return (
    <ScrollScreen>
      <Header title="Einstellungen" />
      <section className="space-y-8 px-5 py-8">
        <button className="flex w-full items-center gap-5 rounded-[8px] bg-white p-5 text-left">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-brand text-brand">
            <CircleUserRound size={38} strokeWidth={1.7} />
          </span>
          <span className="flex-1 text-[29px]">Anmelden</span>
          <ChevronRight className="text-[#a6a6a6]" />
        </button>
        {aktion.settings.sections.map((section) => (
          <div key={section.label}>
            <h2 className="mb-3 px-5 text-[17px] uppercase tracking-normal text-[#737373]">{section.label}</h2>
            <div className="overflow-hidden rounded-[8px] bg-white">
              {section.items.map((item) => (
                <div key={item.id} className="border-b border-[#d9d9d9] last:border-b-0">
                  <div className="flex items-center gap-4 p-5">
                    <span className="min-w-0 flex-1 text-[24px] leading-tight">{item.label}</span>
                    {item.kind === 'toggle' ? (
                      <Switch checked={toggles[item.id]} onClick={() => toggle(item.id)} />
                    ) : (
                      <ChevronRight className="text-[#a6a6a6]" />
                    )}
                  </div>
                  {item.description && <p className="-mt-2 px-5 pb-5 text-[17px] leading-snug text-[#737373]">{item.description}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </ScrollScreen>
  )
}

function HelpSheet({ topic, onClose }: { topic: string; onClose: () => void }) {
  const { fireFlavor } = useBraze()

  useEffect(() => {
    fireFlavor({
      name: 'aktion_help_opened',
      label: 'Help opened',
      anchor: AnchorEvents.CONTENT_VIEWED,
      sample: { topic, surface: 'help_sheet' },
    })
  }, [fireFlavor, topic])

  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/85">
      <div className="max-h-[92%] w-full overflow-hidden rounded-t-[14px] bg-white">
        <div className="sticky top-0 z-10 grid grid-cols-[44px_1fr_44px] items-center border-b border-[#d9d9d9] bg-white px-4 py-5">
          <span />
          <h2 className="text-center text-[22px] font-black text-brand">Hilfe und Informationen</h2>
          <button onClick={onClose} aria-label="Schließen">
            <X size={34} />
          </button>
        </div>
        <div className="no-scrollbar max-h-[720px] overflow-y-auto px-5 pb-10">
          <SmartImage
            src={`${aktion.assetBase}/gluecks-los.png`}
            alt="Glücks-Los"
            className="mx-auto mt-8 max-h-[210px] w-full object-contain"
          />
          <h3 className="mt-6 text-[31px] font-black leading-tight text-brand">Lose aus dem Kundenkonto</h3>
          <p className="mt-6 text-[22px] leading-[1.35]">
            Wenn du deine Lose über das Kundenkonto gekauft hast, sind sie automatisch in der App. Du erkennst sie an
            dem Wolken-Symbol.
          </p>
          <p className="mt-5 text-[22px] leading-[1.35]">
            Lose, die nicht über das Kundenkonto gekauft wurden, kannst du selbst in die App einfügen. Sie bleiben auf
            deinem Smartphone gespeichert.
          </p>
          <h3 className="mt-10 text-[29px] font-black leading-tight text-brand">Dein Los-Status auf einen Blick</h3>
          <p className="mt-6 text-[22px] leading-[1.35]">Du siehst den Status deines Loses direkt auf dem Los.</p>
        </div>
      </div>
    </div>
  )
}

function HomeCampaignCard({ card, onInfo }: { card: AktionMenschHomeCard; onInfo: () => void }) {
  const { fireFlavor } = useBraze()
  const isMint = card.tone === 'mint'
  const startOffer = () =>
    fireFlavor({
      name: 'aktion_extra_chance_started',
      label: 'Extra-Chance started',
      anchor: AnchorEvents.OFFER_INTERACTION,
      emitAnchor: true,
      sample: { offer_id: card.id, surface: 'home', action: 'started' },
    })

  return (
    <article className="w-full overflow-hidden rounded-[8px] bg-white text-left shadow-[0_1px_5px_rgba(0,0,0,0.08)]">
      {card.image && (
        <SmartImage src={card.image} alt={card.title} className={`w-full object-cover ${isMint ? 'h-[235px]' : 'h-[150px]'}`} />
      )}
      <div className={`relative px-5 py-6 ${isMint ? 'bg-[#c7f5df]' : 'bg-white'}`}>
        {isMint && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onInfo()
            }}
            className="absolute right-5 top-5 text-[#0d7566]"
            aria-label="Informationen"
          >
            <Info size={24} />
          </button>
        )}
        <h2 className="pr-8 text-[32px] font-black leading-tight text-brand">{card.title}</h2>
        <p className="mt-4 text-[25px] leading-tight">{card.subtitle}</p>
        {card.body && <p className="mt-5 text-[21px] leading-[1.35]">{card.body}</p>}
        <PrimaryButton className="mt-8" onClick={startOffer}>{card.cta}</PrimaryButton>
      </div>
    </article>
  )
}

function Header({
  title,
  leading,
  action,
  compact = false,
}: {
  title: string
  leading?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <header className={`sticky top-0 z-20 border-b border-[#d0d0d0] bg-white px-5 ${compact ? 'py-5' : 'pb-6 pt-16'}`}>
      <div className="grid grid-cols-[44px_1fr_44px] items-center">
        <div>{leading}</div>
        <h1 className={`${compact ? 'text-center text-[24px]' : 'col-span-2 text-[40px]'} font-black leading-none text-brand`}>
          {title}
        </h1>
        {compact ? <div>{action}</div> : action && <div className="absolute right-5 top-12">{action}</div>}
      </div>
    </header>
  )
}

function AktionBottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (pathname === '/welcome' || pathname === '/onboarding') return null

  const tabs: Array<{ id: string; label: string; icon: LucideIcon; path: string }> = [
    { id: 'start', label: 'Start', icon: Home, path: '/' },
    { id: 'lose', label: 'Lose', icon: Ticket, path: '/lose' },
    { id: 'pruefen', label: 'Prüfen', icon: Clover, path: '/pruefen' },
    { id: 'mehr', label: 'Mehr', icon: Menu, path: '/mehr' },
  ]

  return (
    <nav className="z-40 grid shrink-0 grid-cols-4 border-t border-[#d0d0d0] bg-white pb-6 pt-2">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = pathname === tab.path || (tab.path === '/' && pathname === '/start')
        return (
          <button key={tab.id} onClick={() => navigate(tab.path)} className="flex flex-col items-center gap-1 py-1">
            <Icon size={29} fill={active ? '#282828' : 'none'} strokeWidth={active ? 2.5 : 2} />
            <span className="text-[17px] leading-tight">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function DrawRow({ row, obscureFrom }: { row: { label: string; digits: string }; obscureFrom: number }) {
  return (
    <div className="grid grid-cols-[150px_1fr] items-center gap-2">
      <p className="text-[22px] font-black">{row.label}</p>
      <div className="flex justify-end gap-1">
        {row.digits.split('').map((digit, index) => (
          <span
            key={`${digit}-${index}`}
            className={`flex h-10 w-8 items-center justify-center bg-white text-[22px] font-black ${
              index >= obscureFrom ? 'blur-[2px] opacity-60' : ''
            }`}
          >
            {digit}
          </span>
        ))}
      </div>
    </div>
  )
}

function ListGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 px-5 text-[18px] uppercase tracking-normal text-[#737373]">{label}</h2>
      <div className="overflow-hidden rounded-[8px] bg-white">{children}</div>
    </div>
  )
}

function ListRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 border-b border-[#d9d9d9] p-5 text-left last:border-b-0">
      <span className="min-w-0 flex-1 text-[23px] leading-tight">{label}</span>
      <ChevronRight className="text-[#a6a6a6]" />
    </button>
  )
}

function Switch({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 w-[70px] items-center rounded-full p-1 transition-colors ${
        checked ? 'justify-end bg-brand' : 'justify-start bg-[#e4e4e6]'
      }`}
      aria-pressed={checked}
    >
      <span className="h-9 w-9 rounded-full bg-white shadow" />
    </button>
  )
}

function PrimaryButton({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-full bg-brand px-5 py-4 text-center text-[20px] font-black leading-none text-white ${className}`}
    >
      {children}
    </button>
  )
}

function OutlineButton({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-full border-2 border-[#282828] bg-white px-5 py-3.5 text-center text-[21px] font-black leading-none ${className}`}
    >
      {children}
    </button>
  )
}

function TicketButtonContent({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Icon size={22} />
      <span>{children}</span>
    </span>
  )
}

function IconButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} className="rounded-full p-1">
      <Icon size={32} />
    </button>
  )
}

function Logo({ className }: { className?: string }) {
  return <img src={`${aktion.assetBase}/aktion-mensch-logo.png`} alt="Aktion Mensch" className={className} />
}

function ScrollScreen({ children }: { children: ReactNode }) {
  return <main className="no-scrollbar flex-1 overflow-y-auto pb-4">{children}</main>
}

function PlainScreen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`flex flex-1 flex-col overflow-hidden ${className}`}>{children}</main>
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-[33px] font-black leading-none">{value}</p>
      <p className="mt-3 text-[16px] leading-none">{label}</p>
    </div>
  )
}

function Colon() {
  return <span className="pt-1 text-[31px] font-black leading-none">:</span>
}

function TicketIllustration() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-6 top-16 h-44 w-44 rounded-full bg-[#ff6900]" />
      <div className="absolute left-16 top-6 h-20 w-32 rounded-[45%] bg-[#6a0930]" />
      <div className="absolute left-28 top-12 h-32 w-24 rounded-full bg-[#ffd5df]" />
      <div className="absolute left-36 top-32 h-32 w-20 rotate-[-12deg] rounded-[18px] bg-[#282828]" />
      <div className="absolute right-7 top-20 rotate-[-7deg] rounded-[5px] bg-[#159b83] px-4 py-3 text-[25px] leading-none text-white">
        Glücks
        <br />
        LOS
      </div>
      <div className="absolute bottom-6 left-10 h-28 w-24 rotate-[-35deg] rounded-[36px] bg-[#ffd5df]" />
      <div className="absolute bottom-16 right-8 h-36 w-24 rotate-[32deg] rounded-[36px] bg-[#ffd5df]" />
      <Check className="absolute bottom-20 right-20 text-brand" size={42} strokeWidth={4} />
    </div>
  )
}

function trackBuyTicket(fireAnchor: ReturnType<typeof useBraze>['fireAnchor']) {
  fireAnchor(
    AnchorEvents.OFFER_INTERACTION,
    { offer_id: 'buy_ticket_home', offer_name: 'Los kaufen', surface: 'home', action: 'tapped' },
    'Los kaufen',
  )
}

function useScreenEvent(screen: string) {
  const { fireAnchor } = useBraze()
  useEffect(() => {
    fireAnchor(AnchorEvents.SCREEN_VIEWED, { screen, section: 'aktion_mensch' }, screen)
  }, [fireAnchor, screen])
}
