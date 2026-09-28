"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, BadgeCheck, Check, ChevronRight, Gift, LockKeyhole, Search, ShoppingBag, SlidersHorizontal, Star, X } from "lucide-react";
import { TonConnectUI } from "@tonconnect/ui-react";
import { beginCell } from "@ton/core";
import { rewardProgress, type CatalogueBundle, type CatalogueRewards } from '@/lib/catalogue-commerce';
import { openCatalogueChat } from "@/lib/catalogue-navigation";
import type { CatalogueItem } from "@/lib/catalogue-core";
import { OwnedMediaCache, type OwnedMedia } from '@/lib/catalogue-owned-media';
import "./catalogue.css";
import VideoPreview from './VideoPreview';
import PhotoPreview from './PhotoPreview';
import { catalogueDisplayOrder } from '@/lib/catalogue-display-order';
import { catalogueAppearance } from '@/lib/catalogue-appearance';
import { formatTonAmount, tonPriceNanoton } from '@/lib/catalogue-ton-price';
import { compactCategories, compactItems, salePercent, shortCatalogueTitle, type CataloguePresentation } from '@/lib/catalogue-presentation';
import { parseCatalogueStartParam } from '@/lib/catalogue-start-param';

type WebApp = { initData: string; initDataUnsafe?: { start_param?: string }; ready(): void; expand(): void; close(): void; openTelegramLink(url: string): void; openInvoice?(url: string, callback: (status: string) => void): void; setHeaderColor?(color: string): void; setBackgroundColor?(color: string): void; setBottomBarColor?(color: string): void };
function app(): WebApp | undefined { return (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp; }
// Telegram usually surfaces the startapp param on initDataUnsafe; some clients
// only put it on the page URL as tgWebAppStartParam instead (query or hash).
function currentStartParam(): string | null {
  const fromApp = app()?.initDataUnsafe?.start_param;
  if (fromApp) return fromApp;
  const search = new URLSearchParams(window.location.search).get("tgWebAppStartParam");
  if (search) return search;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash).get("tgWebAppStartParam");
}
type Data = { checkoutMode?: 'chat' | 'invoice'; name: string; verified?: boolean; presentation?: CataloguePresentation; featuredBundleId?: string | null; items: CatalogueItem[]; blur: number; admin: boolean; enabled: boolean; canSend: boolean; chatUrl: string | null; purchaseNote: string; bundles:CatalogueBundle[]; rewards:CatalogueRewards|null; tonEnabled?: boolean; tonWalletAddress?: string; tonPerStar?: number | null; tonNanotonPerStar?: number | null; tonDiscountPercent?: number; tonReturnUrl?: string | null };
type Call = (action: string, payload?: Record<string, unknown>) => Promise<Response>;
const tabs = ["All", "Photos", "Videos", "Bundles"];

function ProfilePhoto({ name, photoUrl }: { name: string; photoUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const url = photoUrl;
  return <span className="cat-avatar">{url && !failed ? <img src={url} alt={`${name} Telegram profile photo`} onError={() => setFailed(true)} /> : <span aria-label={name}>{name.split(/\s+/).map(word => word[0]).slice(0, 2).join("")}</span>}</span>;
}

function DevilIcon() { return <svg width="24" height="24" viewBox="0 0 32 32" fill="none"><path d="M6 15C2 12 2 5 4 2c1 5 4 6 8 7M26 15c4-3 4-10 2-13-1 5-4 6-8 7" fill="#f03737" /><path d="M16 8C9 8 5 12 5 19s5 11 11 11 11-4 11-11S23 8 16 8Z" fill="#f03737" /><path d="m10 16 3 2m9-2-3 2M11 23c3 3 7 3 10 0" stroke="#111" strokeWidth="2" strokeLinecap="round" /></svg>; }

// Label parts for the TON button. The amount comes from the same helper the server
// charges with (lib/catalogue-ton-price.ts), so the label can never drift from the charge.
function tonLabel(stars: number, nanotonPerStar: number | null | undefined, phase: 'opening' | 'confirming' | null, discountPercent = 0): { text: string; amount: string | null } {
  if (phase === 'opening') return { text: 'Opening wallet…', amount: null };
  if (phase === 'confirming') return { text: 'Confirming on TON…', amount: null };
  const nanoton = nanotonPerStar ? tonPriceNanoton(stars, nanotonPerStar, discountPercent) : null;
  if (nanoton == null) return { text: 'Pay with TON', amount: null };
  return { text: 'Unlock · ', amount: `${formatTonAmount(nanoton)} TON` };
}

function TonMark({ onBlue = false }: { onBlue?: boolean }) {
  return <svg className="cat-ton-mark" width="18" height="18" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="28" fill={onBlue ? '#fff' : '#0098EA'}/><path d="M37.6 15.6H18.4c-3.5 0-5.8 3.8-4 6.9l11.8 20.5c.8 1.3 2.7 1.3 3.5 0l11.9-20.5c1.7-3.1-.5-6.9-4-6.9Zm-11.4 21.3-2.6-5-6.2-11.1c-.4-.7.1-1.6 1-1.6h7.8v17.7Zm12.6-16.1-6.2 11.1-2.6 5V19.2h7.8c.9 0 1.4.9 1 1.6Z" fill={onBlue ? '#0098EA' : '#fff'}/></svg>;
}

function TonButtonLabel({ stars, nanotonPerStar, phase, discountPercent }: { stars: number; nanotonPerStar: number | null | undefined; phase: 'opening' | 'confirming' | null; discountPercent?: number }) {
  const label = tonLabel(stars, nanotonPerStar, phase, discountPercent);
  return <>{label.text}{label.amount && <span className="cat-ton-amount"><TonMark onBlue />{label.amount}</span>}{!phase && !!discountPercent && <span className="cat-ton-tag">{discountPercent}% off</span>}</>;
}

type TonPricing = { nanotonPerStar: number; discountPercent: number } | null;
// Card price row when TON is on: TON pill first (with the discount tag above it), then Stars.
// Same rounding helper as the server charge, so the card price is the charged price.
function CardPrices({ stars, ton }: { stars: number; ton: TonPricing }) {
  const nanoton = ton ? tonPriceNanoton(stars, ton.nanotonPerStar, ton.discountPercent) : null;
  if (nanoton == null) return null;
  return <span className="cat-card-prices">
    <span className="cat-card-ton">{!!ton?.discountPercent && <span className="cat-card-ton-tag">{ton.discountPercent}% off</span>}<span className="cat-card-ton-value"><TonMark onBlue />{formatTonAmount(nanoton)} TON</span></span>
    <span className="cat-card-stars">⭐{stars.toLocaleString()}<span className="cat-sr-only"> Stars</span></span>
  </span>;
}

function Preview(props: { item: CatalogueItem; blur: number; call: Call; retryable?: boolean }) {
  return props.item.type === 'video' ? <VideoPreview {...props} retryable={props.retryable ?? true} /> : <PhotoPreview {...props} />;
}

function BundleCard({ bundle, items, blur, call, busy, owner = false, onUnlock, onDetails, compact = false, label, actionLabel, ton = null }: {
  bundle: CatalogueBundle; items: CatalogueItem[]; blur: number; call: Call;
  busy: boolean; owner?: boolean; onUnlock: () => void; onDetails?: () => void; compact?: boolean; label?: string; actionLabel?: string; ton?: TonPricing;
}) {
  const bundleTon = bundle.owned || bundle.partial ? null : ton;
  if (compact) {
    const discount = salePercent(bundle);
    const photos = bundle.photoIds.map(id => items.find(item => item.type === 'photo' && item.id === id)).filter((item): item is CatalogueItem => !!item);
    return <article className="cat-bundle-card cat-compact-bundle" aria-label={label ?? bundle.title}>
      <button type="button" className="cat-bundle-details-button" onClick={onDetails} aria-label={`View ${bundle.title}, ${bundle.photoIds.length} photos and bundle details`}>
        <span className="cat-bundle-stack">{photos.slice(0, 4).map((item, index) => <span key={item.id} className="cat-bundle-stack-card" style={{'--stack-index': index} as CSSProperties}><Preview item={item} blur={blur} call={call} retryable={false} /></span>)}<span className="cat-bundle-stack-count">{bundle.photoIds.length} pics</span></span>
      </button>
      <div className="cat-bundle-copy">
        <h3>{bundle.title}</h3>
        {bundle.caption && <p className="cat-bundle-caption">{bundle.caption}</p>}
        {discount !== null && <p className="cat-bundle-saving">{discount}% off <span aria-hidden="true">·</span> <s>⭐{bundle.regularStars.toLocaleString()}</s></p>}
        <CardPrices stars={bundle.stars} ton={bundleTon} />
        <button type="button" className="cat-primary" aria-label={actionLabel?.startsWith('Pay ·') ? `Pay in Telegram for ${bundle.stars.toLocaleString()} Stars` : undefined} disabled={busy || bundle.partial || owner} onClick={onUnlock}>
          {busy ? 'Opening…' : owner ? 'Preview only' : actionLabel ?? (bundle.owned ? 'View bundle' : bundle.partial ? 'Partly owned' : `Unlock · ⭐${bundle.stars.toLocaleString()}`)}
        </button>
      </div>
    </article>;
  }
  return <article className="cat-bundle-card" aria-label={label ?? bundle.title}>
    <div className="cat-bundle-mosaic">{bundle.photoIds.map(id=>{const item=items.find(p=>p.type==='photo'&&p.id===id);return item?<Preview key={id} item={item} blur={blur} call={call}/>:null;})}</div>
    <div className="cat-bundle-copy"><span className="cat-featured-label">Photo bundle</span><h3>{bundle.title.replace(/^Photo collection/i,'Bundle')}</h3>
      <p className="cat-bundle-saving">{bundle.photoIds.length} photos · Save {(bundle.regularStars-bundle.stars).toLocaleString()} Stars</p>
      <div className="cat-bundle-price">{bundleTon ? <CardPrices stars={bundle.stars} ton={bundleTon} /> : <strong><Star className="cat-stars" size={18} aria-hidden="true"/>{bundle.stars.toLocaleString()} Stars</strong>}<s>{bundle.regularStars.toLocaleString()}</s></div>
      <button className="cat-primary" disabled={busy||bundle.partial} onClick={onUnlock}>{busy?'Sending…':bundle.owned?'View in chat':bundle.partial?'Partly owned':`Unlock for ${bundle.stars.toLocaleString()} Stars`}</button>
    </div>
  </article>;
}

export default function Catalogue({ slug, preview }: { slug: string; preview: boolean }) {
  const appearance = catalogueAppearance(slug);
  const refined = !!appearance;
  const [ready, setReady] = useState(preview);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState("All");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<CatalogueItem | null>(null);
  const [ownedMedia, setOwnedMedia] = useState<OwnedMedia | null>(null);
  const ownedCache = useRef(new OwnedMediaCache());
  const [contentBusy, setContentBusy] = useState(false);
  const [contentError, setContentError] = useState('');
  const contentRequest = useRef(0);
  const checkoutOrders = useRef(new Map<string, { orderId: string; invoiceUrl: string }>());
  const [paymentWaiting, setPaymentWaiting] = useState<Set<string>>(() => new Set());
  const [checkoutPhase, setCheckoutPhase] = useState<'opening' | 'confirming' | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<CatalogueBundle | null>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const [blur, setBlur] = useState(16);
  const [renderBlur, setRenderBlur] = useState(16);
  const [paidFallback, setPaidFallback] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rewardsOpen,setRewardsOpen]=useState(false);
  const [bundleIndex, setBundleIndex] = useState(0);
  const bundleTrack = useRef<HTMLDivElement>(null);
  const [commerceBusy,setCommerceBusy]=useState(false);
  const [delivered, setDelivered] = useState<Set<string>>(() => new Set());
  const sending = useRef(false);
  const [notice, setNotice] = useState("");
  const [setup, setSetup] = useState<{ username: string; hasMainApp: boolean; appUrl: string } | null>(null);
  const [pageSize, setPageSize] = useState(12);
  const requestKeys = useRef(new Map<string, string>());
  const tonConnectRef = useRef<InstanceType<typeof TonConnectUI> | null>(null);
  const [tonPhase, setTonPhase] = useState<null | 'opening' | 'confirming'>(null);
  const [tonWalletAddress, setTonWalletAddress] = useState('');
  const [tonPerStar, setTonPerStar] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => ownedCache.current.clear(), []);
  useEffect(() => {
    if (data) ownedCache.current.retain(new Set(data.items.filter(item => item.purchased || item.free).map(item => `${item.type}:${item.id}`)));
  }, [data]);
  const call = useCallback<Call>((action, payload = {}) => fetch(`/api/catalogue/${encodeURIComponent(slug)}`, {
    signal: AbortSignal.timeout(action === 'preview' && payload.type === 'video' ? 60_000 : 20_000), method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-telegram-init-data": app()?.initData ?? "" },
    body: JSON.stringify({ ...payload, action, preview }),
  }), [slug, preview]);
  const read = useCallback(async (action: string, payload?: Record<string, unknown>) => {
    const response = await call(action, payload); const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Please try again.");
    return result;
  }, [call]);
  // Fire-and-forget funnel step. The server no-ops this for owner preview and
  // never trusts anything from it beyond the event name and item reference.
  const logEvent = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (preview) return;
    void call("event", { event, ...payload }).catch(() => {});
  }, [call, preview]);
  const load = useCallback(async () => {
    setError("");
    try { const value: Data = await read("catalogue"); setData(value); if (value.presentation === 'compact') setSection(current => current === 'All' ? 'Explore' : current); setSelected(current => current ? value.items.find(item => item.id === current.id && item.type === current.type) ?? current : null); setSelectedBundle(current => current ? value.bundles.find(bundle => bundle.id === current.id) ?? current : null); setBlur(value.blur); setRenderBlur(value.blur); if (value.admin) { setTonWalletAddress(value.tonWalletAddress ?? ''); setTonPerStar(value.tonPerStar != null ? String(value.tonPerStar) : ''); } return value; }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't load the catalogue."); }
  }, [read]);
  useEffect(() => { if (ready) {
    const telegram = app(); telegram?.ready(); telegram?.expand();
    for (const method of ['setHeaderColor', 'setBackgroundColor', 'setBottomBarColor'] as const) {
      try { telegram?.[method]?.('#000000'); } catch { /* Older Telegram versions may not support every colour setter. */ }
    }
    void load();
  } }, [ready, load]);
  const startParamHandled = useRef(false);
  useEffect(() => {
    // Deep link from the bot: https://t.me/<bot>?startapp=item_<photo|video|bundle>_<uuid>.
    // Only opens something already in the loaded catalogue; junk or an unknown
    // id is a normal load. Runs once, on the first successful catalogue load.
    if (!data || startParamHandled.current || preview) return;
    startParamHandled.current = true;
    const parsed = parseCatalogueStartParam(currentStartParam());
    if (!parsed) return;
    if (parsed.type === 'bundle') {
      const bundle = data.bundles.find(b => b.id === parsed.id);
      if (bundle) openBundle(bundle, document.body);
    } else {
      const item = data.items.find(i => i.type === parsed.type && i.id === parsed.id);
      if (item) openItem(item, document.body);
    }
  }, [data, preview]);
  useEffect(() => {
    if (data?.presentation !== 'compact') return;
    const telegram = app();
    for (const method of ['setHeaderColor', 'setBackgroundColor', 'setBottomBarColor'] as const) {
      try { telegram?.[method]?.('#1b1c1e'); } catch { /* Older clients may omit a colour setter. */ }
    }
  }, [data?.presentation]);
  useEffect(()=>{
    if(!ready||preview) return;
    const refresh=()=>{if(document.visibilityState==='visible'&&!sending.current) void load();};
    const timer=window.setInterval(refresh,30_000);document.addEventListener('visibilitychange',refresh);
    return ()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[ready,preview,load]);
  useEffect(() => { const timer = window.setTimeout(() => setRenderBlur(blur), 450); return () => window.clearTimeout(timer); }, [blur]);
  useEffect(() => { setPageSize(12); }, [section, search]);
  useEffect(() => {
    if (!selected && !selectedBundle) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy && !commerceBusy) closeDetails(); };
    document.addEventListener("keydown", fn); const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", fn); document.body.style.overflow = old; };
  }, [selected, selectedBundle, busy, commerceBusy]);
  function closeDetails() { contentRequest.current++; setOwnedMedia(null); setContentError(''); setContentBusy(false); setSelected(null); setSelectedBundle(null); requestAnimationFrame(() => detailTrigger.current?.focus()); }
  function openItem(item: CatalogueItem, trigger: HTMLElement) {
    contentRequest.current++; detailTrigger.current = trigger; setSelectedBundle(null); setSelected(item); setOwnedMedia(null); setContentError(''); setContentBusy(false); setNotice('');
    logEvent('view_item', { mediaType: item.type, mediaId: item.id });
    if (!data?.admin && data?.checkoutMode === 'invoice' && (item.purchased || item.free)) void loadContent(item);
  }
  function openBundle(bundle: CatalogueBundle, trigger: HTMLElement) { contentRequest.current++; detailTrigger.current = trigger; setSelected(null); setOwnedMedia(null); setSelectedBundle(bundle); setNotice(""); logEvent('view_bundle', { mediaType: 'bundle', mediaId: bundle.id }); }
  function backToChat() {
    openCatalogueChat(data?.chatUrl, app(), url => { window.location.href = url; }, (callback, delay) => window.setTimeout(callback, delay));
  }
  async function loadContent(item: CatalogueItem, retry = false) {
    if (item.received && !item.purchased && !item.free) { backToChat(); return; }
    const attempt = ++contentRequest.current;
    const key = `${item.type}:${item.id}`;
    if (retry) ownedCache.current.delete(key);
    const cached = (item.purchased || item.free) && ownedCache.current.get(key);
    if (cached) { setOwnedMedia(cached); setContentError(''); setContentBusy(false); return; }
    setContentBusy(true); setContentError('');
    try {
      const result = await read('content', { type: item.type, id: item.id });
      const media = await ownedCache.current.prepare(key, { url: result.url, type: result.type });
      if (mounted.current && attempt === contentRequest.current) setOwnedMedia(media);
    } catch (e) {
      if (mounted.current && attempt === contentRequest.current) setContentError(e instanceof Error ? e.message : 'Could not load your item.');
    } finally { if (mounted.current && attempt === contentRequest.current) setContentBusy(false); }
  }
  async function finishCheckout(type: 'photo' | 'video' | 'bundle', id: string) {
    setPaymentWaiting(previous => { const next = new Set(previous); next.delete(`${type}:${id}`); return next; });
    // Delivery goes to the chat, so leave the app first; a failed catalogue refresh must not block it.
    // If Telegram keeps the app open, offer the chat link.
    setSelected(null); setSelectedBundle(null);
    backToChat();
    window.setTimeout(() => setPaidFallback(true), 1500);
    void load();
  }
  async function checkout(type: 'photo' | 'video' | 'bundle', id: string) {
    if (sending.current) return;
    if (data?.admin) { setNotice('Owner preview. Payments are disabled here.'); return; }
    if (!app()?.openInvoice) { setNotice('Open this catalogue inside Telegram to pay with Stars.'); return; }
    const key = `${type}:${id}`;
    logEvent('tap_pay_stars', { mediaType: type, mediaId: id, rail: 'stars' });
    sending.current = true; setBusy(true); setCommerceBusy(true); setCheckoutPhase('opening'); setNotice('');
    try {
      let order = checkoutOrders.current.get(key);
      let resumePending = paymentWaiting.has(key);
      if (order) {
        const status = await read('checkout_status', { orderId: order.orderId });
        if (status.status === 'paid') { await finishCheckout(type, id); return; }
        if (status.status === 'checkout' && status.retryAfterSeconds > 0) resumePending = true;
        else if (status.status === 'checkout' && status.retryAfterSeconds === 0) resumePending = false;
        if (['expired', 'refunded'].includes(status.status)) {
          checkoutOrders.current.delete(key); requestKeys.current.delete(`checkout:${key}`); order = undefined; resumePending = false;
          setPaymentWaiting(previous => { const next = new Set(previous); next.delete(key); return next; });
        }
      }
      for (let recovery = 0; !order && recovery < 2; recovery++) {
        if (!requestKeys.current.has(`checkout:${key}`)) requestKeys.current.set(`checkout:${key}`, crypto.randomUUID());
        const result = await read('checkout', { type, id, requestKey: requestKeys.current.get(`checkout:${key}`) });
        if (result.status === 'paid') { await finishCheckout(type, id); return; }
        if (['expired', 'refunded'].includes(result.status)) {
          checkoutOrders.current.delete(key); requestKeys.current.delete(`checkout:${key}`);
          setPaymentWaiting(previous => { const next = new Set(previous); next.delete(key); return next; });
          if (result.status === 'refunded') { setNotice('This payment was refunded.'); await load(); return; }
          // Recover a lost response/expired key inside this click. Never reopen
          // the terminal invoice or ask the fan to tap Unlock a second time.
          continue;
        }
        order = { orderId: result.orderId, invoiceUrl: result.invoiceUrl };
        checkoutOrders.current.set(key, order);
        if (result.status === 'checkout') {
          const status = await read('checkout_status', { orderId: order.orderId });
          if (status.status === 'paid') { await finishCheckout(type, id); return; }
          resumePending = status.retryAfterSeconds > 0;
        }
      }
      if (!order) throw new Error('Payment could not open. Please try again.');
      const activeOrder = order;
      const callbackStatus = resumePending ? 'pending' : await new Promise<string>((resolve, reject) => {
        let done = false;
        const timer = window.setTimeout(() => { if (!done) { done = true; resolve('pending'); } }, 90_000);
        try { app()!.openInvoice!(activeOrder.invoiceUrl, status => { if (!done) { done = true; window.clearTimeout(timer); resolve(status); } }); }
        catch (e) { done = true; window.clearTimeout(timer); reject(e); }
      });
      if (!mounted.current) return;
      setCheckoutPhase('confirming');
      if (callbackStatus === 'paid' || callbackStatus === 'pending') setPaymentWaiting(previous => new Set(previous).add(key));
      // Telegram's callback is only a hint. Only our server's settled payment grants access.
      let canRetry = false;
      for (let attempt = 0; attempt < (callbackStatus === 'paid' || callbackStatus === 'pending' ? 32 : 1); attempt++) {
        const result = await read('checkout_status', { orderId: activeOrder.orderId });
        canRetry = result.status === 'pending' || (result.status === 'checkout' && result.retryAfterSeconds === 0);
        if (result.status === 'paid') { await finishCheckout(type, id); return; }
        if (['expired', 'refunded'].includes(result.status)) {
          checkoutOrders.current.delete(key); requestKeys.current.delete(`checkout:${key}`);
          setPaymentWaiting(previous => { const next = new Set(previous); next.delete(key); return next; });
          setNotice(result.status === 'refunded' ? 'This payment was refunded.' : 'This payment expired. You can try again.'); return;
        }
        if (attempt < 31 && callbackStatus !== 'cancelled' && callbackStatus !== 'failed') await new Promise(resolve => window.setTimeout(resolve, 2000));
        if (!mounted.current) return;
      }
      if (canRetry) setPaymentWaiting(previous => { const next = new Set(previous); next.delete(key); return next; });
      if (callbackStatus === 'cancelled') logEvent('pay_cancel', { mediaType: type, mediaId: id, rail: 'stars' });
      setNotice(callbackStatus === 'cancelled' ? 'Payment cancelled. You have not unlocked this item.' : callbackStatus === 'failed' ? 'Payment did not complete. You can try again. If Stars were deducted, check My purchases first.' : canRetry ? 'No payment confirmation yet. You can reopen this payment. Any duplicate charge will be refunded.' : 'Payment is still being confirmed. Tap Check payment to refresh.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not open payment. Please try again.'); }
    finally { sending.current = false; if (mounted.current) { setBusy(false); setCommerceBusy(false); setCheckoutPhase(null); } }
  }
  function tonConnect(): InstanceType<typeof TonConnectUI> {
    // Built lazily on the fan's first tap of "Pay with TON", never on page load.
    if (!tonConnectRef.current) {
      tonConnectRef.current = new TonConnectUI({ manifestUrl: `${window.location.origin}/tonconnect-manifest.json` });
      // Send the fan back into this Mini App after approving in their wallet app.
      if (data?.tonReturnUrl) tonConnectRef.current.uiOptions = { actionsConfiguration: { twaReturnUrl: data.tonReturnUrl as `${string}://${string}` } };
    }
    return tonConnectRef.current;
  }
  async function payWithTon(type: 'photo' | 'video' | 'bundle', id: string) {
    if (sending.current) return;
    if (data?.admin) { setNotice('Owner preview. Payments are disabled here.'); return; }
    logEvent('tap_pay_ton', { mediaType: type, mediaId: id, rail: 'ton' });
    sending.current = true; setBusy(true); setCommerceBusy(true); setTonPhase('opening'); setNotice('');
    try {
      const begin = await read('ton_checkout', { type, id });
      const payload = beginCell().storeUint(0, 32).storeStringTail(String(begin.comment)).endCell().toBoc().toString('base64');
      try {
        const ui = tonConnect();
        // sendTransaction throws if no wallet is connected; open the wallet picker first.
        const alreadyConnected = ui.connected;
        if (!alreadyConnected) await ui.connectWallet();
        if (!alreadyConnected) logEvent('wallet_connected', { rail: 'ton' });
        await ui.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [{ address: String(begin.toAddress), amount: String(begin.amountNanoton), payload }],
        });
      } catch {
        // A wallet rejection or cancel never unlocks anything. The order stays
        // pending in the database until it expires; the fan can just retry.
        logEvent('pay_cancel', { mediaType: type, mediaId: id, rail: 'ton' });
        setNotice('Payment cancelled. You have not unlocked this item.'); return;
      }
      if (!mounted.current) return;
      setTonPhase('confirming');
      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        if (!mounted.current) return;
        const status = await read('ton_status', { orderId: begin.orderId });
        // Only a confirmed status from our server unlocks anything, never the
        // sendTransaction promise resolving.
        if (status.status === 'confirmed' || status.status === 'delivered') { await finishCheckout(type, id); return; }
        if (status.status === 'expired') { setNotice('This payment expired. You can try again.'); return; }
        await new Promise(resolve => window.setTimeout(resolve, 3000));
        if (!mounted.current) return;
      }
      setNotice('Still confirming on TON. Reopen this item in a moment to check again.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not start TON payment. Please try again.'); }
    finally { sending.current = false; if (mounted.current) { setBusy(false); setCommerceBusy(false); setTonPhase(null); } }
  }
  async function saveTon() {
    setBusy(true);
    try {
      await read('settings', { blur, tonWalletAddress: tonWalletAddress.trim(), tonPerStar: tonPerStar === '' ? '' : tonPerStar });
      setData(v => v && ({ ...v, tonWalletAddress: tonWalletAddress.trim(), tonPerStar: tonPerStar === '' ? null : Number(tonPerStar) }));
      setNotice('TON settings saved.');
    } catch (e) { setNotice(String((e as Error).message)); } finally { setBusy(false); }
  }
  function unlockBundle(bundle: CatalogueBundle) {
    if (data?.checkoutMode === 'invoice') {
      if (bundle.owned) openBundle(bundle, document.activeElement as HTMLElement);
      else { openBundle(bundle, document.activeElement as HTMLElement); void checkout('bundle', bundle.id); }
    } else if (bundle.owned || delivered.has(`bundle:photo:${bundle.id}`)) backToChat();
    else void sendCommerce('bundle', bundle.id);
  }
  async function sendItem(item: CatalogueItem) {
    if (data?.checkoutMode === 'invoice') {
      if (item.received && !item.purchased && !item.free) backToChat();
      else if (item.purchased || item.free) void loadContent(item);
      else void checkout(item.type, item.id);
      return;
    }
    if (sending.current) return;
    if (data?.admin) { setNotice("This is your preview. Sending is disabled here."); return; }
    if (item.received || item.purchased || delivered.has(`${item.type}:${item.id}`)) { backToChat(); return; }
    sending.current = true; setBusy(true); setNotice("");
    try {
      const key = `${item.type}:${item.id}`;
      if (!requestKeys.current.has(key)) requestKeys.current.set(key, crypto.randomUUID());
      let result = await read("request", { type: item.type, id: item.id, requestKey: requestKeys.current.get(key) });
      for (let i = 0; i < 25 && ["pending", "sending"].includes(result.status); i++) {
        await new Promise(r => window.setTimeout(r, 2000));
        if (!mounted.current) return;
        result = await read("status", { id: result.id });
      }
      if (["failed", "expired"].includes(result.status)) requestKeys.current.delete(key);
      if (result.status === "delivered") {
        setDelivered(previous => new Set(previous).add(key));
        setNotice(item.free ? "Your item is ready in chat." : result.reused ? `This payment card is already in your chat. Open it there to pay ${item.stars.toLocaleString()} Stars.` : `Your payment card is ready. Open chat, then tap its ${item.stars.toLocaleString()} Stars button to confirm.`);
      } else {
        setNotice(result.result || "Still processing. Check the chat before trying again.");
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Please try again."); }
    finally { sending.current = false; if (mounted.current) setBusy(false); }
  }
  async function sendCommerce(type:'bundle'|'reward',id:string,rewardType:'photo'|'video'='photo') {
    if(sending.current) return;
    if(delivered.has(`${type}:${rewardType}:${id}`)){backToChat();return;}
    if(data?.admin){setNotice('Owner preview. No items are sent here.');return;}
    if(!data?.canSend){backToChat();return;}
    sending.current=true;setCommerceBusy(true);setNotice('');
    const key=`${type}:${rewardType}:${id}`;
    try {
      if(!requestKeys.current.has(key)) requestKeys.current.set(key,crypto.randomUUID());
      let result=await read('request',{type,id,rewardType,requestKey:requestKeys.current.get(key)});
      for(let i=0;i<25&&['pending','sending'].includes(result.status);i++){
        await new Promise(r=>window.setTimeout(r,2000));if(!mounted.current)return;
        result=await read('status',{id:result.id});
      }
      if(['failed','expired'].includes(result.status))requestKeys.current.delete(key);
      if(result.status==='delivered'){setDelivered(previous=>new Set(previous).add(key));setNotice(type==='reward'?'Reward sent. No Stars charged.':result.reused?'This bundle payment card is already in your chat. Open it there to confirm payment.':'Your bundle payment card is ready in chat. Open it there to confirm payment.');}
      else setNotice(result.result||'Still processing. Check your chat before trying again.');
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:'Please try again.');}
    finally{sending.current=false;if(mounted.current)setCommerceBusy(false);}
  }
  async function saveBlur() {
    setBusy(true);
    try { await read("settings", { blur }); setData(v => v && ({ ...v, blur })); setNotice("Preview blur saved."); }
    catch (e) { setNotice(String((e as Error).message)); } finally { setBusy(false); }
  }
  async function inspectSetup() {
    try { setSetup(await read("setup")); } catch (e) { setNotice((e as Error).message); }
  }
  async function activate() {
    setBusy(true);
    try { await read("activate"); setNotice("Catalogue enabled. The pinned button updates after the fan's next message."); await load(); }
    catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  const compact = data?.presentation === 'compact';
  const tonPricing: TonPricing = data?.tonEnabled && data.tonNanotonPerStar ? { nanotonPerStar: data.tonNanotonPerStar, discountPercent: data.tonDiscountPercent ?? 0 } : null;
  const filteredItems = compact ? compactItems(data?.items ?? [], section, search) : (data?.items ?? []).filter(item => {
    if (search) return item.description.toLowerCase().includes(search.toLowerCase());
    if (section === "Free Content") return item.free;
    if (section === "Photos") return item.type === "photo" && !item.free;
    if (section === "Videos") return item.type === "video" && !item.free;
    if (section === "My Purchases") return item.purchased;
    if (section === "Discounted" || section === "Bundles") return false;
    return true;
  });
  const ownedCount = data ? data.items.filter(item => item.purchased).length : 0;
  const trendingView = compact && section === 'Explore' && !search;
  const ordered = !search && (section === 'All' || section === 'Explore' || section === 'Videos')
    ? catalogueDisplayOrder(filteredItems, slug, section === 'All' || section === 'Explore') : filteredItems;
  const visible = trendingView
    ? [...ordered.filter(item => item.rank).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)), ...ordered.filter(item => !item.rank)]
    : ordered;
  const featuredBundle=data?.bundles.find(bundle=>bundle.id===data.featuredBundleId);
  const browseBundles = data?.bundles ?? [];
  const rewards=data?.rewards;
  const progress=rewards?rewardProgress(rewards):null;
  const rewardItems=rewards?data!.items.filter(p=>(p.type==='photo'?rewards.photoIds:rewards.videoIds??[]).includes(p.id)):[];
  return <main className={`catalogue${refined ? ' catalogue-refined' : ''}${compact ? ' catalogue-compact' : ''}`}>
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => { setReady(true); }} />
    <div className="cat-shell">
      <header className="cat-header">{!compact && <button className="cat-icon" aria-label="Back to chat" onClick={backToChat}><ArrowLeft size={21} /></button>}
        {data && <ProfilePhoto name={data.name} photoUrl={appearance?.profilePhoto} />}
        <div className="cat-identity"><h1>{data?.name || "Your catalogue"}{data?.verified && (compact
          ? <img className="cat-approved-badge" src="/brand/catalogue/approved-blue-badge.png" width="24" height="24" alt="Verified creator" />
          : <BadgeCheck className="cat-verified-badge" size={22} aria-label="Creator verified by Twin" />)}</h1></div>
        {compact && <button className="cat-message cat-header-action" aria-label="Message me" title="Message me" onClick={backToChat}><span>Message</span></button>}
        {data?.admin ? <button className="cat-icon" aria-label="Catalogue settings" onClick={() => setSettingsOpen(v => !v)}><SlidersHorizontal size={21} /></button>
          : !compact && <button className="cat-icon" aria-label="My purchases" onClick={() => { setSection("My Purchases"); setSearch(""); document.getElementById("catalogue-items")?.scrollIntoView({ behavior: "smooth" }); }}><ShoppingBag size={19} /></button>}
        {compact && !data?.admin && <button className="cat-purchases-control cat-header-action" aria-label="My purchases" title="My purchases" onClick={() => { setSection("My Purchases"); setSearch(""); document.getElementById("catalogue-items")?.scrollIntoView({ behavior: "smooth" }); }}><ShoppingBag size={19} aria-hidden="true" /><span className="cat-purchases-label">My purchases</span>{ownedCount > 0 && <span className="cat-purchases-count">{ownedCount}</span>}</button>}
      </header>
      {data?.admin && <div className="cat-admin-label">Owner preview <span>{data.enabled ? "Catalogue enabled" : "Not live for fans"}</span></div>}
      {settingsOpen && data?.admin && <section className="cat-settings"><h2>Preview blur</h2>
        <div className="cat-presets">{[[6, "Light"], [16, "Medium"], [30, "Heavy"]].map(([n, label]) => <button key={n} onClick={() => setBlur(Number(n))} className={blur === n ? "active" : ""}>{label}</button>)}</div>
        <label htmlFor="blur-strength">Strength <strong>{blur}</strong></label><input id="blur-strength" type="range" min="4" max="40" value={blur} onChange={e => setBlur(Number(e.target.value))} />
        <button className="cat-primary" disabled={busy} onClick={saveBlur}>Save blur</button>
        <button className="cat-secondary" onClick={inspectSetup}>Check Telegram setup</button>
        {setup && <div className="cat-setup"><p>Bot: @{setup.username}</p><p>In BotFather, set the Main Mini App URL to:</p><code>{setup.appUrl}</code>
          <p>{setup.hasMainApp ? "A Main Mini App is configured. Confirm its URL matches above before enabling." : "The Main Mini App still needs to be configured."}</p>
          <button className="cat-primary" disabled={busy || !setup.hasMainApp} onClick={activate}>URL checked, enable catalogue</button></div>}
        <h2>Pay with TON</h2>
        <label htmlFor="ton-wallet">TON wallet address <span title="Fans send TON straight to this wallet address. Leave both fields blank to keep Pay with TON hidden for this collection.">ⓘ</span></label>
        <input id="ton-wallet" type="text" value={tonWalletAddress} onChange={e => setTonWalletAddress(e.target.value)} placeholder="UQ..." />
        <label htmlFor="ton-rate">TON per Star <span title="Sets every item's TON price from its Stars price. For example, 0.002 means 1 Star costs 0.002 TON. Both this and the wallet address must be set to turn Pay with TON on.">ⓘ</span></label>
        <input id="ton-rate" type="number" step="0.000000001" min="0" value={tonPerStar} onChange={e => setTonPerStar(e.target.value)} placeholder="0.002" />
        <button className="cat-primary" disabled={busy} onClick={saveTon}>Save TON settings</button>
      </section>}
      {error ? <div className="cat-empty"><LockKeyhole /><h2>{error}</h2>{preview && <a className="cat-primary" href={`/twin?next=${encodeURIComponent(`/catalogue/${slug}?preview=1`)}`}>Sign in</a>}<button className="cat-secondary" onClick={load}>Try again</button></div>
        : !data ? <div className="cat-empty" aria-live="polite">Loading your collection…</div> : <>
        {!compact && featuredBundle && <section className="cat-daily-sale" aria-labelledby="daily-sale-title">
          <h2 id="daily-sale-title"><span aria-hidden="true">😈</span><span>Daddy’s Daily Reward Sale</span><span aria-hidden="true">😈</span></h2>
          <BundleCard bundle={featuredBundle} items={data.items} blur={renderBlur} call={call} busy={commerceBusy} owner={compact && data.admin} compact={compact} onDetails={() => openBundle(featuredBundle, document.activeElement as HTMLElement)} actionLabel={paymentWaiting.has(`bundle:${featuredBundle.id}`) ? 'Check payment' : data.checkoutMode !== 'invoice' ? featuredBundle.owned ? 'View in chat' : featuredBundle.partial ? 'Partly owned' : delivered.has(`bundle:photo:${featuredBundle.id}`) ? 'Open payment in chat' : `Pay · ⭐${featuredBundle.stars.toLocaleString()}` : undefined} onUnlock={()=>unlockBundle(featuredBundle)} ton={tonPricing} />
        </section>}
        {rewards&&progress&&<section className="cat-rewards" aria-label="Your loyalty rewards">
          <button className="cat-reward-summary" aria-label="Rewards Daddy" aria-expanded={rewardsOpen} aria-controls="catalogue-reward-details" onClick={()=>setRewardsOpen(v=>!v)}>
          <div className="cat-reward-heading"><span className="cat-mascot" aria-hidden="true"><DevilIcon /></span><h2>Rewards Daddy</h2>{!!rewards.welcomeBonus&&<span className="cat-welcome-bonus" aria-label={`${rewards.welcomeBonus.toLocaleString()} one-time welcome points`}><Gift size={12} aria-hidden="true"/>+{rewards.welcomeBonus.toLocaleString()} {refined ? 'gift' : 'welcome points'}</span>}</div>
          <div className="cat-reward-track"><div className="cat-reward-meter-wrap"><div className="cat-reward-target"><strong>{Math.max(0,rewards.balance).toLocaleString()}</strong><span>/ <b>{rewards.cost.toLocaleString()}</b> points</span></div><div className="cat-reward-meter" role="progressbar" aria-label="Progress to next reward" aria-valuemin={0} aria-valuemax={rewards.cost} aria-valuenow={Math.min(rewards.cost,Math.max(0,rewards.balance))}><span style={{width:`${progress.percent}%`}}/></div><p>{progress.ready?'Your reward is ready':`${progress.remaining.toLocaleString()} ${refined ? 'points to go' : 'points to your next reward'}`}</p></div>
            <span className="cat-reward-stack" aria-hidden="true">
              {rewardItems.length ? rewardItems.slice(0,4).map((item,index)=><span className="cat-reward-stack-card" key={`${item.type}:${item.id}`} style={{'--card-index':index,'--card-count':Math.min(4,rewardItems.length)} as CSSProperties}><Preview item={item} blur={renderBlur} call={call} retryable={false}/><span className="cat-stack-lock"><LockKeyhole size={12}/></span></span>) : <Gift size={26}/>}
              {!!rewardItems.length&&<span className="cat-stack-count">{rewardItems.length} choices</span>}
            </span>
          </div>
          <span className="cat-reward-discover"><span>{rewardsOpen?'Hide rewards':'Explore your rewards'}</span><ChevronRight className="cat-reward-chevron" size={18} aria-hidden="true"/></span>
          </button>
          {rewardsOpen&&<div id="catalogue-reward-details">
          <div className="cat-reward-balance"><div><span>Your balance</span><strong>{Math.max(0,rewards.balance).toLocaleString()} <small>points</small></strong></div><div><strong>{rewards.cost.toLocaleString()}</strong><span>per reward</span></div></div>
          <p className="cat-reward-earning">Any media purchase or Stars payment earns points. <strong>1 Star = 1 point.</strong></p>
          {!!rewards.welcomeBonus&&<p className="cat-reward-gift"><Gift size={15} aria-hidden="true"/>Includes your one-time {rewards.welcomeBonus.toLocaleString()}-point welcome gift.</p>}
          <button className="cat-secondary cat-reward-cta" disabled={commerceBusy||!rewardItems.length} onClick={()=>document.getElementById("catalogue-reward-choices")?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}>{rewardItems.length?progress.ready?'Claim a photo or video':'Browse available rewards':'You own all current rewards'}</button>
          <details><summary>How rewards work</summary><p>Earn 1 point per Star spent on confirmed payments with {data.name}, in chat or here, from {new Date(rewards.startsAt).toLocaleDateString()}. Redeem {rewards.cost.toLocaleString()} points for a photo or video from the available rewards you do not own. Points are not Telegram Stars or cash. Refunds reverse points. Payment updates may take a minute.</p>{!rewards.videoIds?.length&&<p>Photo rewards available now. Video rewards will appear when added.</p>}</details>
          <div id="catalogue-reward-choices" className="cat-reward-choices">{rewardItems.map(item=><article key={`${item.type}:${item.id}`}><Preview item={item} blur={renderBlur} call={call}/><p>{item.description}</p><button className="cat-secondary" disabled={commerceBusy||!progress.ready} onClick={()=>void sendCommerce('reward',item.id,item.type)}>{commerceBusy?'Sending…':progress.ready?`Claim · ${rewards.cost.toLocaleString()} points`:`${progress.remaining.toLocaleString()} more points`}</button></article>)}</div>
          </div>}
        </section>}
        <div className="cat-navigation"><nav className="cat-tabs" aria-label="Catalogue categories">{(compact ? [...compactCategories] : [...(data.items.some(i => i.free) ? ["Free Content"] : []), ...tabs]).map(tab =>
          <button key={tab} className={section === tab && !search ? "active" : ""} aria-current={section === tab && !search ? "page" : undefined} onClick={() => { setSection(tab); setSearch(""); setBundleIndex(0); }}>{compact && tab === 'Explore' ? 'Trending' : tab}</button>)}</nav>
        {compact && <button className="cat-search-toggle" aria-label="Search collection" title="Search collection" aria-expanded={searchOpen} onClick={() => setSearchOpen(v => !v)}><Search size={18} aria-hidden="true"/></button>}</div>
        {compact && searchOpen && <label className="cat-search"><Search size={18} /><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search descriptions…" aria-label="Search descriptions" />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={16} /></button>}</label>}
        <div id="catalogue-items" className={`cat-section-heading${(section === "All" || section === "Explore") && !search ? " cat-section-heading-default" : ""}`}><h2>{search ? "Search results" : section}</h2><span>{!search&&section==='Bundles'?`${browseBundles.length} ${browseBundles.length === 1 ? 'bundle' : 'bundles'}`:`${visible.length} ${visible.length===1?'item':'items'}`}</span></div>
        {section === "My Purchases" && <p className="cat-purchase-note">{data.purchaseNote}</p>}
        {!search&&section==='Bundles'&&!!browseBundles.length&&<section className="cat-bundle-section" aria-label="Bundles">
          <div className="cat-bundle-grid" ref={bundleTrack} onScroll={event => {
            const track = event.currentTarget;
            setBundleIndex(Math.min(browseBundles.length - 1, Math.max(0, Math.round(track.scrollLeft / (track.clientWidth + 10)))));
          }}>{browseBundles.map((bundle,index)=><BundleCard key={bundle.id} bundle={bundle} items={data.items} blur={renderBlur} call={call} busy={commerceBusy} owner={compact && data.admin} compact={compact} onDetails={() => openBundle(bundle, document.activeElement as HTMLElement)} label={`Bundle ${index+1} of ${browseBundles.length}: ${bundle.title}`} actionLabel={paymentWaiting.has(`bundle:${bundle.id}`) ? 'Check payment' : data.checkoutMode !== 'invoice' ? bundle.owned ? 'View in chat' : bundle.partial ? 'Partly owned' : delivered.has(`bundle:photo:${bundle.id}`) ? 'Open payment in chat' : `Pay · ⭐${bundle.stars.toLocaleString()}` : undefined} onUnlock={()=>unlockBundle(bundle)} ton={tonPricing} />)}</div>
          {!compact&&browseBundles.length>1&&<div className="cat-carousel-controls" aria-label="Choose bundle">
            {browseBundles.map((bundle,index)=><button key={bundle.id} aria-label={`Show bundle ${index+1}`} aria-current={bundleIndex===index ? 'true' : undefined} onClick={()=>{
              const track=bundleTrack.current;if(track)track.scrollTo({left:index*(track.clientWidth+10),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
            }}><span/></button>)}<span className="cat-carousel-count" aria-live="polite">{bundleIndex+1} / {browseBundles.length}</span>
          </div>}
        </section>}
        {visible.length ? <div className="cat-grid">{visible.slice(0, pageSize).map(item => <article className={`cat-card${compact && item.free ? ' cat-card-free' : ''}${trendingView && item.rank ? ' cat-card-ranked' : ''}`} key={`${item.type}:${item.id}`}>
          {trendingView && item.rank && <span className={`cat-rank cat-rank-${item.rank <= 3 ? item.rank : 'n'}`} aria-label={`Trending number ${item.rank}`}>#{item.rank}</span>}
          {trendingView && !!item.emojis?.length && <span className="cat-emojis" aria-hidden="true">{item.emojis.join('')}</span>}
          <button className="cat-picture-button" onClick={event => openItem(item, event.currentTarget)} aria-label={`View ${item.type}: ${item.description.slice(0, 100)}${compact ? `, ${item.purchased || item.received ? 'owned' : item.free ? 'free' : `${item.stars.toLocaleString()} Stars`}` : ''}`}><Preview item={item} blur={renderBlur} call={call} retryable={false} /></button>
          <div className="cat-card-body">
            {refined && <p className="cat-card-description" title={item.description}>{compact ? shortCatalogueTitle(item.description) : item.description}</p>}
            <div className="cat-card-bottom">
              {tonPricing && !item.purchased && !item.received && !item.free ? <CardPrices stars={item.stars} ton={tonPricing} /> : refined && <span className={`cat-card-price${item.purchased || item.received ? ' cat-card-owned' : ''}`}>
                {item.purchased || item.received ? <><Check size={14} aria-hidden="true"/>Owned</> : item.free ? 'Free' : <><Star className="cat-stars" size={15} aria-hidden="true"/><span>{item.stars.toLocaleString()}<span className="cat-sr-only"> Stars</span></span></>}
              </span>}
              {!compact && <button className="cat-item-unlock" aria-label={refined ? `${item.purchased || item.received ? 'View owned' : item.free ? 'View free' : `Unlock for ${item.stars.toLocaleString()} Stars:`} ${item.description}` : undefined} onClick={event => openItem(item, event.currentTarget)}>{refined ? item.purchased || item.received ? 'View' : item.free ? 'View' : 'Unlock' : item.purchased||item.received?<><Check size={14}/> View in chat</>:item.type==='video'?'Watch now':'View'}</button>}
            </div>
          </div></article>)}</div>
          : !search&&section==='Bundles'&&browseBundles.length ? null : <div className="cat-empty"><ShoppingBag size={30} /><h2>{search ? "No matching items" : section === "My Purchases" ? "No linked purchases yet" : `No ${section.toLowerCase()} available right now`}</h2><button className="cat-secondary" onClick={() => { setSection(compact ? "Explore" : "All"); setSearch(""); }}>{compact ? 'Browse the collection' : 'Explore the collection'}</button></div>}
        {visible.length > pageSize && <button className="cat-load-more" onClick={() => setPageSize(v => v + 12)}>Show more</button>}
      <details className="cat-how-it-works"><summary>How it works</summary>{compact ? <p>Browse a preview, choose an item, then pay with Telegram Stars{data.tonEnabled ? <> or with TON{data.tonDiscountPercent ? <>, which is <strong>{data.tonDiscountPercent}% off</strong></> : null}</> : null}{data.checkoutMode === 'invoice' ? '. It lands straight in our chat, and your unlocked collection stays in My purchases.' : ' in Telegram. Your purchase stays linked to your account.'}</p> : <div className="cat-intro">
        <div className="cat-intro-icon" aria-hidden="true"><DevilIcon /></div>
        <div><h2>I’ve blurred them down just enough for you to see what you’re getting daddy x. ❤️</h2>
          <p>Once you tap on one you will just double tap and pay then it’s all yours xxx come back to the chat after I want to talk dirty with you 👀 🍑</p></div>
      </div>}</details>
        <footer className="cat-bottom">{!compact && <><button onClick={() => setSearchOpen(v => !v)}><Search size={18} />Search the collection</button>
          {searchOpen && <label className="cat-search"><Search size={18} /><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search descriptions…" aria-label="Search descriptions" />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={16} /></button>}</label>}</>}
          <p>{data.checkoutMode === 'invoice' ? 'Secure checkout with Telegram Stars' : 'Confirm your Stars payment in Telegram to unlock.'}</p></footer>
      </>}
      {!selected && !selectedBundle && notice && <div role="status" className="cat-notice">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} /></button></div>}
      {paidFallback && <div className="cat-modal-backdrop" onClick={() => setPaidFallback(false)}><section className="cat-modal" role="dialog" aria-modal="true" aria-label="Payment confirmed" onClick={e => e.stopPropagation()}>
        <div className="cat-detail"><h2>Paid. It&apos;s in your chat</h2>
          <button className="cat-primary" onClick={() => { setPaidFallback(false); backToChat(); }}>View in chat</button></div>
      </section></div>}
    </div>
    {selectedBundle && <div className="cat-modal-backdrop" onClick={() => !commerceBusy && closeDetails()}><section className="cat-modal cat-bundle-modal" role="dialog" aria-modal="true" aria-label="Bundle details" onClick={e => e.stopPropagation()}>
      <button className="cat-modal-close" aria-label="Close bundle" disabled={commerceBusy} onClick={closeDetails}><X size={21}/></button>
      <div className="cat-detail"><h2>{selectedBundle.title}</h2>
        {selectedBundle.caption && <p className="cat-bundle-caption cat-bundle-caption-detail">{selectedBundle.caption}</p>}
        <div className="cat-bundle-included cat-bundle-grid">{selectedBundle.photoIds.map(id => { const item = data?.items.find(p => p.type === 'photo' && p.id === id); return item && <button key={id} className="cat-picture-button" onClick={event => openItem(item, event.currentTarget)} aria-label={`View included photo: ${item.description}`}><Preview item={item} blur={renderBlur} call={call} retryable={false}/></button>; })}</div>
        {salePercent(selectedBundle) !== null && !selectedBundle.owned && <p className="cat-bundle-saving">{salePercent(selectedBundle)}% off · <s>⭐{selectedBundle.regularStars.toLocaleString()}</s></p>}
        <div className="cat-pay-row">
        {selectedBundle.owned && data?.checkoutMode === 'invoice' ? <p className="cat-owned-message"><Check size={16}/> Unlocked. Tap a photo to view it.</p> : <button className="cat-primary cat-pay-stars" disabled={commerceBusy || selectedBundle.partial || data?.admin} onClick={() => unlockBundle(selectedBundle)}>{commerceBusy ? checkoutPhase === 'confirming' ? 'Confirming payment…' : data?.checkoutMode === 'invoice' ? 'Opening payment…' : 'Sending…' : data?.admin ? 'Preview only' : selectedBundle.owned ? 'View in chat' : selectedBundle.partial ? 'Partly owned' : paymentWaiting.has(`bundle:${selectedBundle.id}`) ? 'Check payment' : data?.checkoutMode !== 'invoice' && delivered.has(`bundle:photo:${selectedBundle.id}`) ? 'Open payment in chat' : `${data?.checkoutMode === 'invoice' ? 'Unlock' : 'Pay in Telegram'} · ⭐${selectedBundle.stars.toLocaleString()}`}</button>}
        {data?.checkoutMode === 'invoice' && data?.tonEnabled && !data?.admin && !selectedBundle.owned && !selectedBundle.partial && <button className="cat-secondary cat-pay-ton" disabled={busy || commerceBusy} onClick={() => void payWithTon('bundle', selectedBundle.id)}><TonButtonLabel stars={selectedBundle.stars} nanotonPerStar={data?.tonNanotonPerStar} phase={tonPhase} discountPercent={data?.tonDiscountPercent} /></button>}
        </div>
        {data?.checkoutMode !== 'invoice' && !data?.admin && !data?.canSend && <p className="cat-window">Send a message in the creator's chat first to receive this bundle.</p>}
        {notice && <p role="status" className="cat-payment-status">{notice}</p>}
      </div></section></div>}
    {selected && <div className="cat-modal-backdrop" onClick={() => !busy && closeDetails()}><section className="cat-modal" role="dialog" aria-modal="true" aria-label="Item details" onClick={e => e.stopPropagation()}>
      <button className="cat-modal-close" aria-label="Close item" disabled={busy} onClick={closeDetails}><X size={21} /></button>
      {ownedMedia && !contentError ? <div className="cat-owned-media">{ownedMedia.type === 'video' ? <video key={ownedMedia.url} src={ownedMedia.url} controls playsInline autoPlay onError={() => { ownedCache.current.delete(`${selected.type}:${selected.id}`); setContentError('Could not load your video. Please retry.'); }} /> : <img key={ownedMedia.url} src={ownedMedia.url} width={ownedMedia.width} height={ownedMedia.height} alt={selected.description} onError={() => { ownedCache.current.delete(`${selected.type}:${selected.id}`); setContentError('Could not load your photo. Please retry.'); }} />}</div> : <Preview item={selected} blur={renderBlur} call={call} />}
      <div className="cat-detail"><span className="cat-eyebrow">{selected.type}</span>{selected.title && <h2 className="cat-detail-title">{selected.title}</h2>}<p>{selected.description}</p>
        {contentBusy && <p role="status">Loading your unlocked item…</p>}
        {contentError && <div className="cat-content-error" role="alert"><p>{contentError}</p><button className="cat-secondary" onClick={() => void loadContent(selected, true)}>Retry loading item</button></div>}
        {data?.checkoutMode === 'invoice' ? <>
          <div className="cat-pay-row">
          {!ownedMedia && !contentError && !contentBusy && <button className="cat-primary cat-pay-stars" disabled={busy || data.admin} onClick={() => void sendItem(selected)}>{busy ? checkoutPhase === 'confirming' ? 'Confirming payment…' : 'Opening payment…' : data.admin ? 'Preview only' : selected.received && !selected.purchased && !selected.free ? 'View in chat' : selected.purchased || selected.free ? 'View item' : paymentWaiting.has(`${selected.type}:${selected.id}`) ? 'Check payment' : `Unlock · ⭐${selected.stars.toLocaleString()}`}</button>}
          {!ownedMedia && !contentError && !contentBusy && !selected.free && !selected.purchased && data.tonEnabled && !data.admin && <button className="cat-secondary cat-pay-ton" disabled={busy} onClick={() => void payWithTon(selected.type, selected.id)}><TonButtonLabel stars={selected.stars} nanotonPerStar={data.tonNanotonPerStar} phase={tonPhase} discountPercent={data.tonDiscountPercent} /></button>}
          </div>
          {ownedMedia && <p className="cat-owned-message"><Check size={16}/> Unlocked</p>}
          {notice && <p role="status" className="cat-payment-status">{notice}</p>}
        </> : <>
          {!data?.admin && !data?.canSend && !selected.received && <p className="cat-window">Send a message in the creator's chat first to receive this item.</p>}
          <button className="cat-primary" disabled={busy || data?.admin} onClick={() => !data?.admin && !data?.canSend ? backToChat() : void sendItem(selected)}>{busy ? 'Sending to your chat…' : data?.admin ? 'Preview only' : selected.received || selected.purchased ? 'View in chat' : delivered.has(`${selected.type}:${selected.id}`) ? selected.free ? 'Open item in chat' : 'Open payment in chat' : !data?.canSend ? 'Open chat' : selected.free ? 'Send free item to chat' : `Pay in Telegram · ⭐${selected.stars.toLocaleString()}`}</button>
          {!selected.free && !selected.received && !delivered.has(`${selected.type}:${selected.id}`) && <p className="cat-payment-note">Confirm your Stars payment in Telegram to unlock.</p>}
          {notice && <p role="status" className="cat-payment-status">{notice}</p>}
        </>}
      </div></section></div>}
  </main>;
}
