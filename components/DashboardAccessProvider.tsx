"use client";
import React, { createContext, useContext, useEffect, useRef, type ReactNode, type ComponentProps } from "react";

export type DashboardAudience = "admin" | "agency" | "creator";
type DashboardAccessContext = {
  audience: DashboardAudience;
  readOnly: boolean;
  isAgency: boolean;
  isCreator: boolean;
  canManage: boolean;
  agencyName?: string;
};

const Access = createContext<DashboardAccessContext>({
  audience: "admin",
  readOnly: false,
  isAgency: false,
  isCreator: false,
  canManage: true,
});
export const useDashboardAccess = () => useContext(Access);

// The palette lives only in app/lynq-theme.css. Server rendering sets this
// same verified-identity attribute before first paint; the effect keeps it
// in sync when this provider is mounted independently.
export default function DashboardAccessProvider({
  agencyName,
  canManage = false,
  audience,
  children,
}: {
  agencyName?: string;
  canManage?: boolean;
  audience?: DashboardAudience;
  children: ReactNode;
}) {
  // Existing callers need no migration: a verified agency name still means an
  // agency operator and no name still means internal admin. Creator layouts
  // opt in explicitly so shared shell components never infer creator authority
  // from presentation-only branding.
  const resolvedAudience: DashboardAudience = audience ?? (agencyName ? "agency" : "admin");
  const isAgency = resolvedAudience === "agency";
  const isCreator = resolvedAudience === "creator";
  const resolvedCanManage = resolvedAudience === "admin" || (isAgency && canManage);
  const readOnly = isCreator || (isAgency && !canManage);
  const lynq = agencyName?.trim().toLowerCase() === "lynq";
  useEffect(()=>{
    if(!lynq) return;
    const root=document.documentElement;
    const previousTheme=root.getAttribute("data-brand-theme");
    const previousAgency=root.getAttribute("data-agency");
    root.setAttribute("data-brand-theme","lynq-light");
    root.setAttribute("data-agency","lynq");

    // LYNQ intentionally has no CRM group in its sidebar. Keep the technical
    // tools that used to sit behind More visible at all times on desktop and
    // in the mobile drawer. This is presentation-only; server route policy is
    // unchanged.
    const polishSidebar=()=>{
      document.querySelectorAll<HTMLElement>(".dashboard-sidebar nav").forEach(nav=>{
        const list=nav.firstElementChild as HTMLElement|null;
        if(!list) return;
        const children=Array.from(list.children) as HTMLElement[];
        const crmIndex=children.findIndex(el=>el.textContent?.trim()==="CRM");
        if(crmIndex>=0){
          children[crmIndex].style.display="none";
          for(let i=crmIndex+1;i<children.length;i++){
            const moreButton=Array.from(children[i].querySelectorAll("button")).find(button=>button.textContent?.trim()==="More") as HTMLButtonElement|undefined;
            if(moreButton) break;
            children[i].style.display="none";
          }
        }
        const moreButton=Array.from(nav.querySelectorAll("button")).find(button=>button.textContent?.trim()==="More") as HTMLButtonElement|undefined;
        if(moreButton){
          if(moreButton.getAttribute("aria-expanded")!=="true") moreButton.click();
          moreButton.style.display="none";
        }
      });
    };
    polishSidebar();
    const observer=new MutationObserver(polishSidebar);
    observer.observe(document.body,{childList:true,subtree:true});

    return ()=>{
      observer.disconnect();
      if(previousTheme) root.setAttribute("data-brand-theme",previousTheme); else root.removeAttribute("data-brand-theme");
      if(previousAgency) root.setAttribute("data-agency",previousAgency); else root.removeAttribute("data-agency");
    };
  },[lynq]);
  return <Access.Provider value={{
    audience: resolvedAudience,
    readOnly,
    isAgency,
    isCreator,
    canManage: resolvedCanManage,
    agencyName,
  }}>{children}</Access.Provider>;
}
export function AdminOnly({children}:{children:ReactNode}) {
  return useDashboardAccess().audience === "admin" ? <>{children}</> : null;
}
export function ManagerOnly({children}:{children:ReactNode}) {
  return useDashboardAccess().readOnly ? null : <>{children}</>;
}
export function ReadOnlyFields({children,className=""}:{children:ReactNode;className?:string}) {
  const {readOnly}=useDashboardAccess();
  return <fieldset disabled={readOnly} className={`min-w-0 border-0 p-0 ${className}`}>{children}</fieldset>;
}
export function MutationForm({adminOnly=false,...props}:ComponentProps<"form"> & {adminOnly?:boolean}) {
  const {readOnly,audience}=useDashboardAccess();
  return readOnly || (adminOnly && audience !== "admin") ? null : <form {...props}/>;
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
