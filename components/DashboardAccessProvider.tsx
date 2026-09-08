"use client";
import React, { createContext, useContext, useEffect, useRef, type ReactNode, type ComponentProps } from "react";
const Access = createContext<{readOnly:boolean; isAgency:boolean; canManage:boolean; agencyName?:string}>({readOnly:false,isAgency:false,canManage:true});
export const useDashboardAccess = () => useContext(Access);
export default function DashboardAccessProvider({agencyName,canManage=false,children}:{agencyName?:string;canManage?:boolean;children:ReactNode}) {
  return <Access.Provider value={{readOnly:!!agencyName && !canManage,isAgency:!!agencyName,canManage:!agencyName || canManage,agencyName}}>{children}</Access.Provider>;
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
