"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Menu, X, DollarSign, Image as ImageIcon, Bot, Info, List, SlidersHorizontal, LogOut, CheckCircle2 } from "lucide-react";
import DashboardAccessProvider from "./DashboardAccessProvider";
import CurrencyProvider, { useCurrency } from "./CurrencyProvider";
import BlurProvider from "./BlurProvider";
import CurrencyToggle from "./CurrencyToggle";
import BlurToggle from "./BlurToggle";
import MainShell from "./MainShell";
import TwinWordmark from "./TwinWordmark";
import IntelligenceCoreIcon from "./IntelligenceCoreIcon";
import { CREATOR_DASHBOARD_NAV } from "@/lib/creator-dashboard-policy";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";

const ICONS = { earnings: DollarSign, media: ImageIcon, business: Bot, info: Info, logs: List, edit: SlidersHorizontal };
function Navigation({ agencyName, onNavigate, close }: { agencyName: string; onNavigate?: () => void; close?: ReactNode }) {
  const pathname = usePathname();
  return <>
    <div className="flex h-20 shrink-0 items-center justify-between border-b border-white/14 px-5">
      <Link href="/creator" onClick={onNavigate} aria-label={agencyName}><TwinWordmark inverse agencyName={agencyName === "Twin" ? undefined : agencyName} /></Link>{close}
    </div>
    <div className="shrink-0 px-4 pb-2 pt-4" data-creator-core="hero">
      <div className="creator-core-hero"><IntelligenceCoreIcon size={64} /><div><span>AI Intelligence</span><strong>Core</strong></div></div>
    </div>
    <nav aria-label="Creator navigation" className="flex flex-1 flex-col overflow-y-auto px-4 py-2">
      <div className="space-y-1">{CREATOR_DASHBOARD_NAV.map(item => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href;
        return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`creator-nav-link flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${active ? "bg-white/12 text-white ring-1 ring-white/12" : "text-white/80 hover:bg-white/10 hover:text-white"}`}><Icon className="h-[18px] w-[18px] shrink-0" /><span>{item.label}</span></Link>;
      })}</div>
    </nav>
  </>;
}
function WorkspaceTopBar({ creatorName, allTimeStars }: { creatorName: string; allTimeStars: number }) {
  const path = usePathname();
  const pageLabel = CREATOR_DASHBOARD_NAV.find(item => item.href === path)?.label || "Earnings";
  const { currency, rate } = useCurrency();
  const initials = creatorName.split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase();
  return <div className="dashboard-topbar sticky top-0 z-40 flex h-20 shrink-0 items-center justify-center gap-3 border-b border-line px-5 sm:grid sm:grid-cols-[1fr_auto_1fr] lg:px-8">
    <h1 className="hidden min-w-0 truncate font-heading text-sm font-semibold tracking-[-0.02em] text-ink sm:block"><span className="creator-name">{creatorName}</span><span className="text-muted"> / {pageLabel}</span></h1>
    <div className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-xl border border-line/80 bg-white/82 px-2 py-1.5 shadow-[0_8px_26px_rgb(6_23_47/0.06)] backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2 px-2 py-1.5"><span className="creator-header-avatar grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-semibold text-white">{initials}</span><span className="creator-name max-w-[110px] truncate text-sm font-semibold text-ink sm:max-w-[160px]">{creatorName}</span><CheckCircle2 className="hidden h-3.5 w-3.5 text-info sm:block" aria-label="Creator account" /></div>
      <div className="h-5 w-px shrink-0 bg-line" />
      <span className="hidden items-baseline gap-1 px-1.5 sm:flex"><span className="text-xs" aria-hidden="true">💵</span><span className="font-mono text-xs font-semibold tabular-nums text-good">{fmtMoney(starsToMoneyRate(allTimeStars, currency, rate), currency)}</span></span>
      <div className="hidden h-5 w-px shrink-0 bg-line sm:block" /><CurrencyToggle compact /><BlurToggle /><div className="hidden h-5 w-px shrink-0 bg-line sm:block" />
      <form action="/creator-auth/logout" method="post"><button type="submit" aria-label="Sign out" title="Sign out" className="flex items-center justify-center gap-1.5 rounded-full p-2 text-muted transition hover:bg-muted/10 hover:text-ink"><LogOut className="h-5 w-5" /><span className="hidden text-xs font-medium sm:inline">Sign out</span></button></form>
    </div><div className="hidden sm:block" />
  </div>;
}
export default function CreatorWorkspaceShell({ agencyName, creatorName, connected, allTimeStars, children }: { agencyName: string; creatorName: string; connected: boolean; allTimeStars: number; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = () => Array.from(drawer.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]') ?? []);
    items()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab") {
        const list = items(); if (!list.length) return;
        if (event.shiftKey && document.activeElement === list[0]) { event.preventDefault(); list[list.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === list[list.length - 1]) { event.preventDefault(); list[0].focus(); }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = oldOverflow; window.removeEventListener("keydown", keydown); (before || trigger.current)?.focus(); };
  }, [open]);
  return <DashboardAccessProvider agencyName={agencyName} canManage={false}><CurrencyProvider><BlurProvider>
    <div className="creator-workspace flex h-screen" data-creator-workspace-shell="true">
      <aside className="dashboard-sidebar creator-sidebar sticky top-0 hidden h-screen w-72 shrink-0 flex-col lg:flex"><Navigation agencyName={agencyName} /></aside>
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden"><Link href="/creator" aria-label={agencyName}><TwinWordmark inverse agencyName={agencyName === "Twin" ? undefined : agencyName} /></Link><button ref={trigger} type="button" aria-label="Open navigation" aria-expanded={open} aria-controls="creator-mobile-sidebar" onClick={() => setOpen(true)} className="rounded-full p-2 text-white"><Menu className="h-5 w-5" /></button></header>
        <WorkspaceTopBar creatorName={creatorName} allTimeStars={allTimeStars} />
        <MainShell>{!connected && <div role="status" className="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">Your onboarding is complete. Your dashboard will show live earnings and content once your AI creator profile is connected.</div>}{children}</MainShell>
      </div>
    </div>
    {open && createPortal(<div className="fixed inset-0 z-[90] lg:hidden"><button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" /><aside ref={drawer} id="creator-mobile-sidebar" role="dialog" aria-modal="true" aria-label="Creator navigation" className="dashboard-sidebar creator-sidebar absolute inset-y-0 left-0 flex h-dvh w-[min(88vw,20rem)] max-w-full flex-col overflow-hidden"><Navigation agencyName={agencyName} onNavigate={() => setOpen(false)} close={<button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-white/25 text-white"><X className="h-4 w-4" /></button>} /></aside></div>, document.body)}
  </BlurProvider></CurrencyProvider></DashboardAccessProvider>;
}
