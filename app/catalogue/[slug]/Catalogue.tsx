"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ImageIcon, LockKeyhole, Search, ShoppingBag, SlidersHorizontal, Sparkles, Star, Video, X } from "lucide-react";
import type { CatalogueItem } from "@/lib/catalogue-core";
import "./catalogue.css";

type WebApp = { initData: string; ready(): void; expand(): void; close(): void; openTelegramLink(url: string): void };
function app(): WebApp | undefined { return (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp; }
type Data = { name: string; items: CatalogueItem[]; blur: number; admin: boolean; enabled: boolean; canSend: boolean; chatUrl: string | null; purchaseNote: string };
type Call = (action: string, payload?: Record<string, unknown>) => Promise<Response>;
const tabs = ["New", "Discounted", "Photos", "Videos", "Bundles", "My Purchases"];

function Preview({ item, blur, call }: { item: CatalogueItem; blur: number; call: Call }) {
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
      {error && <button type="button" onClick={e => { e.stopPropagation(); setRetry(v => v + 1); }}>Retry</button>}
    </div>}
    <span className="cat-type">{item.type === "photo" ? "PHOTO" : "VIDEO"}</span>
    <span className="cat-lock">{item.purchased ? <Check size={14} /> : <LockKeyhole size={13} />}{item.purchased ? "Purchased" : "Preview"}</span>
  </div>;
}

export default function Catalogue({ slug, preview }: { slug: string; preview: boolean }) {
  const [ready, setReady] = useState(preview);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState("New");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<CatalogueItem | null>(null);
  const [blur, setBlur] = useState(16);
  const [renderBlur, setRenderBlur] = useState(16);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [notice, setNotice] = useState("");
  const [setup, setSetup] = useState<{ username: string; hasMainApp: boolean; appUrl: string } | null>(null);
  const [pageSize, setPageSize] = useState(12);
  const requestKeys = useRef(new Map<string, string>());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const call = useCallback<Call>((action, payload = {}) => fetch(`/api/catalogue/${encodeURIComponent(slug)}`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-telegram-init-data": app()?.initData ?? "" },
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
  useEffect(() => { if (ready) { app()?.ready(); app()?.expand(); void load(); } }, [ready, load]);
  useEffect(() => { const timer = window.setTimeout(() => setRenderBlur(blur), 450); return () => window.clearTimeout(timer); }, [blur]);
  useEffect(() => { setPageSize(12); }, [section, search]);
  useEffect(() => {
    if (!selected) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setSelected(null); };
    document.addEventListener("keydown", fn); const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", fn); document.body.style.overflow = old; };
  }, [selected, busy]);
  function backToChat() {
    if (data?.chatUrl) { if (app()?.initData) { app()!.openTelegramLink(data.chatUrl); app()!.close(); } else window.location.href = data.chatUrl; }
    else app()?.close();
  }
  async function sendItem(item: CatalogueItem) {
    if (sending.current) return;
    if (data?.admin) { setNotice("This is your preview. Sending is disabled here."); return; }
    if (item.received || item.purchased) { backToChat(); return; }
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
      setNotice(result.status === "delivered" ? (item.free ? "Your item is in the chat." : "Your locked item is in the chat. Confirm the Stars payment there to unlock it.")
        : result.result || "Still processing. Check the chat before trying again.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Please try again."); }
    finally { sending.current = false; if (mounted.current) setBusy(false); }
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
  return <main className="catalogue">
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => { setReady(true); }} />
    <div className="cat-shell">
      <header className="cat-header"><button className="cat-icon" aria-label="Back to chat" onClick={backToChat}><ArrowLeft size={21} /></button>
        <div><span className="cat-eyebrow">THE COLLECTION</span><h1>{data?.name || "Your catalogue"}</h1></div>
        {data?.admin ? <button className="cat-icon" aria-label="Catalogue settings" onClick={() => setSettingsOpen(v => !v)}><SlidersHorizontal size={21} /></button>
          : <span className="cat-secure"><LockKeyhole size={15} /></span>}</header>
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
      <section className="cat-intro"><div className="cat-intro-icon"><Sparkles size={19} /></div><div><h2>A little more to explore</h2><p>Browse the previews. Pick your favourite.</p></div></section>
      {error ? <div className="cat-empty"><LockKeyhole /><h2>{error}</h2>{preview && <a className="cat-primary" href={`/twin?next=${encodeURIComponent(`/catalogue/${slug}?preview=1`)}`}>Sign in</a>}<button className="cat-secondary" onClick={load}>Try again</button></div>
        : !data ? <div className="cat-empty" aria-live="polite">Loading your collection…</div> : <>
        <nav className="cat-tabs" aria-label="Catalogue categories">{[...(data.items.some(i => i.free) ? ["Free Content"] : []), ...tabs].map(tab =>
          <button key={tab} className={section === tab && !search ? "active" : ""} onClick={() => { setSection(tab); setSearch(""); }}>{tab}</button>)}</nav>
        <div className="cat-section-heading"><h2>{search ? "Search results" : section}</h2><span>{visible.length} {visible.length === 1 ? "item" : "items"}</span></div>
        {section === "My Purchases" && <p className="cat-purchase-note">{data.purchaseNote}</p>}
        {visible.length ? <div className="cat-grid">{visible.slice(0, pageSize).map(item => <article className="cat-card" key={`${item.type}:${item.id}`}>
          <button className="cat-picture-button" onClick={() => { setSelected(item); setNotice(""); }} aria-label={`View ${item.type}: ${item.description.slice(0, 100)}`}><Preview item={item} blur={renderBlur} call={call} /></button>
          <div className="cat-card-body"><p>{item.description}</p><div className="cat-card-bottom"><span className="cat-price">{item.purchased ? <><Check size={15} /> Purchased</> : item.free ? "Free" : <><Star size={15} fill="currentColor" />{item.stars.toLocaleString()}</>}</span>
            <button onClick={() => { setSelected(item); setNotice(""); }}>View</button></div></div></article>)}</div>
          : <div className="cat-empty"><ShoppingBag size={30} /><h2>{search ? "No matching items" : section === "My Purchases" ? "No linked purchases yet" : `No ${section.toLowerCase()} available right now`}</h2><button className="cat-secondary" onClick={() => { setSection("New"); setSearch(""); }}>Explore the collection</button></div>}
        {visible.length > pageSize && <button className="cat-load-more" onClick={() => setPageSize(v => v + 12)}>Show more</button>}
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
        <button className="cat-primary" disabled={busy} onClick={() => !data?.admin && !data?.canSend ? backToChat() : void sendItem(selected)}>{busy ? "Sending to your chat…" : data?.admin ? "Preview only" : selected.received || selected.purchased ? "View in chat" : !data?.canSend ? "Open chat" : selected.free ? "Send free item to chat" : `Unlock in chat · ${selected.stars.toLocaleString()} Stars`}</button>
        {!selected.free && !selected.received && <p className="cat-payment-note">No payment is taken here. Confirm in Telegram to unlock.</p>}
        {notice && <div role="status" className="cat-result"><p>{notice}</p>{!data?.admin && <button className="cat-secondary" onClick={backToChat}>Return to chat</button>}</div>}
      </div></section></div>}
  </main>;
}
