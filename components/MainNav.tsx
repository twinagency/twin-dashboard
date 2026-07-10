"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { initials } from "@/lib/colors";

type CloneLite = { id: string; name: string; color: string; photoUrl?: string };
type Section = "revenue" | "edit" | "users" | "drip" | "upsell" | "logs" | "info";

function Avatar({ clone, size }: { clone: CloneLite; size: number }) {
  const px = { width: size, height: size };
  if (clone.photoUrl) {
    return <img src={clone.photoUrl} alt={clone.name} style={px} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      style={{ ...px, backgroundColor: clone.color }}
      className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
    >
      {initials(clone.name)}
    </span>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

const PATHS: Record<string, string> = {
  Revenue: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 7h5v5"/>',
  Edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  Users:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  Logs:
    '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  Info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  Drip: '<path d="M12 2.5S6 9 6 13.5a6 6 0 0 0 12 0C18 9 12 2.5 12 2.5z"/>',
  Upsell: '<circle cx="12" cy="12" r="10"/><path d="M8 12l4-4 4 4"/><line x1="12" y1="8" x2="12" y2="16"/>',
  All: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  Chevron: '<path d="M6 9l6 6 6-6"/>',
};

// Where a given section lives, for either "All" scope (id = null) or a clone.
function hrefFor(id: string | null, section: Section): string {
  if (id) {
    const b = `/clones/${id}`;
    return section === "edit" ? b : `${b}/${section === "users" ? "fans" : section}`;
  }
  // "All" scope — Edit needs a specific clone, so fall back to Revenue.
  return section === "edit" || section === "revenue" ? "/revenue" : `/${section}`;
}

export default function MainNav({ clones }: { clones: CloneLite[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Layout passes clones oldest-first, so the last 3 are the most recent.
  const recent = useMemo(() => clones.slice(-3).reverse(), [clones]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clones;
    return clones.filter((c) => c.name.toLowerCase().includes(q));
  }, [clones, search]);

  // Current clone scope, derived from the URL (/clones/<id>/...), or null = "All".
  const seg = pathname.match(/^\/clones\/([^/]+)/)?.[1];
  const cloneId = seg && seg !== "new" && clones.some((c) => c.id === seg) ? seg : null;
  const current = cloneId ? clones.find((c) => c.id === cloneId)! : null;
  const base = cloneId ? `/clones/${cloneId}` : null;

  // Which section (tab) is currently showing — kept when switching scope.
  function currentSection(): Section {
    if (cloneId && base) {
      const rest = pathname.slice(base.length);
      if (rest.startsWith("/revenue")) return "revenue";
      if (rest.startsWith("/fans")) return "users";
      if (rest.startsWith("/drip")) return "drip";
      if (rest.startsWith("/upsell")) return "upsell";
      if (rest.startsWith("/logs")) return "logs";
      if (rest.startsWith("/info")) return "info";
      return "edit"; // clone root + media etc.
    }
    if (pathname.startsWith("/users")) return "users";
    if (pathname.startsWith("/drip")) return "drip";
    if (pathname.startsWith("/upsell")) return "upsell";
    if (pathname.startsWith("/logs")) return "logs";
    if (pathname.startsWith("/info")) return "info";
    return "revenue";
  }

  function switchScope(id: string | null) {
    setOpen(false);
    setModalOpen(false);
    setSearch("");
    router.push(hrefFor(id, currentSection()));
  }

  const tabs: { label: string; section: Section; href: string | null; soon?: boolean }[] = cloneId
    ? [
        { label: "Revenue", section: "revenue", href: hrefFor(cloneId, "revenue") },
        { label: "Configure", section: "edit", href: `${base}` },
        { label: "Users", section: "users", href: hrefFor(cloneId, "users") },
        { label: "Drip", section: "drip", href: hrefFor(cloneId, "drip") },
        { label: "Upsell", section: "upsell", href: hrefFor(cloneId, "upsell"), soon: true },
        { label: "Logs", section: "logs", href: hrefFor(cloneId, "logs") },
        { label: "Info", section: "info", href: hrefFor(cloneId, "info") },
      ]
    : [
        { label: "Revenue", section: "revenue", href: "/revenue" },
        { label: "Configure", section: "edit", href: null }, // pick a clone first
        { label: "Users", section: "users", href: "/users" },
        { label: "Drip", section: "drip", href: "/drip" },
        { label: "Upsell", section: "upsell", href: "/upsell", soon: true },
        { label: "Logs", section: "logs", href: "/logs" },
        { label: "Info", section: "info", href: "/info" },
      ];

  function isActive(href: string | null) {
    if (!href) return false;
    if (href === base) return pathname === base; // "Edit" = clone root, exact match
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="flex items-center gap-1 rounded-xl bg-gray-100/70 p-1 dark:bg-white/[0.04]">
      {/* Scope switcher — shows the active clone's photo + name */}
      <div className="relative mr-0.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-sm font-medium text-gray-700 transition hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-neutral-200 dark:hover:text-white"
        >
          {current ? (
            <>
              <Avatar clone={current} size={20} />
              <span className="max-w-[10rem] truncate">{current.name}</span>
            </>
          ) : (
            <>
              <Icon d={PATHS.All} />
              <span>All clones</span>
            </>
          )}
          <span className="text-gray-400 dark:text-neutral-500">
            <Icon d={PATHS.Chevron} />
          </span>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-20 mt-2 w-60 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-neutral-900">
              <button
                type="button"
                onClick={() => switchScope(null)}
                className={
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition " +
                  (!cloneId
                    ? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]")
                }
              >
                <span className="flex h-6 w-6 items-center justify-center text-gray-500 dark:text-neutral-400">
                  <Icon d={PATHS.All} />
                </span>
                All clones
              </button>
              {recent.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => switchScope(c.id)}
                  className={
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition " +
                    (cloneId === c.id
                      ? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white"
                      : "text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]")
                  }
                >
                  <Avatar clone={c} size={24} />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
              {clones.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setModalOpen(true);
                  }}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border-t border-gray-100 px-2.5 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:border-white/10 dark:text-neutral-400 dark:hover:text-white"
                >
                  See more…
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* See-more modal — search across all clones */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
          onClick={() => {
            setModalOpen(false);
            setSearch("");
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 p-3 dark:border-white/10">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clones…"
                className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 outline-none transition focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.06] dark:text-neutral-100 dark:placeholder-neutral-400 dark:focus:border-neutral-600"
              />
            </div>
            <div className="max-h-[60vh] overflow-auto p-1.5">
              <button
                type="button"
                onClick={() => switchScope(null)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-gray-600 transition hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
              >
                <span className="flex h-7 w-7 items-center justify-center text-gray-500 dark:text-neutral-400">
                  <Icon d={PATHS.All} />
                </span>
                All clones
              </button>
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => switchScope(c.id)}
                  className={
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition " +
                    (cloneId === c.id
                      ? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white"
                      : "text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]")
                  }
                >
                  <Avatar clone={c} size={28} />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-2.5 py-6 text-center text-sm text-gray-400 dark:text-neutral-500">No matches.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tabs.map((t) =>
        t.href ? (
          <Link
            key={t.label}
            href={t.href}
            className={
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition " +
              (isActive(t.href)
                ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:text-white dark:ring-white/10"
                : "text-gray-500 hover:bg-white/60 hover:text-gray-900 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-white")
            }
          >
            <Icon d={PATHS[t.label]} />
            {t.label}
            {t.soon && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                soon
              </span>
            )}
          </Link>
        ) : (
          <span
            key={t.label}
            title="Pick a clone first"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-300 dark:text-neutral-700"
          >
            <Icon d={PATHS[t.label]} />
            {t.label}
          </span>
        ),
      )}
    </nav>
  );
}
