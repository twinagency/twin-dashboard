"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setCloneScope } from "@/app/actions/clone-scope";
import { initials } from "@/lib/colors";
import { onOpenCloneSwitcher } from "@/lib/clone-switcher-bus";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type CloneLite = { id: string; name: string; color: string; photoUrl?: string };

// Instagram-style verified badge — always blue, regardless of clone color.
function VerifiedBadge({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#3897f0] text-white ${className}`}>
      <svg viewBox="0 0 24 24" className="h-[65%] w-[65%]" fill="none" stroke="currentColor" strokeWidth={3.2}>
        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

// Top-of-app control: pick "All clones" (aggregate) or one clone. Drives every
// data page (Revenue/Fans/Info/Drip/Media/Logs) via a cookie (lib/clone-scope.ts)
// instead of a /clones/[id]/* route — one page per page-type, scope switches the
// data underneath it.
export default function CloneSwitcher({
  clones,
  activeCloneId,
}: {
  clones: CloneLite[];
  activeCloneId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const active = activeCloneId ? clones.find((c) => c.id === activeCloneId) : null;

  // Girl-only nav rows (Sidebar's PPVs/Edit) dispatch this instead of
  // navigating when no clone is picked yet.
  useEffect(() => onOpenCloneSwitcher(() => setOpen(true)), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clones;
    return clones.filter((c) => c.name.toLowerCase().includes(q));
  }, [clones, query]);

  // /clones/[id]* is the ONE family of routes that takes its clone from the
  // URL instead of the scope cookie — the Configure page the sidebar's PPVs and
  // Edit rows land on. Setting the cookie and refreshing therefore re-rendered
  // the OLD girl's page, and the only way through was to re-click that sidebar
  // row (which rebuilds its href from the new scope). Point the URL at the
  // newly picked clone instead, carrying the query (?tab=/?sub=) so PPVs stays
  // on PPVs and Edit stays on Edit. Returns null for every cookie-scoped page,
  // where a refresh alone already switches the data underneath you.
  function cloneRouteFor(id: string | null): string | null {
    if (!pathname?.startsWith("/clones/") || pathname === "/clones/new") return null;
    // "All clones" has no single-girl Configure page, same rule the sidebar
    // enforces by opening this picker rather than linking anywhere.
    if (!id) return "/clones";
    // Deeper routes (/clones/[id]/fans/[userId]) address one girl's own row and
    // have no equivalent under another, so they land on her Configure page.
    const query = searchParams.toString();
    return `/clones/${id}${query ? `?${query}` : ""}`;
  }

  function pick(id: string | null) {
    setOpen(false);
    startTransition(async () => {
      await setCloneScope(id);
      const dest = cloneRouteFor(id);
      if (dest) router.push(dest);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="flex items-center gap-2 rounded-full px-2.5 py-1 text-sm font-medium text-ink transition hover:bg-muted/10 disabled:opacity-60"
      >
        {active ? (
          <>
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ background: active.color, boxShadow: `0 0 0 2px ${active.color}55` }}
            >
              {initials(active.name)}
            </span>
            <span className="max-w-[10rem] truncate">{active.name}</span>
            <VerifiedBadge />
          </>
        ) : (
          <>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted/20 text-[8px] font-bold text-muted">
              ALL
            </span>
            <span>All clones</span>
          </>
        )}
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <DialogContent
        className="top-[12vh] flex max-h-[75vh] w-full max-w-lg translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        initialFocus={inputRef}
      >
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>Switch clone</DialogTitle>
        </DialogHeader>

        <div className="border-b border-line p-3">
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={pending}
            placeholder="Search clones…"
            className="h-9"
          />
        </div>

        <div className="overflow-y-auto p-3">
          <button
            type="button"
            onClick={() => pick(null)}
            disabled={pending}
            className={
              "mb-3 flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition disabled:opacity-60 " +
              (!activeCloneId
                ? "border-accent bg-accent/10 font-medium text-accent"
                : "border-line hover:bg-muted/10")
            }
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/20 text-[9px] font-bold text-muted">
              ALL
            </span>
            All clones
          </button>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {/* Create lives here — the switcher is the one place you always
                touch clones from, so "+ New clone" is always one click away. */}
            <Link
              href="/clones/new"
              className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-line px-2 py-3 text-center text-sm text-muted transition hover:border-accent hover:text-accent"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-current text-lg font-bold">
                +
              </span>
              <span className="w-full truncate">New clone</span>
            </Link>
            {filtered.map((c) => {
              const selected = activeCloneId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  disabled={pending}
                  style={
                    selected
                      ? { borderColor: c.color, backgroundColor: `${c.color}14` }
                      : undefined
                  }
                  className={
                    "relative flex flex-col items-center gap-1.5 rounded-md border px-2 py-3 text-center text-sm transition disabled:opacity-60 " +
                    (selected ? "font-medium" : "border-line hover:bg-muted/10")
                  }
                >
                  {selected && <VerifiedBadge className="absolute right-1.5 top-1.5 h-4 w-4" />}
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: c.color }}
                  >
                    {initials(c.name)}
                  </span>
                  <span className="w-full truncate" style={selected ? { color: c.color } : undefined}>
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>

          {clones.length === 0 && (
            <div className="px-2.5 py-6 text-center text-sm text-muted">No clones yet.</div>
          )}
          {clones.length > 0 && filtered.length === 0 && (
            <div className="px-2.5 py-6 text-center text-sm text-muted">No clones match &quot;{query}&quot;.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
