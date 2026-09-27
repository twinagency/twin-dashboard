"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Check, ChevronRight, Gift, ImageIcon, LockKeyhole, Search, ShoppingBag, SlidersHorizontal, Star, Video, X } from "lucide-react";
import { rewardProgress, type CatalogueBundle, type CatalogueRewards } from '@/lib/catalogue-commerce';
import { openCatalogueChat } from "@/lib/catalogue-navigation";
import type { CatalogueItem } from "@/lib/catalogue-core";
import "./catalogue.css";
import VideoPreview from './VideoPreview';

type WebApp = { initData: string; ready(): void; expand(): void; close(): void; openTelegramLink(url: string): void; setHeaderColor?(color: string): void; setBackgroundColor?(color: string): void; setBottomBarColor?(color: string): void };
function app(): WebApp | undefined { return (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp; }
type Data = { name: string; items: CatalogueItem[]; blur: number; admin: boolean; enabled: boolean; canSend: boolean; chatUrl: string | null; purchaseNote: string; bundles:CatalogueBundle[]; rewards:CatalogueRewards|null };
type Call = (action: string, payload?: Record<string, unknown>) => Promise<Response>;
const tabs = ["All", "Photos", "Videos", "Bundles", "My Purchases"];

// Current creator profile photo, verified from Telegram on 27 September 2026.
const profilePhotos: Record<string, string> = { "briana-redd": "/brand/catalogue/briana-redd-profile.webp" };
function ProfilePhoto({ name, slug }: { name: string; slug: string }) {
  const [failed, setFailed] = useState(false);
  const url = profilePhotos[slug];
  return <span className="cat-avatar">{url && !failed ? <img src={url} alt={`${name} Telegram profile photo`} onError={() => setFailed(true)} /> : <span aria-label={name}>{name.split(/\s+/).map(word => word[0]).slice(0, 2).join("")}</span>}</span>;
}

function DevilIcon() { return <svg width="28" height="28" viewBox="0 0 32 32" fill="none"><path d="M6 15C2 12 2 5 4 2c1 5 4 6 8 7M26 15c4-3 4-10 2-13-1 5-4 6-8 7" fill="#e53935" /><path d="M16 8C9 8 5 12 5 19s5 11 11 11 11-4 11-11S23 8 16 8Z" fill="#e53935" /><path d="m10 16 3 2m9-2-3 2M11 23c3 3 7 3 10 0" stroke="#721b24" strokeWidth="2" strokeLinecap="round" /></svg>; }

function Preview(props: { item: CatalogueItem; blur: number; call: Call; retryable?: boolean }) {
  return props.item.type === 'video' ? <VideoPreview {...props} retryable={props.retryable ?? true} /> : <PhotoPreview {...props} />;
}
function PhotoPreview({ item, blur, call, retryable = true }: { item: CatalogueItem; blur: number; call: Call; retryable?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "120px" });
    observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || item.type !== "photo") return;
    let cancelled = false, objectUrl: string | null = null;
    setUrl(null); setError(false);
    // Stagger first paint requests; server also bounds concurrent transformations.
    const timer = window.setTimeout(async () => {
      try {
        const response = await call("preview", { type: item.type, id: item.id, blur });
        if (!response.ok) throw new Error("preview");
        objectUrl = URL.createObjectURL(await response.blob());
        if (!cancelled) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
      } catch { if (!cancelled) setError(true); }
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, item.id, item.type, blur, call, retry]);
  return <div ref={ref} className="cat-preview">
    {url ? <img src={url} alt="Blurred preview" /> : <div className="cat-placeholder">{item.type === "video" ? <Video size={32} /> : <ImageIcon size={32} />}
      <span>{error ? "Preview unavailable" : item.type === "video" ? "Video" : "Loading preview"}</span>
      {error && retryable && <button type="button" onClick={e => { e.stopPropagation(); setRetry(v => v + 1); }}>Retry</button>}
    </div>}
    <span className="cat-type">{item.type === "photo" ? "PHOTO" : "VIDEO"}</span>
    <span className="cat-lock" aria-label={item.purchased || item.received ? "Unlocked" : item.free ? "Free" : "Locked preview"}>{(item.purchased || item.received) ? <Check size={14} /> : <LockKeyhole size={13} />}</span>
  </div>;
}

export default function Catalogue({ slug, preview }: { slug: string; preview: boolean }) {
  const [ready, setReady] = useState(preview);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState("All");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<CatalogueItem | null>(null);
  const [blur, setBlur] = useState(16);
  const [renderBlur, setRenderBlur] = useState(16);
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
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const call = useCallback<Call>((action, payload = {}) => fetch(`/api/catalogue/${encodeURIComponent(slug)}`, {
    signal: AbortSignal.timeout(action === 'preview' && payload.type === 'video' ? 60_000 : 20_000), method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-telegram-init-data": app()?.initData ?? "" },
    body: JSON.stringify({ ...payload, action, preview }),
  }), [slug, preview]);
  const read = useCallback(async (action: string, payload?: Record<string, unknown>) => {
    const response = await call(action, payload); const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Please try again.");
    return result;
  }, [call]);
  const load = useCallback(async () => {
    setError("");
    try { const value: Data = await read("catalogue"); setData(value); setBlur(value.blur); setRenderBlur(value.blur); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't load the catalogue."); }
  }, [read]);
  useEffect(() => { if (ready) {
    const telegram = app(); telegram?.ready(); telegram?.expand();
    for (const method of ['setHeaderColor', 'setBackgroundColor', 'setBottomBarColor'] as const) {
      try { telegram?.[method]?.('#000000'); } catch { /* Older Telegram versions may not support every colour setter. */ }
    }
    void load();
  } }, [ready, load]);
  useEffect(()=>{
    if(!ready||preview) return;
    const refresh=()=>{if(document.visibilityState==='visible'&&!sending.current) void load();};
    const timer=window.setInterval(refresh,30_000);document.addEventListener('visibilitychange',refresh);
    return ()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[ready,preview,load]);
  useEffect(() => { const timer = window.setTimeout(() => setRenderBlur(blur), 450); return () => window.clearTimeout(timer); }, [blur]);
  useEffect(() => { setPageSize(12); }, [section, search]);
  useEffect(() => {
    if (!selected) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setSelected(null); };
    document.addEventListener("keydown", fn); const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", fn); document.body.style.overflow = old; };
  }, [selected, busy]);
  function backToChat() {
    openCatalogueChat(data?.chatUrl, app(), url => { window.location.href = url; }, (callback, delay) => window.setTimeout(callback, delay));
  }
  async function sendItem(item: CatalogueItem) {
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
        setNotice(item.free ? "Sent. Opening your chat…" : `Tap the locked item in the chat to pay ${item.stars.toLocaleString()} Stars. Opening your chat…`);
        backToChat();
      } else {
        setNotice(result.result || "Still processing. Check the chat before trying again.");
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Please try again."); }
    finally { sending.current = false; if (mounted.current) setBusy(false); }
  }
  async function sendCommerce(type:'bundle'|'reward',id:string,rewardType:'photo'|'video'='photo') {
    if(sending.current) return;
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
      if(result.status==='delivered'){setNotice(type==='reward'?'Reward sent. No Stars charged.':'Bundle sent. Confirm payment in your chat.');backToChat();}
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
  const visible = (data?.items ?? []).filter(item => {
    if (search) return item.description.toLowerCase().includes(search.toLowerCase());
    if (section === "Free Content") return item.free;
    if (section === "Photos") return item.type === "photo" && !item.free;
    if (section === "Videos") return item.type === "video" && !item.free;
    if (section === "My Purchases") return item.purchased;
    if (section === "Discounted" || section === "Bundles") return false;
    return true;
  });
  const rewards=data?.rewards;
  const progress=rewards?rewardProgress(rewards):null;
  const rewardItems=rewards?data!.items.filter(p=>(p.type==='photo'?rewards.photoIds:rewards.videoIds??[]).includes(p.id)):[];
  return <main className="catalogue">
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => { setReady(true); }} />
    <div className="cat-shell">
      <header className="cat-header"><button className="cat-icon" aria-label="Back to chat" onClick={backToChat}><ArrowLeft size={21} /></button>
        {data && <ProfilePhoto name={data.name} slug={slug} />}
        <div><h1>{data?.name || "Your catalogue"}</h1></div>
        {data?.admin ? <button className="cat-icon" aria-label="Catalogue settings" onClick={() => setSettingsOpen(v => !v)}><SlidersHorizontal size={21} /></button>
          : <button className="cat-icon" aria-label="My purchases" onClick={() => { setSection("My Purchases"); setSearch(""); document.getElementById("catalogue-items")?.scrollIntoView({ behavior: "smooth" }); }}><ShoppingBag size={19} /></button>}</header>
      {data?.admin && <div className="cat-admin-label">Owner preview <span>{data.enabled ? "Catalogue enabled" : "Not live for fans"}</span></div>}
      {settingsOpen && data?.admin && <section className="cat-settings"><h2>Preview blur</h2>
        <div className="cat-presets">{[[6, "Light"], [16, "Medium"], [30, "Heavy"]].map(([n, label]) => <button key={n} onClick={() => setBlur(Number(n))} className={blur === n ? "active" : ""}>{label}</button>)}</div>
        <label htmlFor="blur-strength">Strength <strong>{blur}</strong></label><input id="blur-strength" type="range" min="4" max="40" value={blur} onChange={e => setBlur(Number(e.target.value))} />
        <button className="cat-primary" disabled={busy} onClick={saveBlur}>Save blur</button>
        <button className="cat-secondary" onClick={inspectSetup}>Check Telegram setup</button>
        {setup && <div className="cat-setup"><p>Bot: @{setup.username}</p><p>In BotFather, set the Main Mini App URL to:</p><code>{setup.appUrl}</code>
          <p>{setup.hasMainApp ? "A Main Mini App is configured. Confirm its URL matches above before enabling." : "The Main Mini App still needs to be configured."}</p>
          <button className="cat-primary" disabled={busy || !setup.hasMainApp} onClick={activate}>URL checked, enable catalogue</button></div>}
      </section>}
      {error ? <div className="cat-empty"><LockKeyhole /><h2>{error}</h2>{preview && <a className="cat-primary" href={`/twin?next=${encodeURIComponent(`/catalogue/${slug}?preview=1`)}`}>Sign in</a>}<button className="cat-secondary" onClick={load}>Try again</button></div>
        : !data ? <div className="cat-empty" aria-live="polite">Loading your collection…</div> : <>
        {rewards&&progress&&<section className="cat-rewards" aria-label="Your loyalty rewards">
          <button className="cat-reward-summary" aria-label="Rewards for Daddy" aria-expanded={rewardsOpen} aria-controls="catalogue-reward-details" onClick={()=>setRewardsOpen(v=>!v)}>
          <div className="cat-reward-heading"><span className="cat-mascot" aria-hidden="true"><DevilIcon /></span><h2>Rewards for Daddy</h2>{!!rewards.welcomeBonus&&<span className="cat-welcome-bonus"><Gift size={12} aria-hidden="true"/>+{rewards.welcomeBonus.toLocaleString()} welcome points</span>}</div>
          <div className="cat-reward-track"><div className="cat-reward-meter-wrap"><div className="cat-reward-target"><strong>{Math.max(0,rewards.balance).toLocaleString()}</strong><span>/ <b>{rewards.cost.toLocaleString()}</b> points</span></div><div className="cat-reward-meter" role="progressbar" aria-label="Progress to next reward" aria-valuemin={0} aria-valuemax={rewards.cost} aria-valuenow={Math.min(rewards.cost,Math.max(0,rewards.balance))}><span style={{width:`${progress.percent}%`}}/></div><p>{progress.ready?'Your reward is ready':`${progress.remaining.toLocaleString()} points to your next reward`}</p></div>
            <span className="cat-reward-stack" aria-hidden="true">
              {rewardItems.length ? rewardItems.slice(0,4).map((item,index)=><span className="cat-reward-stack-card" key={`${item.type}:${item.id}`} style={{'--card-index':index,'--card-count':Math.min(4,rewardItems.length)} as CSSProperties}><Preview item={item} blur={renderBlur} call={call} retryable={false}/><span className="cat-stack-lock"><LockKeyhole size={12}/></span></span>) : <Gift size={26}/>}
              {!!rewardItems.length&&<span className="cat-stack-count">{rewardItems.length} choices</span>}
            </span>
          </div>
          <span className="cat-reward-discover">{rewardsOpen?'Hide rewards':'Explore your rewards'}<ChevronRight className="cat-reward-chevron" size={15} aria-hidden="true"/></span>
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
        {!!data.bundles?.length&&<section className="cat-bundle-section" aria-label="Featured bundles">
          <div className="cat-bundle-grid" ref={bundleTrack} onScroll={event => {
            const track = event.currentTarget;
            setBundleIndex(Math.min(data.bundles.length - 1, Math.max(0, Math.round(track.scrollLeft / (track.clientWidth + 10)))));
          }}>{data.bundles.map((bundle,index)=><article className="cat-bundle-card" key={bundle.id} aria-label={`Bundle ${index+1} of ${data.bundles.length}: ${bundle.title}`}>
            <div className="cat-bundle-mosaic">{bundle.photoIds.map(id=>{const item=data.items.find(p=>p.type==='photo'&&p.id===id);return item?<Preview key={id} item={item} blur={renderBlur} call={call}/>:null;})}</div>
            <div className="cat-bundle-copy"><span className="cat-featured-label">Featured bundle</span><h3>{bundle.title.replace(/^Photo collection/i,'Bundle')}</h3>
              <p className="cat-bundle-saving">5 photos · Save {(bundle.regularStars-bundle.stars).toLocaleString()} Stars</p>
              <div className="cat-bundle-price"><strong><Star size={18} fill="currentColor"/>{bundle.stars.toLocaleString()}</strong><s>{bundle.regularStars.toLocaleString()}</s></div>
              <button className="cat-primary" disabled={commerceBusy||bundle.partial} onClick={()=>bundle.owned?backToChat():void sendCommerce('bundle',bundle.id)}>{commerceBusy?'Sending…':bundle.owned?'View in chat':bundle.partial?'Partly owned':'Unlock bundle'}</button>
            </div>
          </article>)}</div>
          {data.bundles.length>1&&<div className="cat-carousel-controls" aria-label="Choose featured bundle">
            {data.bundles.map((bundle,index)=><button key={bundle.id} aria-label={`Show bundle ${index+1}`} aria-current={bundleIndex===index ? 'true' : undefined} onClick={()=>{
              const track=bundleTrack.current;if(track)track.scrollTo({left:index*(track.clientWidth+10),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
            }}><span/></button>)}<span className="cat-carousel-count" aria-live="polite">{bundleIndex+1} / {data.bundles.length}</span>
          </div>}
        </section>}
        <nav className="cat-tabs" aria-label="Catalogue categories">{[...(data.items.some(i => i.free) ? ["Free Content"] : []), ...tabs].map(tab =>
          <button key={tab} className={section === tab && !search ? "active" : ""} onClick={() => { setSection(tab); setSearch(""); }}>{tab}</button>)}</nav>
        <div id="catalogue-items" className={`cat-section-heading${section === "All" && !search ? " cat-section-heading-default" : ""}`}><h2>{search ? "Search results" : section}</h2><span>{!search&&section==='Bundles'?`${data.bundles.length} bundles`:`${visible.length} ${visible.length===1?'item':'items'}`}</span></div>
        {section === "My Purchases" && <p className="cat-purchase-note">{data.purchaseNote}</p>}
        {visible.length ? <div className="cat-grid">{visible.slice(0, pageSize).map(item => <article className="cat-card" key={`${item.type}:${item.id}`}>
          <button className="cat-picture-button" onClick={() => { setSelected(item); setNotice(""); }} aria-label={`View ${item.type}: ${item.description.slice(0, 100)}`}><Preview item={item} blur={renderBlur} call={call} retryable={false} /></button>
          <div className="cat-card-body"><p>{item.description}</p><div className="cat-card-bottom">
            <button className="cat-item-unlock" onClick={() => { setSelected(item); setNotice(""); }}>{item.purchased||item.received?<><Check size={14}/> View in chat</>:item.free?'View free item':<>Unlock · {item.stars.toLocaleString()} <Star size={14} fill="currentColor"/></>}</button></div></div></article>)}</div>
          : !search&&section==='Bundles'&&data.bundles.length ? <p className="cat-purchase-note">Choose one of the bundle deals above.</p> : <div className="cat-empty"><ShoppingBag size={30} /><h2>{search ? "No matching items" : section === "My Purchases" ? "No linked purchases yet" : `No ${section.toLowerCase()} available right now`}</h2><button className="cat-secondary" onClick={() => { setSection("All"); setSearch(""); }}>Explore the collection</button></div>}
        {visible.length > pageSize && <button className="cat-load-more" onClick={() => setPageSize(v => v + 12)}>Show more</button>}
      <details className="cat-how-it-works"><summary>How it works</summary><div className="cat-intro">
        <div className="cat-intro-icon" aria-hidden="true"><DevilIcon /></div>
        <div><h2>I’ve blurred them down just enough for you to see what you’re getting daddy x. ❤️</h2>
          <p>Once you tap on one you will just double tap and pay then it’s all yours xxx come back to the chat after I want to talk dirty with you 👀 🍑</p></div>
      </div></details>
        <footer className="cat-bottom"><button onClick={() => setSearchOpen(v => !v)}><Search size={18} />Search the collection</button>
          {searchOpen && <label className="cat-search"><Search size={18} /><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search descriptions…" aria-label="Search descriptions" />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={16} /></button>}</label>}
          <p>Unlock with Telegram Stars in your chat.</p></footer>
      </>}
      {!selected && notice && <div role="status" className="cat-notice">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} /></button></div>}
    </div>
    {selected && <div className="cat-modal-backdrop" onClick={() => !busy && setSelected(null)}><section className="cat-modal" role="dialog" aria-modal="true" aria-label="Item details" onClick={e => e.stopPropagation()}>
      <button className="cat-modal-close" aria-label="Close item" disabled={busy} onClick={() => setSelected(null)}><X size={21} /></button>
      <Preview item={selected} blur={renderBlur} call={call} /><div className="cat-detail"><span className="cat-eyebrow">{selected.type}</span><p>{selected.description}</p>
        {!data?.admin && !data?.canSend && !selected.received && <p className="cat-window">Send a message in the creator's chat first to receive this item.</p>}
        <button className="cat-primary" disabled={busy} onClick={() => !data?.admin && !data?.canSend ? backToChat() : void sendItem(selected)}>{busy ? "Sending to your chat…" : data?.admin ? "Preview only" : selected.received || selected.purchased ? "View in chat" : delivered.has(`${selected.type}:${selected.id}`) ? selected.free ? "Open item in chat" : "Open payment in chat" : !data?.canSend ? "Open chat" : selected.free ? "Send free item to chat" : `Unlock in chat · ${selected.stars.toLocaleString()} Stars`}</button>
        {!selected.free && !selected.received && <p className="cat-payment-note">No payment is taken here. Confirm in Telegram to unlock.</p>}
        {notice && <div role="status" className="cat-result"><p>{notice}</p>{!data?.admin && <>
          <button className="cat-secondary" onClick={backToChat}>Return to chat</button>
          {data?.chatUrl && <a className="cat-chat-link" href={data.chatUrl} target="_blank" rel="noopener noreferrer">Open {data.name}’s chat</a>}
          <button className="cat-close-app" onClick={() => app()?.close()}>Close catalogue</button>
        </>}</div>}
      </div></section></div>}
  </main>;
}

