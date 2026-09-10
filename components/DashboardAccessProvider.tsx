"use client";
import React, { createContext, useContext, useEffect, useRef, type ReactNode, type ComponentProps } from "react";
const Access = createContext<{readOnly:boolean; isAgency:boolean; canManage:boolean; agencyName?:string}>({readOnly:false,isAgency:false,canManage:true});
export const useDashboardAccess = () => useContext(Access);

const LYNQ_CSS = `
html[data-brand-theme="lynq-cyan"] {
  --color-bg: #eef9fa;
  --color-panel: #ffffff;
  --color-elev: #e3f5f6;
  --color-ink: #071820;
  --color-muted: #55737a;
  --color-line: #c9e8ea;
  --color-accent: #079eaf;
  --color-accent-2: #20dce8;
  --color-accent-deep: #020b13;
  --color-accent-ink: #ffffff;
  --color-accent-soft: #76e9ef;
  --color-accent-tint: #d8f8fa;
  --color-brand: #079eaf;
  --color-brand-light: #25e0eb;
  --color-info: #079eaf;
  --sidebar: #020b13;
  --sidebar-foreground: #ecfeff;
  --sidebar-primary: #22e3ed;
  --sidebar-primary-foreground: #021116;
  --sidebar-accent: rgb(34 227 237 / 0.10);
  --sidebar-accent-foreground: #ecfeff;
  --sidebar-border: rgb(85 238 244 / 0.18);
  --sidebar-ring: #22e3ed;
  --intelligence-core-glow-rgb: 31, 224, 235;
  --intelligence-core-edge-rgb: 55, 238, 246;
  --intelligence-core-front-rgb: 231, 255, 255;
  --intelligence-core-back-rgb: 35, 204, 220;
  --intelligence-core-accent-rgb: 121, 247, 251;
  --intelligence-core-glow-alpha: 0.48;
}
html[data-brand-theme="lynq-cyan"] body {
  background: #eef9fa;
}
html[data-brand-theme="lynq-cyan"] .dashboard-sidebar {
  background:
    radial-gradient(250px 210px at 88% 9%, rgb(35 229 239 / 0.24), transparent 64%),
    radial-gradient(300px 250px at 15% 72%, rgb(4 118 144 / 0.15), transparent 70%),
    linear-gradient(180deg, #071a27 0%, #03111b 45%, #02080f 100%);
  border-right: 1px solid rgb(66 231 239 / 0.17);
  box-shadow: 12px 0 38px rgb(1 13 20 / 0.20), inset -1px 0 0 rgb(42 227 237 / 0.05);
}
html[data-brand-theme="lynq-cyan"] .dashboard-mobile-header {
  background:
    radial-gradient(220px 120px at 80% 10%, rgb(35 229 239 / 0.22), transparent 68%),
    linear-gradient(100deg, #061b28 0%, #020b13 100%);
}
html[data-brand-theme="lynq-cyan"] .canvas-glow {
  background-color: var(--color-bg);
  background-image:
    radial-gradient(900px 260px at 88% -4%, rgb(33 222 232 / 0.13), transparent 64%),
    radial-gradient(650px 220px at 8% 0%, rgb(14 154 177 / 0.08), transparent 66%),
    linear-gradient(180deg, rgb(255 255 255 / 0.72), transparent 17rem);
}
html[data-brand-theme="lynq-cyan"] .dashboard-main::before {
  background:
    radial-gradient(780px 340px at 92% 0%, rgb(38 224 234 / 0.13), transparent 67%),
    radial-gradient(640px 300px at 5% 0%, rgb(255 255 255 / 0.82), transparent 70%),
    linear-gradient(180deg, rgb(7 158 175 / 0.035), transparent 90%);
}
html[data-brand-theme="lynq-cyan"] .dashboard-main::after {
  background: linear-gradient(180deg, transparent 0 96%, rgb(28 205 218 / 0.10) 100%);
}
html[data-brand-theme="lynq-cyan"] .dashboard-sidebar a:focus-visible,
html[data-brand-theme="lynq-cyan"] .dashboard-sidebar button:focus-visible {
  outline-color: #26e3ed;
}
html[data-brand-theme="lynq-cyan"] .lynq-wordmark {
  color: #efffff;
  text-shadow: 0 0 18px rgb(46 230 239 / 0.22);
}
html[data-brand-theme="lynq-cyan"] .lynq-ai-orb {
  position: relative;
  display: grid;
  place-items: center;
  border-radius: 999px;
  filter: drop-shadow(0 0 13px rgb(28 226 237 / 0.68));
  animation: lynq-orb-float 4.2s ease-in-out infinite;
}
html[data-brand-theme="lynq-cyan"] .lynq-ai-orb::before {
  position: absolute;
  inset: 8%;
  border-radius: inherit;
  content: "";
  background: radial-gradient(circle, rgb(38 235 243 / 0.18), transparent 68%);
  box-shadow: 0 0 28px rgb(32 225 235 / 0.28);
  pointer-events: none;
}
html[data-brand-theme="lynq-cyan"] .dashboard-sidebar [class*="text-[#9cbad3]"] {
  color: #68e6ed !important;
}
html[data-brand-theme="lynq-cyan"] .sidebar-create-button {
  background: linear-gradient(135deg, #0db6c4, #24dce6);
  color: #021116;
  box-shadow: 0 8px 24px rgb(15 190 202 / 0.22);
}
@keyframes lynq-orb-float {
  0%,100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-4px) scale(1.025); }
}
@media (prefers-reduced-motion: reduce) {
  html[data-brand-theme="lynq-cyan"] .lynq-ai-orb { animation: none; }
}
`;

export default function DashboardAccessProvider({agencyName,canManage=false,children}:{agencyName?:string;canManage?:boolean;children:ReactNode}) {
  const lynq = agencyName?.trim().toLowerCase() === "lynq";
  useEffect(()=>{
    if(!lynq) return;
    const root=document.documentElement;
    const previousTheme=root.getAttribute("data-brand-theme");
    const previousAgency=root.getAttribute("data-agency");
    root.setAttribute("data-brand-theme","lynq-cyan");
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
