"use client";
import { useDashboardAccess } from "./DashboardAccessProvider";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setCloneScope } from "@/app/actions/clone-scope";
import CreatorAvatar from "@/components/CreatorAvatar";
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
  locked = false,
  fallbackName,
  allowNewCreator = true,
}: {
  clones: CloneLite[];
  activeCloneId: string | null;
  /** Render the selected identity without opening the fleet picker. */
  locked?: boolean;
  /** Account display name used while a creator is waiting for clone linking. */
  fallbackName?: string;
  allowNewCreator?: boolean;
}) {
  const router = useRouter();
  const {isAgency}=useDashboardAccess();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [switchError, setSwitchError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const active = activeCloneId ? clones.find((c) => c.id === activeCloneId) : null;

  // Girl-only nav rows (Sidebar's PPVs/Edit) dispatch this instead of
  // navigating when no clone is picked yet.
  useEffect(() => locked ? undefined : onOpenCloneSwitcher(() => setOpen(true)), [locked]);

  const filteredCreators = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clones.filter((creator) => creator.name.toLowerCase().includes(q)) : clones;
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
    if (pending) return;
    setSwitchError("");
    setOpen(false);
    startTransition(async () => {
      try {
      if (pathname?.startsWith("/onlyfans")) {
        const params = new URLSearchParams(searchParams.toString());
        if (id) params.set("creator", id); else params.delete("creator");
        params.delete("account"); params.delete("conversation");
        router.push(`${pathname}${params.size ? `?${params}` : ""}`);
        return;
      }
      if (isAgency) {
        const response = await fetch("/agency/clone-scope",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clone:id})});
        if (!response.ok) throw new Error("Unable to switch creator");
      } else await setCloneScope(id);
      const dest = cloneRouteFor(id);
      if (dest) {
        router.push(dest);
        router.refresh();
      } else if (isAgency) {
        // The JSON endpoint sets the cookie; it does not return a new tree.
        router.refresh();
      }
      // setCloneScope already revalidates and returns the current tree for
      // internal viewers. Refreshing it again repeats the entire page load.
      } catch {
        setSwitchError("Unable to switch creator. Please try again.");
        setOpen(true);
      }
    });
  }

  function CreatorCard({ creator }: { creator: CloneLite }) {
    const selected = activeCloneId === creator.id;
    return (
      <button
        type="button"
        onClick={() => pick(creator.id)}
        disabled={pending}
        style={selected ? { borderColor: creator.color, backgroundColor: `${creator.color}14` } : undefined}
        className={
          "relative flex min-w-0 flex-col items-center gap-1.5 rounded-md border px-2 py-3 text-center text-sm transition disabled:opacity-60 " +
          (selected ? "font-medium" : "border-line hover:bg-muted/10")
        }
      >
        {selected && <VerifiedBadge className="absolute right-1.5 top-1.5 h-4 w-4" />}
        <CreatorAvatar name={creator.name} photoUrl={creator.photoUrl} />
        <span className="creator-name w-full truncate" style={selected ? { color: creator.color } : undefined}>
          {creator.name}
        </span>
      </button>
    );
  }

  if (locked) {
    const name = active?.name || fallbackName || "Creator";
    return (
      <div
        aria-label={`Creator account: ${name}`}
        className="flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-ink"
      >
        <CreatorAvatar name={name} photoUrl={active?.photoUrl} className="h-5 w-5" />
        <span className="creator-name max-w-[10rem] truncate">{name}</span>
        {active ? <VerifiedBadge /> : null}
      </div>
    );
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
        aria-busy={pending}
        data-creator-switch-pending={pending || undefined}
        disabled={pending}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-[#e5f0f8] disabled:opacity-60"
      >
        {active ? (
          <>
            <CreatorAvatar name={active.name} photoUrl={active.photoUrl} className="h-5 w-5" />
            <span className="creator-name max-w-[10rem] truncate">{active.name}</span>
            <VerifiedBadge />
          </>
        ) : (
          <>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted/20 text-[8px] font-bold text-muted">
              ALL
            </span>
            <span>All creators</span>
          </>
        )}
        {pending ? (
          <span role="status" aria-label="Switching creator" className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="12" cy="12" r="9" opacity="0.25" />
              <path d="M12 3a9 9 0 0 1 9 9" />
            </svg>
          </span>
        ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        )}
      </button>

      <DialogContent
        className="top-[12vh] flex max-h-[75vh] w-full max-w-lg translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        initialFocus={inputRef}
      >
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>Switch creator</DialogTitle>
        </DialogHeader>

        <div className="border-b border-line p-3">
          {switchError && <p role="alert" className="mb-2 text-sm text-crit">{switchError}</p>}
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={pending}
            placeholder="Search creators…"
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
            All creators
          </button>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filteredCreators.map((creator) => <CreatorCard key={creator.id} creator={creator} />)}
          </div>

          {!isAgency && allowNewCreator && <Link
            href="/clones/new"
            className="mt-3 flex items-center justify-center gap-2 rounded-md border border-dashed border-line px-3 py-2.5 text-sm text-muted transition hover:border-accent hover:text-accent"
          >
            <span className="text-lg leading-none">+</span>
            New creator
          </Link>}

          {clones.length === 0 && (
            <div className="px-2.5 py-6 text-center text-sm text-muted">No creators yet.</div>
          )}
          {clones.length > 0 && filteredCreators.length === 0 && (
            <div className="px-2.5 py-6 text-center text-sm text-muted">No creators match &quot;{query}&quot;.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
