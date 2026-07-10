"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { initials } from "@/lib/colors";

type CloneLite = { id: string; name: string; color: string; photoUrl?: string };
type Section = "revenue" | "edit" | "users" | "drip" | "upsell" | "logs" | "info";

// Mirrors MainNav.hrefFor: where a section lives for "All" scope (null) or a clone.
function hrefFor(id: string | null, section: Section): string {
  if (id) {
    const b = `/clones/${id}`;
    return section === "edit" ? b : `${b}/${section === "users" ? "fans" : section}`;
  }
  return section === "edit" || section === "revenue" ? "/revenue" : `/${section}`;
}

function Avatar({ clone }: { clone: CloneLite }) {
  if (clone.photoUrl) {
    return <img src={clone.photoUrl} alt={clone.name} className="h-7 w-7 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      style={{ backgroundColor: clone.color }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
    >
      {initials(clone.name)}
    </span>
  );
}

// Mobile-only nav: a hamburger that drops down to the same destinations the
// desktop MainNav exposes. Scope-aware — within a clone the section links point
// at that clone's pages (incl. Edit); from anywhere you can tap a clone to enter
// its scope, or reach the global pages.
export default function MobileMenu({ clones }: { clones: CloneLite[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const seg = pathname.match(/^\/clones\/([^/]+)/)?.[1];
  const cloneId = seg && seg !== "new" && clones.some((c) => c.id === seg) ? seg : null;
  const current = cloneId ? clones.find((c) => c.id === cloneId)! : null;

  // Section links. Edit only makes sense inside a clone, so it's shown when one
  // is active; otherwise pick a clone below to get it.
  const sections: { label: string; section: Section; soon?: boolean }[] = cloneId
    ? [
        { label: "Revenue", section: "revenue" },
        { label: "Configure", section: "edit" },
        { label: "Users", section: "users" },
        { label: "Drip", section: "drip" },
        { label: "Upsell", section: "upsell", soon: true },
        { label: "Logs", section: "logs" },
        { label: "Info", section: "info" },
      ]
    : [
        { label: "Revenue", section: "revenue" },
        { label: "Users", section: "users" },
        { label: "Drip", section: "drip" },
        { label: "Upsell", section: "upsell", soon: true },
        { label: "Logs", section: "logs" },
        { label: "Info", section: "info" },
      ];

  function isActive(href: string) {
    if (href === `/clones/${cloneId}`) return pathname === href; // Edit = clone root, exact
    return pathname === href || pathname.startsWith(href + "/");
  }

  const itemCls = (active: boolean) =>
    "block rounded-lg px-3 py-2.5 text-sm font-medium transition " +
    (active
      ? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white"
      : "text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]");

  const close = () => setOpen(false);

  return (
    <div className="relative lg:hidden">
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-neutral-300 dark:hover:bg-white/[0.06] dark:hover:text-white transition"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 z-50 mt-2 max-h-[80vh] w-64 overflow-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-neutral-900">
            {/* Current scope */}
            <div className="px-3 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-neutral-500">
              {current ? current.name : "All clones"}
            </div>
            {sections.map((s) => {
              const href = hrefFor(cloneId, s.section);
              return (
                <Link key={s.label} href={href} onClick={close} className={itemCls(isActive(href)) + " flex items-center justify-between"}>
                  {s.label}
                  {s.soon && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                      soon
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Clone picker — tap to enter a clone's scope (lands on its Edit page) */}
            {clones.length > 0 && (
              <>
                <div className="my-1.5 border-t border-gray-100 dark:border-white/10" />
                <div className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-neutral-500">
                  Switch clone
                </div>
                {clones.map((c) => (
                  <Link
                    key={c.id}
                    href={`/clones/${c.id}`}
                    onClick={close}
                    className={
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition " +
                      (cloneId === c.id
                        ? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white"
                        : "text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]")
                    }
                  >
                    <Avatar clone={c} />
                    <span className="truncate">{c.name}</span>
                  </Link>
                ))}
              </>
            )}

            <div className="my-1.5 border-t border-gray-100 dark:border-white/10" />
            <Link href="/clones" onClick={close} className={itemCls(isActive("/clones"))}>
              All clones (grid)
            </Link>
            <Link href="/clones/new" onClick={close} className={itemCls(isActive("/clones/new"))}>
              + Create new clone
            </Link>
            <Link href="/settings" onClick={close} className={itemCls(isActive("/settings"))}>
              Settings
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
