"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DollarSign, ImageIcon, BriefcaseBusiness, Info, Logs, SlidersHorizontal, Menu, X, Eye, EyeOff, LogOut } from "lucide-react";
import TwinWordmark from "@/components/TwinWordmark";
import IntelligenceCoreIcon from "@/components/IntelligenceCoreIcon";
import MainShell from "@/components/MainShell";
import DashboardAccessProvider from "@/components/DashboardAccessProvider";
import CurrencyProvider, { useCurrency } from "@/components/CurrencyProvider";
import BlurProvider from "@/components/BlurProvider";
import { CREATOR_NAV } from "@/lib/creator-dashboard-policy";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";

const icons = { earnings: DollarSign, ppvs: ImageIcon, business: BriefcaseBusiness, info: Info, logs: Logs, edit: SlidersHorizontal };
function CreatorControls({ name, stars }: { name: string; stars: number | null }) {
  const { currency, setCurrency, rate } = useCurrency();
  const [privateView, setPrivateView] = useState(false);
  useEffect(() => { setPrivateView(document.documentElement.classList.contains("blur-media")); }, []);
  function togglePrivacy() {
    const next = !privateView;
    setPrivateView(next);
    document.documentElement.classList.toggle("blur-media", next);
    try { localStorage.setItem("blurMedia", String(next)); } catch { /* Storage may be disabled. */ }
  }
  return <div className="flex max-w-full items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-sm shadow-sm">
    <span className="creator-name flex min-w-0 items-center gap-2 font-semibold"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-xs text-accent">{name.slice(0, 2).toUpperCase()}</span><span className="max-w-36 truncate">{name}</span></span>
    {stars !== null && <span className="hidden border-l border-line pl-3 font-semibold tabular-nums text-good sm:inline">{fmtMoney(starsToMoneyRate(stars, currency, rate), currency)}</span>}
    <button type="button" onClick={() => setCurrency(currency === "AUD" ? "USD" : "AUD")} className="rounded-full bg-elev px-3 py-1.5 font-semibold" aria-label={`Currency ${currency}. Switch currency`}>${currency}</button>
    <button type="button" onClick={togglePrivacy} aria-label={privateView ? "Show private details" : "Hide private details"} aria-pressed={privateView} className="rounded-md p-1.5 text-muted hover:text-ink">{privateView ? <EyeOff size={19} /> : <Eye size={19} />}</button>
    <form action="/creator-auth/logout" method="post"><button type="submit" className="flex items-center gap-2 border-l border-line pl-3 text-muted hover:text-ink"><LogOut size={18} /><span className="hidden sm:inline">Sign out</span></button></form>
  </div>;
}
export default function CreatorDashboardShell({ children, brand, name, stars }: { children: ReactNode; brand: string; name: string; stars: number | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const pageName = CREATOR_NAV.find(item => item.href === pathname)?.label || "Earnings";
  const sidebar = <>
    <div className="flex h-20 shrink-0 items-center justify-between border-b border-white/14 px-5"><Link href="/creator" aria-label={`${brand} creator dashboard`}><TwinWordmark inverse agencyName={brand === "Twin" ? undefined : brand} /></Link><button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 text-white lg:hidden"><X size={20} /></button></div>
    <div className="shrink-0 px-4 pb-2 pt-4"><div className="creator-core-hero"><IntelligenceCoreIcon size={64} /><div><span>AI Intelligence</span><strong>Core</strong></div></div></div>
    <nav aria-label="Creator navigation" className="flex-1 space-y-1 overflow-y-auto px-4 py-2">{CREATOR_NAV.map(item => {
      const Icon = icons[item.icon];
      const active = pathname === item.href;
      return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={`creator-nav-link flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "creator-nav-active" : "text-white/75 hover:bg-white/10 hover:text-white"}`}><Icon size={18} strokeWidth={1.9} />{item.label}</Link>;
    })}</nav>
  </>;
  return <DashboardAccessProvider agencyName={brand} canManage={false}><CurrencyProvider><BlurProvider>
    <div className="creator-dashboard-shell flex h-dvh overflow-hidden">
      <aside className="dashboard-sidebar hidden h-dvh w-72 shrink-0 flex-col lg:flex">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-[90] lg:hidden"><button type="button" onClick={() => setOpen(false)} aria-label="Close navigation backdrop" className="absolute inset-0 bg-black/35 backdrop-blur-sm" /><aside role="dialog" aria-modal="true" aria-label="Creator navigation" className="dashboard-sidebar absolute inset-y-0 left-0 flex w-[min(88vw,20rem)] flex-col">{sidebar}</aside></div>}
      <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
        <header className="dashboard-topbar flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)} className="rounded-lg border border-line p-2 lg:hidden"><Menu size={20} /></button><span className="text-sm font-semibold"><span className="creator-name">{name}</span><span className="text-muted"> / {pageName}</span></span></div>
          <CreatorControls name={name} stars={stars} />
        </header>
        <MainShell>{children}</MainShell>
      </div>
    </div>
  </BlurProvider></CurrencyProvider></DashboardAccessProvider>;
}
