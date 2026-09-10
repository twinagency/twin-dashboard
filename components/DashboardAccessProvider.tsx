"use client";
import React, { createContext, useContext, useEffect, useRef, type ReactNode, type ComponentProps } from "react";
const Access = createContext<{readOnly:boolean; isAgency:boolean; canManage:boolean; agencyName?:string}>({readOnly:false,isAgency:false,canManage:true});
export const useDashboardAccess = () => useContext(Access);

// LYNQ's light onboarding palette. These rules are scoped to the verified
// agency and do not change Twin, Moxy, Ava, financial colours or permissions.
const LYNQ_CSS = `
html[data-brand-theme="lynq-light"] {
  color-scheme: light;
  --color-bg: #faf9fc;
  --color-panel: #ffffff;
  --color-elev: #f3f2f8;
  --color-ink: #19191f;
  --color-muted: #656575;
  --color-line: #e6e2ed;
  --color-accent: #293bea;
  --color-accent-2: #3f55ff;
  --color-accent-deep: #202fb7;
  --color-accent-ink: #ffffff;
  --color-accent-soft: #8e9bff;
  --color-accent-tint: #ebeefe;
  --color-brand: #293bea;
  --color-brand-light: #3f55ff;
  --color-info: #293bea;
  --color-love: #e94b9c;
  --color-love-ink: #a32d6a;
  --color-love-tint: #f6c3dc;
  --color-love-bg: #fff3f9;
  --color-love-hover: #fde3f0;
  --color-love-peach: #ffd7bf;
  --lynq-orange: #ff8b35;
  --lynq-pink: #e94b9c;
  --lynq-blue: #293bea;
  --shadow-card: 0 2px 3px rgb(31 25 52 / 0.035), 0 12px 32px rgb(31 25 52 / 0.055);
  --sidebar: #ffffff;
  --sidebar-foreground: #19191f;
  --sidebar-primary: #293bea;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #ebeefe;
  --sidebar-accent-foreground: #293bea;
  --sidebar-border: #e6e2ed;
  --sidebar-ring: #293bea;
}
html[data-brand-theme="lynq-light"] body {
  background: var(--color-bg);
  color: var(--color-ink);
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar {
  background:
    radial-gradient(360px 260px at 0% 0%, rgb(255 139 53 / 0.09), transparent 72%),
    radial-gradient(360px 280px at 100% 100%, rgb(233 75 156 / 0.065), transparent 72%),
    #ffffff;
  border-right: 1px solid var(--color-line);
  color: var(--color-ink);
  box-shadow: 8px 0 28px rgb(31 25 52 / 0.04);
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar::before {
  background: none;
}
html[data-brand-theme="lynq-light"] .dashboard-mobile-header {
  background:
    linear-gradient(100deg, rgb(255 139 53 / 0.055), rgb(233 75 156 / 0.035) 55%, rgb(41 59 234 / 0.035)),
    #ffffff;
  color: var(--color-ink);
  border-color: var(--color-line);
  box-shadow: 0 1px 0 var(--color-line);
}
html[data-brand-theme="lynq-light"] .dashboard-topbar {
  background: rgb(255 255 255 / 0.97);
  color: var(--color-ink);
  box-shadow: 0 1px 0 var(--color-line), 0 6px 20px rgb(31 25 52 / 0.025);
}
html[data-brand-theme="lynq-light"] .canvas-glow {
  background-color: var(--color-bg);
  background-image:
    radial-gradient(850px 560px at 0% 0%, rgb(255 139 53 / 0.25), transparent 68%),
    radial-gradient(850px 620px at 5% 52%, rgb(233 75 156 / 0.17), transparent 72%),
    radial-gradient(800px 580px at 100% 85%, rgb(63 85 255 / 0.09), transparent 72%);
  background-position: left top;
  background-size: 100% 56rem;
  background-repeat: no-repeat;
}
html[data-brand-theme="lynq-light"] .dashboard-main::before {
  height: 20rem;
  background:
    radial-gradient(650px 350px at 8% 0%, rgb(255 139 53 / 0.16), transparent 72%),
    radial-gradient(700px 350px at 90% 0%, rgb(233 75 156 / 0.10), transparent 72%);
}
html[data-brand-theme="lynq-light"] .dashboard-main::after {
  background: none;
}
html[data-brand-theme="lynq-light"] .dashboard-main .rounded-2xl,
html[data-brand-theme="lynq-light"] .dashboard-main [data-slot="card"] {
  border-radius: 1.25rem;
}
html[data-brand-theme="lynq-light"] .dashboard-main [data-slot="card"] {
  background: #ffffff;
  border-color: var(--color-line);
  box-shadow: var(--shadow-card);
}
html[data-brand-theme="lynq-light"] .dashboard-page::before,
html[data-brand-theme="lynq-light"] .users-panel::before {
  background: linear-gradient(90deg, var(--lynq-orange), var(--lynq-pink), var(--lynq-blue));
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar [class*="border-white"] {
  border-color: var(--color-line);
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar [class*="text-white"] {
  color: var(--color-muted);
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar nav a,
html[data-brand-theme="lynq-light"] .dashboard-sidebar nav button {
  color: #535361;
  border-radius: 0.875rem;
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar nav a:hover,
html[data-brand-theme="lynq-light"] .dashboard-sidebar nav button:hover {
  color: var(--lynq-blue);
  background: #f3f2fc;
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar [class*="text-[#9cbad3]"] {
  color: var(--lynq-blue);
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar nav a[href*="ppvs"] > svg,
html[data-brand-theme="lynq-light"] .dashboard-sidebar nav a[href="/crm/campaigns"] > svg {
  color: #c93082;
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar nav a[href="/business"] > svg {
  color: #bc591c;
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar nav [class*="bg-white/12"] {
  background: linear-gradient(110deg, #ebeefe, #fff0f7);
  color: var(--lynq-blue);
  box-shadow: inset 0 0 0 1px #dddff6;
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar nav [class*="bg-white/12"] > svg {
  color: var(--lynq-blue);
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar [aria-label="Close navigation"],
html[data-brand-theme="lynq-light"] .dashboard-mobile-header button {
  color: var(--color-ink);
  border-color: var(--color-line);
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar [aria-label="Close navigation"] {
  background: #f3f2f8;
}
html[data-brand-theme="lynq-light"] .dashboard-mobile-header button:hover {
  background: #ebeefe;
}
html[data-brand-theme="lynq-light"] .dashboard-sidebar a:focus-visible,
html[data-brand-theme="lynq-light"] .dashboard-sidebar button:focus-visible,
html[data-brand-theme="lynq-light"] .dashboard-mobile-header button:focus-visible {
  outline: 2px solid var(--lynq-blue);
  outline-offset: 3px;
}
html[data-brand-theme="lynq-light"] .lynq-wordmark {
  color: var(--color-ink);
  text-shadow: none;
}
html[data-brand-theme="lynq-light"] .sidebar-create-button {
  background: linear-gradient(110deg, var(--lynq-blue), #7040df 65%, #b8359e);
  color: #ffffff;
  box-shadow: 0 8px 20px rgb(41 59 234 / 0.18);
}
`;

export default function DashboardAccessProvider({agencyName,canManage=false,children}:{agencyName?:string;canManage?:boolean;children:ReactNode}) {
  const lynq = agencyName?.trim().toLowerCase() === "lynq";
  useEffect(()=>{
    if(!lynq) return;
    const root=document.documentElement;
    const previousTheme=root.getAttribute("data-brand-theme");
    const previousAgency=root.getAttribute("data-agency");
    root.setAttribute("data-brand-theme","lynq-light");
    root.setAttribute("data-agency","lynq");
    return ()=>{
      if(previousTheme) root.setAttribute("data-brand-theme",previousTheme); else root.removeAttribute("data-brand-theme");
      if(previousAgency) root.setAttribute("data-agency",previousAgency); else root.removeAttribute("data-agency");
    };
  },[lynq]);
  return <Access.Provider value={{readOnly:!!agencyName && !canManage,isAgency:!!agencyName,canManage:!agencyName || canManage,agencyName}}>{lynq && <style dangerouslySetInnerHTML={{__html:LYNQ_CSS}} />}{children}</Access.Provider>;
}
export function AdminOnly({children}:{children:ReactNode}) {
  return useDashboardAccess().isAgency ? null : <>{children}</>;
}
export function ManagerOnly({children}:{children:ReactNode}) {
  return useDashboardAccess().readOnly ? null : <>{children}</>;
}
export function ReadOnlyFields({children,className=""}:{children:ReactNode;className?:string}) {
  const {readOnly}=useDashboardAccess();
  return <fieldset disabled={readOnly} className={`min-w-0 border-0 p-0 ${className}`}>{children}</fieldset>;
}
export function MutationForm({adminOnly=false,...props}:ComponentProps<"form"> & {adminOnly?:boolean}) {
  const {readOnly,isAgency}=useDashboardAccess();
  return readOnly || (adminOnly && isAgency) ? null : <form {...props}/>;
}

// Presentation only. Server middleware and the scoped data client independently
// enforce each agency's assigned-creator permissions. Navigation/expansion controls remain usable.
export function ReadOnlyEditor({children}:{children:ReactNode}) {
  const {readOnly}=useDashboardAccess();
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!readOnly || !ref.current) return;
    const root=ref.current;
    const disable=()=>root.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement>("input, select, textarea, button:not([data-readonly-navigation]):not([aria-expanded])").forEach(control=>{
      if(control.closest("[data-readonly-navigation]")) return;
      control.disabled=true;
    });
    disable();const observer=new MutationObserver(disable);observer.observe(root,{childList:true,subtree:true});
    return ()=>observer.disconnect();
  },[readOnly]);
  return <div ref={ref} className="contents">{children}</div>;
}
