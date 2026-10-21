"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Ellipsis, X } from "lucide-react";
import { SidebarContent } from "@/components/Sidebar";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { isDashboardWorkspaceRoute } from "@/lib/dashboard-creator-route";
import { usesCompactWorkspace } from "@/lib/compact-workspace";

// The phone menu is the desktop sidebar's real content in a touch-friendly
// drawer. Sharing SidebarContent keeps the links, icons, active states and
// clone-gated behavior identical at every breakpoint.
export default function MobileMenu({
  activeCloneId,
  variant = "header",
}: {
  activeCloneId: string | null;
  variant?: "header" | "bottom";
}) {
  const pathname = usePathname();
  const { audience, agencyName } = useDashboardAccess();
  const operator = audience === "admin";
  const studio = operator || audience !== "creator" && isDashboardWorkspaceRoute(pathname);
  const [open, setOpen] = useState(false);
  const uniqueId = useId();
  const drawerId = variant === "header" ? "mobile-sidebar" : uniqueId;
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(drawer.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),select,input,[tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = priorOverflow; trigger.current?.focus(); };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        ref={trigger}
        aria-controls={drawerId}
        onClick={() => setOpen(true)}
        className={variant === "bottom" ? "compact-more-button" : "rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"}
      >
        {variant === "bottom" ? <><Ellipsis size={21} aria-hidden="true" /><span>More</span></> : <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>}
      </button>

      {open ? createPortal(
        <div className="fixed inset-0 z-[90] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[#071526]/24 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
          />
          <aside
            id={drawerId}
            ref={drawer}
            data-compact-workspace={usesCompactWorkspace(audience, agencyName) || undefined}
            data-studio-sidebar={studio || undefined}
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className={`dashboard-sidebar absolute inset-y-0 left-0 flex h-dvh w-[min(88vw,20rem)] max-w-full flex-col overflow-hidden animate-in slide-in-from-left duration-200`}
          >
            <SidebarContent
              activeCloneId={activeCloneId}
              onNavigate={() => setOpen(false)}
              showAssistant={false}
              headerAction={
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
      ) : null}
    </div>
  );
}
