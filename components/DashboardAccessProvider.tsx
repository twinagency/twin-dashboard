"use client";
import { createContext, useContext, useEffect, useRef, type ReactNode, type ComponentProps } from "react";
const Access = createContext<{readOnly:boolean; agencyName?:string}>({readOnly:false});
export const useDashboardAccess = () => useContext(Access);
export default function DashboardAccessProvider({agencyName,children}:{agencyName?:string;children:ReactNode}) {
  return <Access.Provider value={{readOnly:!!agencyName,agencyName}}>{children}</Access.Provider>;
}
export function AdminOnly({children}:{children:ReactNode}) {
  return useDashboardAccess().readOnly ? null : <>{children}</>;
}
export function ReadOnlyFields({children,className=""}:{children:ReactNode;className?:string}) {
  const {readOnly}=useDashboardAccess();
  return <fieldset disabled={readOnly} className={`min-w-0 border-0 p-0 ${className}`}>{children}</fieldset>;
}
export function MutationForm(props:ComponentProps<"form">) {
  return useDashboardAccess().readOnly ? null : <form {...props}/>;
}

// Presentation only. Server middleware and the scoped data client independently
// enforce read-only access. Navigation/expansion controls remain usable.
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
