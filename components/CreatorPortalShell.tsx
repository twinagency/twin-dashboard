'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { DollarSign, Image as ImageIcon, ClipboardCheck, Settings, LogOut, Menu, X } from 'lucide-react';
import TwinWordmark from '@/components/TwinWordmark';

const items = [
  { href: '/creator', label: 'Earnings', Icon: DollarSign },
  { href: '/creator/ppv', label: 'PPVs', Icon: ImageIcon },
  { href: '/creator/onboarding-view', label: 'Onboarding', Icon: ClipboardCheck },
  { href: '/creator/profile', label: 'Profile', Icon: Settings },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <nav className="mt-7 space-y-2">{items.map(({ href, label, Icon }) => {
    const active = href === '/creator' ? pathname === href : pathname.startsWith(href);
    return <Link key={href} href={href} onClick={onNavigate} className={`flex items-center gap-4 rounded-[18px] px-5 py-4 text-[17px] font-semibold transition ${active ? 'border border-[#3657f5]/15 bg-gradient-to-r from-[#f3f4ff] to-[#fff1f4] text-[#304bf4]' : 'text-[#646575] hover:bg-[#f7f7fa]'}`}><Icon size={24} strokeWidth={1.8}/>{label}</Link>;
  })}</nav>;
}

export default function CreatorPortalShell({ displayName, children }: { displayName: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', fn); return () => removeEventListener('keydown', fn);
  }, [open]);

  const drawer = <aside className="flex h-full w-[min(88vw,20rem)] flex-col overflow-hidden border-r border-[#dedee8] bg-white px-7 py-8 shadow-2xl" onClick={e => e.stopPropagation()}>
    <div className="flex items-center justify-between"><TwinWordmark agencyName="LYNQ"/><button aria-label="Close navigation" className="grid h-11 w-11 place-items-center rounded-full border border-[#dedee8] bg-white shadow-sm" onClick={() => setOpen(false)}><X size={23}/></button></div>
    <p className="mt-10 px-1 text-[15px] text-[#646575]">LYNQ · Creator dashboard</p>
    <Nav onNavigate={() => setOpen(false)}/>
    <div className="mt-auto border-t border-[#dedee8] pt-5"><form action="/creator-auth/logout" method="post"><button className="flex w-full items-center gap-4 rounded-xl px-5 py-3 text-[16px] text-[#646575] hover:bg-[#f7f7fa]"><LogOut size={21}/>Sign out</button></form></div>
  </aside>;

  return <div className="min-h-screen bg-[#f8f8fb] text-[#17181d]" data-creator-brand="lynq">
    <header className="sticky top-0 z-40 flex h-[112px] items-center justify-between border-b border-[#dedee8] bg-white px-6 sm:px-10 lg:hidden"><TwinWordmark agencyName="LYNQ"/><div className="flex items-center gap-5"><form action="/creator-auth/logout" method="post"><button className="text-[15px] font-medium">Sign out</button></form><button aria-label="Open creator navigation" onClick={() => setOpen(true)}><Menu size={29} strokeWidth={1.7}/></button></div></header>
    {open && typeof document !== 'undefined' ? createPortal(<div className="fixed inset-0 z-[90] bg-[#071526]/24 backdrop-blur-[2px]" onClick={() => setOpen(false)}>{drawer}</div>, document.body) : null}
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-[#dedee8] bg-white px-6 py-7 lg:flex"><TwinWordmark agencyName="LYNQ"/><p className="mt-10 px-2 text-sm text-[#646575]">LYNQ · Creator dashboard</p><Nav/><div className="mt-auto border-t border-[#dedee8] pt-5"><form action="/creator-auth/logout" method="post"><button className="flex items-center gap-3 px-4 py-3 text-sm text-[#646575]"><LogOut size={18}/>Sign out</button></form></div></aside>
    <div className="lg:ml-[260px]">
      <div className="sticky top-[112px] z-30 border-b border-[#dedee8] bg-[#fbfbfd]/95 px-5 py-5 backdrop-blur lg:top-0"><div className="mx-auto flex max-w-[1500px] justify-center lg:justify-end"><div className="inline-flex min-w-[280px] items-center gap-3 rounded-[22px] border border-[#d9dae5] bg-white px-5 py-3 shadow-sm"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#ececf2] text-[10px] font-semibold text-[#676875]">YOU</span><strong className="min-w-0 flex-1 truncate text-[15px]">{displayName}</strong><span className="h-7 w-px bg-[#e3e3ea]"/><span className="rounded-full bg-[#f0f0f4] px-3 py-1.5 text-xs font-semibold">$AUD</span></div></div></div>
      {children}
    </div>
  </div>;
}
