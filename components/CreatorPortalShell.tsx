'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ClipboardCheck, DollarSign, Eye, Image as ImageIcon, LogOut, Menu, Settings, X } from 'lucide-react';
import TwinWordmark from '@/components/TwinWordmark';
import IntelligenceCoreIcon from '@/components/IntelligenceCoreIcon';

const items = [
  { href: '/creator', label: 'Earnings', Icon: DollarSign },
  { href: '/creator/ppv', label: 'PPVs', Icon: ImageIcon },
  { href: '/creator/onboarding-view', label: 'Onboarding', Icon: ClipboardCheck },
  { href: '/creator/profile', label: 'Profile', Icon: Settings },
];

function CreatorNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col overflow-y-auto px-4 py-2">
      <div className="space-y-1">
        {items.map(({ href, label, Icon }) => {
          const active = href === '/creator' ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ' +
                (active
                  ? 'bg-white/12 text-white ring-1 ring-white/12'
                  : 'text-white/68 hover:bg-white/[0.07] hover:text-white')
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0 text-[#9cbad3]" strokeWidth={1.9} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function CreatorSidebarContent({ onNavigate, closeAction }: { onNavigate?: () => void; closeAction?: ReactNode }) {
  return (
    <>
      <div className="flex h-20 shrink-0 items-center justify-between border-b border-white/14 px-5">
        <Link href="/creator" className="min-w-0" aria-label="LYNQ" onClick={onNavigate}>
          <TwinWordmark inverse agencyName="LYNQ" />
        </Link>
        {closeAction}
      </div>

      <div className="shrink-0 px-4 pb-2 pt-4">
        <div className="flex items-center gap-3 rounded-xl border border-sky-400/20 bg-sky-400/[0.05] px-3 py-3">
          <IntelligenceCoreIcon size={64} />
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-5 text-[#38bdf8]">AI Intelligence Core</span>
          </div>
        </div>
      </div>

      <div className="px-7 py-3 text-sm text-white/75">LYNQ · Creator dashboard</div>
      <CreatorNav onNavigate={onNavigate} />

      <div className="shrink-0 border-t border-white/14 px-4 py-3">
        <form action="/creator-auth/logout" method="post">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/68 transition hover:bg-white/[0.07] hover:text-white">
            <LogOut className="h-[18px] w-[18px] text-[#9cbad3]" strokeWidth={1.9} />
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

export default function CreatorPortalShell({ displayName, children }: { displayName: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <div className="flex h-screen bg-bg text-ink">
      <aside className="dashboard-sidebar sticky top-0 hidden h-screen w-72 shrink-0 flex-col lg:flex">
        <CreatorSidebarContent />
      </aside>

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden">
          <Link href="/creator" aria-label="LYNQ">
            <TwinWordmark inverse agencyName="LYNQ" />
          </Link>
          <div className="flex items-center gap-1">
            <form action="/creator-auth/logout" method="post">
              <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10">Sign out</button>
            </form>
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <Menu className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </header>

        {open && typeof document !== 'undefined'
          ? createPortal(
              <div className="fixed inset-0 z-[90] lg:hidden">
                <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 bg-[#071526]/24 backdrop-blur-[2px]" />
                <aside className="dashboard-sidebar absolute inset-y-0 left-0 flex h-dvh w-[min(88vw,20rem)] max-w-full flex-col overflow-hidden">
                  <CreatorSidebarContent
                    onNavigate={() => setOpen(false)}
                    closeAction={
                      <button
                        type="button"
                        aria-label="Close navigation"
                        onClick={() => setOpen(false)}
                        className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-white/75 shadow-sm backdrop-blur transition hover:bg-white/18 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    }
                  />
                </aside>
              </div>,
              document.body,
            )
          : null}

        <div className="dashboard-topbar sticky top-0 z-40 flex h-20 shrink-0 items-center justify-center gap-3 border-b border-line px-5 lg:px-8">
          <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line/80 bg-white/82 px-2 py-1.5 shadow-[0_8px_26px_rgb(6_23_47/0.06)] backdrop-blur-xl">
            <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-ink">
              <span className="creator-name flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted/20 text-[8px] font-bold text-muted">YOU</span>
              <span className="creator-name max-w-[10rem] truncate">{displayName}</span>
            </div>
            <div className="h-5 w-px shrink-0 bg-line" />
            <span className="rounded-full px-2 py-1.5 text-xs font-semibold text-ink">$AUD</span>
            <button type="button" aria-label="Privacy mode" className="flex items-center justify-center rounded-full p-2 text-muted transition hover:bg-muted/10 hover:text-ink"><Eye className="h-5 w-5" /></button>
            <div className="hidden h-5 w-px shrink-0 bg-line sm:block" />
            <form action="/creator-auth/logout" method="post">
              <button type="submit" title="Sign out" aria-label="Sign out" className="flex items-center justify-center rounded-full p-2 text-muted transition hover:bg-muted/10 hover:text-ink"><LogOut className="h-5 w-5" /></button>
            </form>
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
