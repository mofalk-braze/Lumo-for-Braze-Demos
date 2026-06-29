import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Tag,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Routes, Route, useParams } from 'react-router-dom'
import { useBraze } from '../../braze/BrazeBridgeProvider'
import type { NormalizedCard } from '../../braze/bridge'
import { AnchorEvents, StandardAttributes } from '../../braze/events'
import {
  appContent,
  type WoltContent,
  type WoltMenuItem,
  type WoltMerchant,
  type WoltOrder,
  type WoltRail,
} from '../../brand/content'
import { ContentCardView } from '../../components/ContentCardView'
import { SmartImage } from '../../components/SmartImage'

const wolt = appContent.wolt as WoltContent

interface CartItem {
  item: WoltMenuItem
  merchant: WoltMerchant
  quantity: number
}

function allMerchants(): WoltMerchant[] {
  const rails = wolt.offerRails.flatMap((rail) => rail.merchants)
  return [...wolt.repeatOrders, wolt.favorite, ...rails, ...wolt.featuredRail.merchants]
}

export function WoltAppSurface() {
  const merchants = useMemo(allMerchants, [])
  const { displayUser, fireAnchor, logPurchase, setAttribute, simulatePush } = useBraze()
  const [searchOpen, setSearchOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<{ item: WoltMenuItem; merchant: WoltMerchant } | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [couponApplied, setCouponApplied] = useState(false)
  const [checkoutComplete, setCheckoutComplete] = useState(false)

  const cartCount = cart.reduce((sum, entry) => sum + entry.quantity, 0)
  const subtotal = cart.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0)
  const coupon = wolt.coupons?.[0]
  const discount = couponApplied && coupon && subtotal >= coupon.minimum ? coupon.amount : 0
  const total = Math.max(0, subtotal - discount)

  const openSearch = () => {
    setSearchOpen(true)
    fireAnchor(AnchorEvents.CONTENT_ENGAGED, { action: 'search_opened', surface: 'global' }, 'search')
  }

  const openItem = (merchant: WoltMerchant, item: WoltMenuItem) => {
    setSelectedItem({ merchant, item })
    fireAnchor(
      AnchorEvents.CONTENT_VIEWED,
      { id: item.id, name: item.title, category: merchant.category ?? 'restaurants', type: 'menu_item', price: item.price },
      item.title,
    )
  }

  const addToCart = (merchant: WoltMerchant, item: WoltMenuItem, quantity: number) => {
    setCart((current) => {
      const existing = current.find((entry) => entry.item.id === item.id && entry.merchant.id === merchant.id)
      if (existing) {
        return current.map((entry) =>
          entry === existing ? { ...entry, quantity: entry.quantity + quantity } : entry,
        )
      }
      return [...current, { merchant, item, quantity }]
    })
    setSelectedItem(null)
    setCartOpen(true)
    fireAnchor(
      AnchorEvents.CONTENT_ENGAGED,
      { action: 'add_to_cart', merchant_id: merchant.id, merchant_name: merchant.title, item_id: item.id, item_name: item.title, quantity },
      item.title,
    )
  }

  const applyCoupon = () => {
    if (!coupon) return
    setCouponApplied(true)
    fireAnchor(
      AnchorEvents.OFFER_INTERACTION,
      { offer_id: coupon.id, offer_name: coupon.title, surface: 'cart', action: 'applied', cart_value: subtotal },
      coupon.code,
    )
    simulatePush({
      title: 'Gutschein angewendet',
      body: `${coupon.code} spart ${eur(coupon.amount)} auf diese Bestellung.`,
      uri: '/notifications',
    })
  }

  const checkout = () => {
    if (cart.length === 0) return
    setCheckoutComplete(true)
    fireAnchor(
      AnchorEvents.CONVERSION_COMPLETED,
      { type: 'checkout', value: Number(total.toFixed(2)), currency: 'EUR', item_count: cartCount, coupon: couponApplied ? coupon?.code : null },
      'checkout',
    )
    logPurchase('wolt_checkout', Number(total.toFixed(2)), 'EUR', 1, {
      item_count: cartCount,
      coupon: couponApplied ? coupon?.code : undefined,
      address: displayUser.homeAddress || wolt.address,
    })
    setAttribute(StandardAttributes.LOYALTY_POINTS, displayUser.loyaltyPoints + 10)
    fireAnchor(
      AnchorEvents.LOYALTY_EVENT,
      { action: 'earn', amount: 10, balance: displayUser.loyaltyPoints + 10, tier: displayUser.loyaltyTier || wolt.rewards.tier },
      'Champion progress',
    )
    simulatePush({
      title: 'Bestellung bestaetigt',
      body: `Deine Bestellung ist unterwegs. Du hast 10 Punkte gesammelt.`,
      uri: '/orders',
    })
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-white font-wolt text-wolt-ink">
      <Routes>
        <Route path="/" element={<WoltHome onSearch={openSearch} onCart={() => setCartOpen(true)} cartCount={cartCount} />} />
        <Route path="/discover" element={<WoltDiscover merchants={merchants} onSearch={openSearch} />} />
        <Route path="/merchant/:merchantId" element={<WoltMerchantDetail merchants={merchants} onItem={openItem} onCart={() => setCartOpen(true)} cartCount={cartCount} />} />
        <Route path="/orders" element={<WoltOrders onReorder={(order) => setCartFromOrder(order, merchants, setCart, setCartOpen)} />} />
        <Route path="/notifications" element={<WoltNotifications merchants={merchants} />} />
        <Route path="/profile" element={<WoltProfile />} />
        <Route path="/account" element={<WoltAccount />} />
        <Route path="/rewards" element={<WoltRewards />} />
      </Routes>
      {searchOpen && <SearchOverlay merchants={merchants} onClose={() => setSearchOpen(false)} />}
      {selectedItem && (
        <ItemSheet
          item={selectedItem.item}
          merchant={selectedItem.merchant}
          onClose={() => setSelectedItem(null)}
          onAdd={addToCart}
        />
      )}
      {cartOpen && (
        <CartSheet
          cart={cart}
          subtotal={subtotal}
          total={total}
          discount={discount}
          couponApplied={couponApplied}
          checkoutComplete={checkoutComplete}
          address={displayUser.homeAddress || wolt.address}
          onClose={() => {
            setCartOpen(false)
            if (checkoutComplete) {
              setCart([])
              setCouponApplied(false)
              setCheckoutComplete(false)
            }
          }}
          onApplyCoupon={applyCoupon}
          onCheckout={checkout}
          onQuantity={(itemId, delta) => {
            setCart((current) =>
              current
                .map((entry) => entry.item.id === itemId ? { ...entry, quantity: Math.max(0, entry.quantity + delta) } : entry)
                .filter((entry) => entry.quantity > 0),
            )
          }}
        />
      )}
    </div>
  )
}

function WoltHome({ onSearch, onCart, cartCount }: { onSearch: () => void; onCart: () => void; cartCount: number }) {
  const { displayUser, cardsForPlacement, clickCard, impressCard, fireAnchor } = useBraze()
  const navigate = useNavigate()
  const homeCards = cardsForPlacement(appContent.contentCardRail.placement)

  useScreenEvent('home')

  return (
    <WoltScroll>
      <WoltTopChrome
        address={displayUser.homeAddress || wolt.address}
        onProfile={() => navigate('/profile')}
        onBell={() => navigate('/notifications')}
      />
      <CategoryStrip />
      <MerchantSection title="Nochmal bestellen" cta="Alle ansehen" merchants={wolt.repeatOrders} />
      {homeCards.length > 0 && (
        <section className="px-4 pt-6">
          <SectionTitle title={appContent.contentCardRail.title} cta="Aktualisieren" />
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {homeCards.map((card) => (
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
      <button
        onClick={() =>
          fireAnchor(
            AnchorEvents.OFFER_INTERACTION,
            { offer_id: 'dedeal10', offer_name: wolt.supermarketDeal.title, surface: 'home_banner', action: 'tapped' },
            'DEDEAL10',
          )
        }
        className="mx-4 mt-7 block rounded-[7px] bg-[#efd5ff] px-5 py-8 text-center shadow-[0_2px_8px_rgba(32,35,62,0.14)]"
      >
        <p className="text-[25px] font-black leading-[1.02] tracking-normal text-wolt-ink">
          {wolt.supermarketDeal.title}
        </p>
        <p className="mt-1 text-[13px] font-black text-wolt-ink">{wolt.supermarketDeal.subtitle}</p>
        <span className="mt-8 inline-flex rounded-xl bg-white px-8 py-2 text-[14px] font-black text-wolt-ink shadow">
          CODE {wolt.supermarketDeal.code}
        </span>
      </button>
      <OfferFeed compact />
      <FloatingSearch onSearch={onSearch} onCart={onCart} cartCount={cartCount} />
    </WoltScroll>
  )
}

function WoltDiscover({ merchants, onSearch }: { merchants: WoltMerchant[]; onSearch: () => void }) {
  const { fireAnchor } = useBraze()
  const navigate = useNavigate()
  useScreenEvent('discover')
  return (
    <WoltScroll>
      <div className="sticky top-0 z-20 bg-white px-4 pb-2 pt-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onSearch}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-[#f3f0ec] px-5 py-4 text-left text-[21px] text-[#747272]"
          >
            <Search size={25} />
            <span className="truncate">Restaurants, Geschaefte, Artikel suc...</span>
          </button>
          <RoundButton icon={ChevronDown} />
        </div>
      </div>
      <section className="px-4 pt-3">
        <h1 className="wolt-display text-[35px] leading-none">Wolt entdecken</h1>
        <div className="mt-6 grid grid-cols-4 gap-x-4 gap-y-7">
          {wolt.categories.map((category) => (
            <button
              key={category.id}
              onClick={() =>
                fireAnchor(AnchorEvents.CONTENT_VIEWED, { type: 'category', id: category.id, name: category.title }, category.title)
              }
              className="min-w-0 text-center"
            >
              <SmartImage
                src={category.image}
                alt={category.title}
                label={category.title}
                className="aspect-square w-full rounded-[17px] object-cover"
              />
              <p className="mt-2 min-h-[36px] overflow-hidden text-[14px] font-extrabold leading-[1.05]">{shortCategoryLabel(category.title)}</p>
            </button>
          ))}
        </div>
      </section>
      <section className="px-4 pt-9">
        <h2 className="wolt-display text-[34px] leading-none">Dienstleistungen</h2>
        <div className="mt-5 grid grid-cols-4 gap-x-4">
          {wolt.services.map((service) => (
            <button key={service.id} className="text-center">
              <SmartImage src={service.image} alt={service.title} label={service.title} className="aspect-square rounded-[17px]" />
              <p className="mt-2 text-[16px] font-extrabold leading-tight">{service.title}</p>
            </button>
          ))}
        </div>
      </section>
      <section className="px-4 pt-9">
        <SectionTitle title="Beliebt in deiner Naehe" />
        <div className="mt-4 space-y-3">
          {merchants.slice(0, 5).map((merchant) => (
            <button
              key={merchant.id}
              onClick={() => {
                fireAnchor(AnchorEvents.CONTENT_VIEWED, { type: 'merchant', id: merchant.id, name: merchant.title, surface: 'discover' }, merchant.title)
                navigate(`/merchant/${merchant.id}`)
              }}
              className="flex w-full items-center gap-3 rounded-[14px] border border-[#e6e0da] bg-white p-2 text-left shadow-[0_1px_5px_rgba(32,35,62,0.08)]"
            >
              <SmartImage src={merchant.image} alt={merchant.title} className="h-[74px] w-[94px] rounded-[10px] object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[18px] font-black">{merchant.title}</span>
                <span className="mt-1 block truncate text-[14px] text-[#747272]">{merchant.subtitle}</span>
                <span className="mt-1 block text-[13px] font-bold text-[#4a39b3]">🚲 {merchant.deliveryFee} · {merchant.eta} · ☺ {merchant.rating}</span>
              </span>
              <ChevronRight size={22} className="text-[#747272]" />
            </button>
          ))}
        </div>
      </section>
    </WoltScroll>
  )
}

function WoltOrders({ onReorder }: { onReorder: (order: WoltOrder) => void }) {
  const [tab, setTab] = useState<'carts' | 'reorder'>('carts')
  const { fireAnchor, logPurchase } = useBraze()
  useScreenEvent('orders')

  const reorder = (order: WoltOrder) => {
    const value = Number(order.total.replace(/[^\d,]/g, '').replace(',', '.')) || 0
    fireAnchor(
      AnchorEvents.CONVERSION_COMPLETED,
      { type: 'reorder', value, currency: 'EUR', item_count: order.items.length, merchant: order.merchant },
      order.merchant,
    )
    logPurchase(`reorder_${order.id}`, value, 'EUR', 1, { merchant: order.merchant })
    onReorder(order)
  }

  return (
    <WoltScroll>
      <div className="sticky top-0 z-20 bg-white px-4 pb-5 pt-10">
        <div className="grid grid-cols-[72px_1fr_72px] items-center">
          <RoundButton icon={ChevronDown} />
          <h1 className="text-center text-[27px] font-black">Deine Bestellungen</h1>
        </div>
        <div className="mt-9 grid grid-cols-2 rounded-full bg-[#f3f0ec] p-1">
          <button
            onClick={() => setTab('carts')}
            className={`rounded-full py-3 text-[22px] font-black ${tab === 'carts' ? 'bg-transparent' : 'bg-white shadow-sm'}`}
          >
            Warenkoerbe
          </button>
          <button
            onClick={() => setTab('reorder')}
            className={`rounded-full py-3 text-[22px] font-black ${tab === 'reorder' ? 'bg-transparent' : 'bg-white shadow-sm'}`}
          >
            Nochmal bestellen
          </button>
        </div>
      </div>
      <div className="space-y-5 px-4 pb-8">
        {wolt.orders.map((order) => (
          <OrderCard key={order.id} order={order} onReorder={() => reorder(order)} />
        ))}
      </div>
    </WoltScroll>
  )
}

function WoltNotifications({ merchants }: { merchants: WoltMerchant[] }) {
  const { cardsForPlacement, clickCard, impressCard, fireAnchor } = useBraze()
  const navigate = useNavigate()
  const cards = cardsForPlacement('notifications')
  useScreenEvent('notifications')
  return (
    <div className="flex h-full flex-col bg-white px-4 pt-10">
      <div className="flex justify-end">
        <RoundButton icon={ChevronDown} />
      </div>
      <h1 className="wolt-display mt-10 text-[36px] leading-none">Benachrichtigungen</h1>
      {cards.length > 0 ? (
        <div className="mt-8 space-y-3">
          {cards.map((card) => (
            <WoltNotificationCard
              key={card.id}
              card={card}
              onClick={clickCard}
              onImpression={impressCard}
              onNavigate={() => {
                const merchant = merchants.find((entry) => entry.id === card.extras.merchant_id)
                if (merchant) navigate(`/merchant/${merchant.id}`)
                else if (card.extras.offer_id === 'champion_keep') navigate('/rewards')
              }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center pb-40 text-center">
          <SmartImage src={`${wolt.assetBase}/crops/notifications-empty.png`} alt="Wolt updates" className="h-[190px] w-[300px] object-contain" />
          <h2 className="mt-8 text-[22px] font-black">Momentan keine Updates</h2>
          <p className="mt-2 max-w-[390px] text-[20px] leading-snug text-wolt-ink">
            Schaue spaeter wieder vorbei - fuer persoenliche Updates, die besten Angebote und Entdeckungen auf Wolt.
          </p>
          <button
            onClick={() => fireAnchor(AnchorEvents.OFFER_INTERACTION, { action: 'notifications_empty_tapped', surface: 'notifications' }, 'notifications')}
            className="mt-8 rounded-full bg-brand-light px-5 py-3 text-[17px] font-black text-[#005467]"
          >
            Angebote entdecken
          </button>
        </div>
      )}
    </div>
  )
}

function WoltNotificationCard({
  card,
  onClick,
  onImpression,
  onNavigate,
}: {
  card: NormalizedCard
  onClick: ReturnType<typeof useBraze>['clickCard']
  onImpression: ReturnType<typeof useBraze>['impressCard']
  onNavigate: () => void
}) {
  useEffect(() => {
    onImpression(card)
  }, [card, onImpression])

  return (
    <button
      onClick={() => {
        onClick(card)
        onNavigate()
      }}
      className="flex w-full gap-3 rounded-[16px] border border-[#e6e0da] bg-white p-3 text-left shadow-[0_2px_8px_rgba(32,35,62,0.1)]"
    >
      <SmartImage src={card.imageUrl} label={card.title} className="h-[84px] w-[94px] rounded-[12px] object-cover" />
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-black leading-tight">{card.title}</span>
        <span className="mt-1 line-clamp-2 block text-[14px] leading-snug text-[#747272]">{card.description}</span>
        <span className="mt-2 inline-flex rounded-full bg-brand-light px-3 py-1 text-[13px] font-black text-[#005467]">{card.extras.cta ?? 'Ansehen'}</span>
      </span>
    </button>
  )
}

function WoltMerchantDetail({
  merchants,
  onItem,
  onCart,
  cartCount,
}: {
  merchants: WoltMerchant[]
  onItem: (merchant: WoltMerchant, item: WoltMenuItem) => void
  onCart: () => void
  cartCount: number
}) {
  const { merchantId } = useParams()
  const navigate = useNavigate()
  const { fireAnchor } = useBraze()
  const merchant = merchants.find((entry) => entry.id === merchantId) ?? merchants[0]
  const menu = merchant.menu?.length ? merchant.menu : fallbackMenu(merchant)

  useEffect(() => {
    fireAnchor(
      AnchorEvents.CONTENT_VIEWED,
      { id: merchant.id, name: merchant.title, category: merchant.category ?? 'merchant', type: 'merchant_detail' },
      merchant.title,
    )
  }, [fireAnchor, merchant])

  return (
    <WoltScroll>
      <section className="relative">
        <SmartImage src={merchant.image} alt={merchant.title} className="h-[250px] w-full object-cover" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-10">
          <button onClick={() => navigate(-1)} className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-white/95 shadow">
            <ChevronLeft size={32} />
          </button>
          <button onClick={onCart} className="relative flex h-[48px] w-[48px] items-center justify-center rounded-full bg-white/95 shadow">
            <ShoppingBag size={25} />
            {cartCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[#20233e] px-2 py-0.5 text-[11px] font-black text-white">{cartCount}</span>}
          </button>
        </div>
      </section>
      <section className="-mt-6 rounded-t-[26px] bg-white px-4 pb-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="wolt-display text-[34px] leading-none">{merchant.title}</h1>
            <p className="mt-2 text-[18px] leading-snug text-[#747272]">{merchant.subtitle}</p>
          </div>
          <span className="rounded-full bg-brand-light px-3 py-2 text-[15px] font-black text-[#005467]">W+</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[14px] font-bold text-[#747272]">
          <span>🚲 {merchant.deliveryFee}</span>
          <span>· {merchant.eta}</span>
          <span>· ☺ {merchant.rating}</span>
          {merchant.distance && <span>· {merchant.distance}</span>}
        </div>
        {merchant.badge && (
          <button
            onClick={() =>
              fireAnchor(
                AnchorEvents.OFFER_INTERACTION,
                { offer_id: `${merchant.id}_badge`, offer_name: merchant.badge, surface: 'merchant_detail', action: 'viewed' },
                merchant.badge,
              )
            }
            className="mt-4 flex w-full items-center gap-3 rounded-[16px] bg-[#fff0f0] px-4 py-3 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d93428] text-white"><Tag size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-black">{merchant.badge}</span>
              <span className="block text-[13px] text-[#747272]">Personalisierte Aktion von Braze</span>
            </span>
          </button>
        )}
      </section>
      <section className="sticky top-0 z-20 border-y border-[#ece7e1] bg-white px-4 py-3">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {menu.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="rounded-full bg-[#f3f0ec] px-4 py-2 text-[15px] font-black">
              {section.title}
            </a>
          ))}
        </div>
      </section>
      <div className="px-4 pb-28">
        {menu.map((section) => (
          <section key={section.id} id={section.id} className="pt-6">
            <h2 className="wolt-display text-[27px] leading-none">{section.title}</h2>
            <div className="mt-4 divide-y divide-[#e6e0da]">
              {section.items.map((item) => (
                <button key={item.id} onClick={() => onItem(merchant, item)} className="flex w-full gap-3 py-4 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[19px] font-black">{item.title}</span>
                    <span className="mt-1 line-clamp-2 block text-[15px] leading-snug text-[#747272]">{item.description}</span>
                    <span className="mt-2 block text-[17px] font-black">{eur(item.price)}</span>
                  </span>
                  <SmartImage src={item.image} label={item.title} className="h-[92px] w-[104px] shrink-0 rounded-[13px] object-cover" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {cartCount > 0 && (
        <div className="sticky bottom-5 z-30 px-4">
          <button onClick={onCart} className="flex w-full items-center justify-between rounded-full bg-[#20233e] px-6 py-4 text-[18px] font-black text-white shadow-2xl">
            <span>{cartCount} Artikel</span>
            <span>Warenkorb ansehen</span>
          </button>
        </div>
      )}
    </WoltScroll>
  )
}

function WoltProfile() {
  const { displayUser, fireAnchor } = useBraze()
  const navigate = useNavigate()
  useScreenEvent('profile')
  return (
    <WoltScroll>
      <div className="sticky top-0 z-20 bg-white px-4 pb-4 pt-10">
        <div className="grid grid-cols-[72px_1fr_72px] items-center">
          <span />
          <h1 className="text-center text-[26px] font-black">Profil</h1>
          <RoundButton icon={ChevronDown} />
        </div>
      </div>
      <section className="px-4 pt-4">
        <SectionTitle title="Deine Favoriten" cta="Alle ansehen" />
        <div className="mt-4 max-w-[318px]">
          <MerchantCard merchant={wolt.favorite} wide />
        </div>
      </section>
      <MenuBlock
        title="Schnellzugriff"
        rows={['Freund*innen einladen', 'Code einloesen', 'Kundensupport', 'Bestellhistorie', 'Legal and privacy']}
        onRow={(label) => fireAnchor(AnchorEvents.CONTENT_ENGAGED, { action: 'profile_menu', label }, label)}
      />
      <MenuBlock
        title="Einstellungen"
        rows={[
          `Konto (${displayUser.initials})`,
          'Geschenkkarten & Guthaben',
          `Adresse: ${displayUser.homeAddress || wolt.address}`,
          'Braze Setup',
        ]}
        onRow={(label) => (label === 'Braze Setup' ? navigate('/setup') : undefined)}
      />
    </WoltScroll>
  )
}

function WoltAccount() {
  const { displayUser, fireAnchor } = useBraze()
  const navigate = useNavigate()
  useScreenEvent('account')
  return (
    <WoltScroll>
      <div className="px-4 pt-10">
        <div className="flex items-start justify-between">
          <h1 className="wolt-display mt-20 text-[42px] leading-none">Hallo {displayUser.firstName}!</h1>
          <div className="space-y-8 text-right">
            <RoundButton icon={ChevronDown} />
            <button
              onClick={() => navigate('/profile')}
              className="flex h-[86px] w-[86px] items-center justify-center rounded-full bg-brand-light text-[31px] font-medium text-[#747272]"
            >
              {displayUser.initials}
            </button>
          </div>
        </div>
        <button
          onClick={() => navigate('/rewards')}
          className="mt-12 grid h-[244px] w-full overflow-hidden rounded-[22px] bg-gradient-to-br from-[#b755e5] to-[#4436ba] p-6 text-left text-white shadow-[0_9px_24px_rgba(32,35,62,0.18)]"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(128,62,214,.88), rgba(67,54,186,.7)), url(${wolt.assetBase}/crops/account-champion-card.png)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="mt-auto">
            <p className="text-[34px] font-black uppercase">Champion</p>
            <p className="mt-2 flex items-center gap-4 text-[22px] font-semibold">
              Mehr erfahren <ChevronRight size={34} />
            </p>
          </div>
        </button>
      </div>
      <div className="mx-4 mt-8 overflow-hidden rounded-[17px] border border-[#d9d2cc] bg-white">
        {[
          [`Wolt+ ${wolt.woltPlusCountry}`, 'Naechste Zahlung 06.07.26'],
          ['Bestellhistorie', 'ueber 100 Bestellungen'],
          ['Geschenkkarten & Guthaben', ''],
          ['Geschenkkarte kaufen', ''],
        ].map(([title, subtitle], index) => (
          <button
            key={title}
            onClick={() => fireAnchor(AnchorEvents.CONTENT_ENGAGED, { action: 'account_row', title }, title)}
            className={`flex w-full items-center justify-between px-5 py-5 text-left ${index ? 'border-t border-[#e6e0da]' : ''}`}
          >
            <span>
              <span className="block text-[22px] font-black">{title}</span>
              {subtitle && <span className="mt-2 block text-[20px] text-[#747272]">{subtitle}</span>}
            </span>
            <ChevronRight size={30} className="text-[#747272]" />
          </button>
        ))}
      </div>
      <MerchantSection title="Nochmal bestellen" merchants={wolt.repeatOrders} />
    </WoltScroll>
  )
}

function WoltRewards() {
  const { displayUser, fireAnchor, setAttribute } = useBraze()
  const navigate = useNavigate()
  useScreenEvent('rewards')
  const tier = displayUser.loyaltyTier || wolt.rewards.tier
  const percent = Math.max(0, Math.min(100, displayUser.loyaltyPoints ? Math.round(displayUser.loyaltyPoints / 10) : wolt.rewards.progressPercent))

  const progressTap = () => {
    setAttribute(StandardAttributes.LOYALTY_POINTS, displayUser.loyaltyPoints + 10)
    fireAnchor(
      AnchorEvents.LOYALTY_EVENT,
      { action: 'view_progress', amount: 10, balance: displayUser.loyaltyPoints + 10, tier },
      tier,
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#be57e4] to-[#3932b8] px-4 pb-14 pt-16 text-white">
        <button
          onClick={() => navigate('/account')}
          className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-[#583076] text-white"
        >
          <ChevronLeft size={44} />
        </button>
        <h1 className="wolt-display mt-8 text-[72px] leading-none text-white">{tier}</h1>
        <SmartImage src={`${wolt.assetBase}/crops/rewards-champion.png`} alt="Champion" className="mx-auto mt-4 h-[300px] w-[330px] object-contain" />
      </section>
      <section className="-mt-7 rounded-t-[28px] bg-white px-4 pb-12 pt-8">
        <button onClick={progressTap} className="flex items-center text-left">
          <h2 className="wolt-display text-[36px] leading-none">Levelfortschritt</h2>
          <ChevronRight size={34} className="ml-2" />
        </button>
        <div className="mt-7 overflow-hidden rounded-full bg-[#f1ede8]">
          <div className="flex h-[40px] items-center justify-between rounded-full bg-[#ffab13] px-5 text-[20px] text-white" style={{ width: `${percent}%` }}>
            <span>{percent} %</span>
          </div>
        </div>
        <p className="mt-2 text-right text-[22px] text-[#747272]">{wolt.rewards.completed}/{wolt.rewards.required}</p>
        <p className="mt-1 text-[20px] leading-snug">
          Bestelle noch einmal bis {wolt.rewards.keepUntil}, um auf deinem aktuellen Level zu bleiben.
        </p>
        <h2 className="wolt-display mt-14 text-[36px] leading-none">Herausforderungen</h2>
        <p className="mt-8 text-[20px] leading-snug">
          Hier gibt es nichts zu sehen. Schau bald wieder vorbei, um neue Challenges zu entdecken!
        </p>
        <div className="mt-16 flex justify-center text-[96px]">🕐</div>
      </section>
    </div>
  )
}

function OfferFeed({ compact = false }: { compact?: boolean }) {
  useScreenEvent(compact ? 'home_offers' : 'offers')
  return (
    <>
      {wolt.offerRails.slice(0, compact ? 1 : undefined).map((rail) => (
        <MerchantSection key={rail.id} title={rail.title} cta={rail.cta} merchants={rail.merchants} />
      ))}
      <FeaturedRail rail={wolt.featuredRail} />
      {!compact && wolt.offerRails.slice(1).map((rail) => (
        <MerchantSection key={rail.id} title={rail.title} cta={rail.cta} merchants={rail.merchants} />
      ))}
    </>
  )
}

function WoltTopChrome({ address, onProfile, onBell }: { address: string; onProfile: () => void; onBell: () => void }) {
  return (
    <header className="sticky top-0 z-30 bg-white px-4 pb-3 pt-10 shadow-[0_6px_16px_rgba(32,35,62,0.12)]">
      <div className="flex items-center justify-between">
        <RoundButton icon={UserRound} onClick={onProfile} />
        <button className="flex min-w-0 items-center gap-1 text-[16px] font-black">
          <span className="truncate">{address}</span>
          <ChevronDown size={16} />
        </button>
        <RoundButton icon={Bell} onClick={onBell} />
      </div>
    </header>
  )
}

function CategoryStrip() {
  const { fireAnchor } = useBraze()
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-4">
      {wolt.categories.slice(0, 5).map((category) => (
        <button
          key={category.id}
          onClick={() => fireAnchor(AnchorEvents.CONTENT_VIEWED, { type: 'category', id: category.id, name: category.title }, category.title)}
          className="w-[98px] shrink-0"
        >
          <SmartImage src={category.image} alt={category.title} label={category.title} className="h-[58px] w-[98px] rounded-[15px]" />
          <p className="mt-1 line-clamp-2 text-center text-[13px] font-black leading-[1.05]">{category.title}</p>
        </button>
      ))}
    </div>
  )
}

function MerchantSection({ title, cta, merchants }: { title: string; cta?: string; merchants: WoltMerchant[] }) {
  return (
    <section className="px-4 pt-7">
      <SectionTitle title={title} cta={cta} />
      <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto pb-1">
        {merchants.map((merchant) => (
          <MerchantCard key={merchant.id} merchant={merchant} />
        ))}
      </div>
    </section>
  )
}

function FeaturedRail({ rail }: { rail: WoltRail }) {
  return (
    <section className="mx-0 mt-7 rounded-[28px] bg-[#ffe8e8] px-3 py-5">
      <div className="px-2">
        <h2 className="wolt-display text-[34px] leading-none text-[#d63227]">{rail.title}</h2>
        <p className="mt-2 text-[18px] text-[#747272]">Gesponsert</p>
      </div>
      <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto pb-1">
        {rail.merchants.map((merchant) => (
          <MerchantCard key={merchant.id} merchant={merchant} />
        ))}
      </div>
      <button className="mt-5 w-full rounded-[15px] bg-white py-4 text-[22px] font-black text-[#d63227]">{rail.cta}</button>
    </section>
  )
}

function MerchantCard({ merchant, wide = false }: { merchant: WoltMerchant; wide?: boolean }) {
  const { fireAnchor } = useBraze()
  const navigate = useNavigate()
  return (
    <button
      onClick={() => {
        fireAnchor(
          AnchorEvents.CONTENT_VIEWED,
          { id: merchant.id, name: merchant.title, category: 'merchant', type: 'restaurant' },
          merchant.title,
        )
        navigate(`/merchant/${merchant.id}`)
      }}
      className={`shrink-0 overflow-hidden rounded-[8px] bg-white text-left shadow-[0_2px_7px_rgba(32,35,62,0.17)] ${wide ? 'w-full' : 'w-[300px]'}`}
    >
      <div className="relative h-[133px]">
        <SmartImage src={merchant.image} alt={merchant.title} label={merchant.title} className="h-full w-full object-cover" />
        {merchant.badge && (
          <span
            className={`absolute left-4 top-4 max-w-[250px] truncate rounded-full px-4 py-1 text-[15px] font-black text-white ${
              merchant.badgeTone === 'purple' ? 'bg-gradient-to-r from-[#8746db] to-[#1577bf]' : 'bg-[#d93428]'
            }`}
          >
            <Tag size={14} className="mr-2 inline" />
            {merchant.badge}
          </span>
        )}
        {merchant.extraBadge && (
          <span className="absolute right-4 top-12 rounded-full bg-white px-4 py-1 text-[16px] font-black">{merchant.extraBadge}</span>
        )}
      </div>
      <div className="px-4 py-3">
        <h3 className="truncate text-[20px] font-black">{merchant.title}</h3>
        <p className="mt-1 truncate text-[17px] text-[#747272]">{merchant.subtitle}</p>
      </div>
      <div className="border-t border-dashed border-[#d9d2cc] px-4 py-3 text-[16px] font-bold text-[#747272]">
        <span className="text-[#4a39b3]">🚲 {merchant.deliveryFee}</span>
        <span> · {merchant.eta} · ☺ {merchant.rating}</span>
      </div>
    </button>
  )
}

function OrderCard({ order, onReorder }: { order: WoltOrder; onReorder: () => void }) {
  return (
    <article className="overflow-hidden rounded-[17px] border border-[#d9d2cc] bg-white">
      <div className="flex gap-5 px-5 py-5">
        <SmartImage src={order.logo} alt={order.merchant} label={order.merchant} className="h-[68px] w-[68px] shrink-0 rounded-[10px] object-cover shadow" />
        <div className="min-w-0">
          <h2 className="truncate text-[25px] font-black">{order.merchant}</h2>
          <p className="mt-1 text-[18px] text-[#747272]">{order.status}</p>
        </div>
      </div>
      <div className="border-t border-dashed border-[#e2ddd7] px-5 py-5">
        <div className="flex gap-3">
          {order.items.map((item) =>
            item.startsWith('+') ? (
              <div key={item} className="flex h-[64px] w-[78px] items-center justify-center rounded-[10px] bg-[#f4f3f2] text-[22px] font-black text-[#747272]">
                {item}
              </div>
            ) : (
              <SmartImage key={item} src={item} alt="" className="h-[64px] w-[78px] rounded-[10px] object-cover" />
            ),
          )}
        </div>
        <p className="mt-7 text-[23px] font-black">Gesamt: <span className="ml-3">{order.total}</span></p>
        <div className="mt-7 grid grid-cols-2 gap-3">
          <button className="rounded-[14px] bg-brand-light py-4 text-[20px] font-black text-[#005467]">Details anzeigen</button>
          <button onClick={onReorder} className="rounded-[14px] bg-[#5fc6e9] py-4 text-[20px] font-black text-[#005467]">Nochmal bestellen</button>
        </div>
      </div>
    </article>
  )
}

function MenuBlock({ title, rows, onRow }: { title: string; rows: string[]; onRow?: (row: string) => void }) {
  return (
    <section className="px-4 pt-10">
      <h2 className="wolt-display text-[35px] leading-none">{title}</h2>
      <div className="mt-5">
        {rows.map((row) => (
          <button key={row} onClick={() => onRow?.(row)} className="flex w-full items-center justify-between border-b border-[#e6e0da] py-5 text-left">
            <span className="text-[23px] font-black">{row}</span>
            <ChevronRight size={30} className="text-[#747272]" />
          </button>
        ))}
      </div>
    </section>
  )
}

function SearchOverlay({ merchants, onClose }: { merchants: WoltMerchant[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { fireAnchor } = useBraze()
  const recent = ['Thai', 'Burgermeister', 'Wolt Market']
  const results = merchants.filter((merchant) => {
    const text = `${merchant.title} ${merchant.subtitle} ${(merchant.tags ?? []).join(' ')}`.toLowerCase()
    return !query.trim() || text.includes(query.toLowerCase())
  })

  useEffect(() => {
    fireAnchor(AnchorEvents.SCREEN_VIEWED, { screen: 'search', section: 'overlay' }, 'search')
  }, [fireAnchor])

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-white px-4 pt-10">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[#f3f0ec]">
          <ChevronLeft size={30} />
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-[#f3f0ec] px-4 py-3">
          <Search size={23} className="text-[#747272]" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              fireAnchor(AnchorEvents.CONTENT_ENGAGED, { action: 'search_query', query: event.target.value }, event.target.value)
            }}
            placeholder="Restaurants, Geschaefte, Artikel suchen"
            className="min-w-0 flex-1 bg-transparent text-[18px] font-semibold outline-none placeholder:text-[#747272]"
          />
        </label>
      </div>
      {!query && (
        <div className="pt-7">
          <h2 className="wolt-display text-[28px]">Zuletzt gesucht</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {recent.map((item) => (
              <button key={item} onClick={() => setQuery(item)} className="rounded-full bg-[#f3f0ec] px-4 py-2 text-[16px] font-black">
                {item}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="no-scrollbar mt-6 flex-1 overflow-y-auto pb-8">
        <h2 className="wolt-display text-[28px]">{query ? 'Suchergebnisse' : 'Empfohlen'}</h2>
        <div className="mt-4 space-y-3">
          {results.map((merchant) => (
            <button
              key={merchant.id}
              onClick={() => {
                fireAnchor(AnchorEvents.CONTENT_VIEWED, { type: 'search_result', query, merchant_id: merchant.id, merchant_name: merchant.title }, merchant.title)
                onClose()
                navigate(`/merchant/${merchant.id}`)
              }}
              className="flex w-full gap-3 rounded-[14px] border border-[#e6e0da] p-2 text-left"
            >
              <SmartImage src={merchant.image} alt={merchant.title} className="h-[78px] w-[102px] rounded-[12px] object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[19px] font-black">{merchant.title}</span>
                <span className="mt-1 block truncate text-[15px] text-[#747272]">{merchant.subtitle}</span>
                <span className="mt-1 block text-[14px] font-bold text-[#4a39b3]">🚲 {merchant.deliveryFee} · {merchant.eta}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ItemSheet({
  item,
  merchant,
  onClose,
  onAdd,
}: {
  item: WoltMenuItem
  merchant: WoltMerchant
  onClose: () => void
  onAdd: (merchant: WoltMerchant, item: WoltMenuItem, quantity: number) => void
}) {
  const [quantity, setQuantity] = useState(1)
  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/30">
      <div className="max-h-[88%] w-full overflow-y-auto rounded-t-[28px] bg-white pb-6">
        <div className="relative">
          <SmartImage src={item.image ?? merchant.image} alt={item.title} className="h-[260px] w-full object-cover" />
          <button onClick={onClose} className="absolute right-4 top-4 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-white shadow">
            <X size={25} />
          </button>
        </div>
        <div className="px-5 pt-5">
          {item.badge && <span className="rounded-full bg-[#d93428] px-3 py-1 text-[14px] font-black text-white">{item.badge}</span>}
          <h2 className="wolt-display mt-4 text-[32px] leading-none">{item.title}</h2>
          <p className="mt-3 text-[18px] leading-snug text-[#747272]">{item.description}</p>
          <p className="mt-5 text-[24px] font-black">{eur(item.price)}</p>
          <div className="mt-7 flex items-center justify-between">
            <div className="flex items-center gap-4 rounded-full bg-[#f3f0ec] p-1">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
                <Minus size={21} />
              </button>
              <span className="min-w-[28px] text-center text-[20px] font-black">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
                <Plus size={21} />
              </button>
            </div>
            <button onClick={() => onAdd(merchant, item, quantity)} className="rounded-full bg-[#20233e] px-7 py-4 text-[18px] font-black text-white">
              Hinzufuegen {eur(item.price * quantity)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CartSheet({
  cart,
  subtotal,
  total,
  discount,
  couponApplied,
  checkoutComplete,
  address,
  onClose,
  onApplyCoupon,
  onCheckout,
  onQuantity,
}: {
  cart: CartItem[]
  subtotal: number
  total: number
  discount: number
  couponApplied: boolean
  checkoutComplete: boolean
  address: string
  onClose: () => void
  onApplyCoupon: () => void
  onCheckout: () => void
  onQuantity: (itemId: string, delta: number) => void
}) {
  const coupon = wolt.coupons?.[0]
  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/30">
      <div className="max-h-[88%] w-full overflow-y-auto rounded-t-[28px] bg-white pb-6">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e6e0da] bg-white px-5 py-4">
          <h2 className="wolt-display text-[30px]">Warenkorb</h2>
          <button onClick={onClose} className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#f3f0ec]">
            <X size={24} />
          </button>
        </div>
        {checkoutComplete ? (
          <div className="px-5 py-12 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-light text-[#005467]">
              <Check size={42} />
            </div>
            <h3 className="wolt-display mt-6 text-[32px] leading-none">Bestellung bestaetigt</h3>
            <p className="mt-3 text-[18px] leading-snug text-[#747272]">Deine Bestellung ist unterwegs. Braze hat Conversion, Purchase und Loyalty-Update erhalten.</p>
            <button onClick={onClose} className="mt-8 rounded-full bg-[#20233e] px-8 py-4 text-[18px] font-black text-white">Fertig</button>
          </div>
        ) : (
          <div className="px-5 py-5">
            <div className="rounded-[17px] bg-[#f8f6f4] p-4">
              <p className="text-[13px] font-black uppercase text-[#747272]">Lieferadresse</p>
              <p className="mt-1 text-[17px] font-black">{address}</p>
            </div>
            <div className="mt-4 divide-y divide-[#e6e0da]">
              {cart.length === 0 ? (
                <p className="py-8 text-center text-[18px] text-[#747272]">Dein Warenkorb ist leer.</p>
              ) : (
                cart.map((entry) => (
                  <div key={`${entry.merchant.id}-${entry.item.id}`} className="flex items-center gap-3 py-4">
                    <span className="flex-1">
                      <span className="block text-[18px] font-black">{entry.item.title}</span>
                      <span className="block text-[14px] text-[#747272]">{entry.merchant.title}</span>
                    </span>
                    <div className="flex items-center gap-2 rounded-full bg-[#f3f0ec] p-1">
                      <button onClick={() => onQuantity(entry.item.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white"><Minus size={16} /></button>
                      <span className="min-w-[18px] text-center text-[15px] font-black">{entry.quantity}</span>
                      <button onClick={() => onQuantity(entry.item.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white"><Plus size={16} /></button>
                    </div>
                    <span className="w-[76px] text-right text-[17px] font-black">{eur(entry.item.price * entry.quantity)}</span>
                  </div>
                ))
              )}
            </div>
            {coupon && cart.length > 0 && (
              <button
                onClick={onApplyCoupon}
                disabled={couponApplied}
                className="mt-4 flex w-full items-center gap-3 rounded-[16px] bg-[#fff0f0] px-4 py-3 text-left disabled:opacity-75"
              >
                <Tag size={24} className="text-[#d93428]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-black">{couponApplied ? `${coupon.code} angewendet` : coupon.title}</span>
                  <span className="block text-[13px] text-[#747272]">{coupon.description}</span>
                </span>
              </button>
            )}
            <div className="mt-5 space-y-2 border-t border-[#e6e0da] pt-4 text-[17px]">
              <div className="flex justify-between"><span>Zwischensumme</span><strong>{eur(subtotal)}</strong></div>
              {discount > 0 && <div className="flex justify-between text-[#d93428]"><span>Rabatt</span><strong>-{eur(discount)}</strong></div>}
              <div className="flex justify-between text-[22px] font-black"><span>Gesamt</span><span>{eur(total)}</span></div>
            </div>
            <button
              onClick={onCheckout}
              disabled={cart.length === 0}
              className="mt-6 w-full rounded-full bg-[#20233e] py-4 text-[19px] font-black text-white disabled:opacity-40"
            >
              Bestellung abschliessen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function FloatingSearch({ onSearch, onCart, cartCount }: { onSearch: () => void; onCart: () => void; cartCount: number }) {
  return (
    <div className="pointer-events-none sticky bottom-5 z-40 flex items-center justify-center gap-4 px-4">
      <button
        onClick={onSearch}
        className="pointer-events-auto flex items-center gap-3 rounded-full bg-wolt-ink px-7 py-4 text-[20px] font-black text-white shadow-2xl"
      >
        <SlidersHorizontal size={20} />
        <Search size={24} />
        Suchen
      </button>
      <button
        onClick={onCart}
        className="pointer-events-auto relative flex h-[58px] w-[58px] items-center justify-center rounded-full bg-wolt-ink text-white shadow-2xl"
      >
        <ShoppingBag size={28} />
        {cartCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[#5fc6e9] px-2 py-0.5 text-[11px] font-black text-[#005467]">{cartCount}</span>}
      </button>
    </div>
  )
}

function SectionTitle({ title, cta }: { title: string; cta?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 className="wolt-display max-w-[260px] text-[31px] leading-[1.03]">{title}</h2>
      {cta && <button className="shrink-0 rounded-[14px] bg-brand-light px-5 py-3 text-[18px] font-black text-[#005467]">{cta}</button>}
    </div>
  )
}

function RoundButton({ icon: Icon, onClick }: { icon: LucideIcon; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-[#f3f0ec] text-wolt-ink">
      <Icon size={27} strokeWidth={2.8} />
    </button>
  )
}

function WoltScroll({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar relative flex-1 overflow-y-auto bg-white pb-2">{children}</div>
}

function useScreenEvent(screen: string) {
  const { fireAnchor } = useBraze()
  const { pathname } = useLocation()
  useEffect(() => {
    fireAnchor(AnchorEvents.SCREEN_VIEWED, { screen, section: pathname }, screen)
  }, [fireAnchor, pathname, screen])
}

function shortCategoryLabel(title: string): string {
  const labels: Record<string, string> = {
    'Apotheke & Gesundheit': 'Apotheke & Gesund.',
    'Schoenheit und Koerperpflege': 'Schoenheit',
    'Spielzeug, Kinder und Baby': 'Spielzeug, Kinder',
  }
  return labels[title] ?? title
}

function eur(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} EUR`
}

function fallbackMenu(merchant: WoltMerchant): { id: string; title: string; items: WoltMenuItem[] }[] {
  return [
    {
      id: 'popular',
      title: 'Beliebt',
      items: [
        {
          id: `${merchant.id}-signature`,
          title: merchant.category === 'grocery' ? 'Wolt Market Einkaufskorb' : 'Signature Bowl',
          description: merchant.category === 'grocery'
            ? 'Ausgewaehlte Produkte fuer deinen Wocheneinkauf.'
            : 'Ein Favorit von Gaesten in deiner Naehe.',
          price: merchant.category === 'grocery' ? 24.9 : 12.9,
          image: merchant.image,
          badge: merchant.badge,
        },
        {
          id: `${merchant.id}-extra`,
          title: merchant.category === 'flowers' ? 'Blumenstrauss' : 'Extra fuer spaeter',
          description: 'Passt gut zu deiner letzten Bestellung.',
          price: merchant.category === 'flowers' ? 29.9 : 6.5,
          image: merchant.image,
        },
      ],
    },
  ]
}

function setCartFromOrder(
  order: WoltOrder,
  merchants: WoltMerchant[],
  setCart: (value: CartItem[]) => void,
  setCartOpen: (value: boolean) => void,
) {
  const merchant =
    merchants.find((entry) => order.merchant.toLowerCase().includes(entry.title.toLowerCase().split(' ')[0])) ??
    merchants[0]
  const item = fallbackMenu(merchant)[0].items[0]
  setCart([{ merchant, item: { ...item, title: `Nochmal: ${order.merchant}`, price: Number(order.total.replace(/[^\d,]/g, '').replace(',', '.')) || item.price }, quantity: 1 }])
  setCartOpen(true)
}
