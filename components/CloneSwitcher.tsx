"use client";
import { useDashboardAccess } from "./DashboardAccessProvider";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setCloneScope } from "@/app/actions/clone-scope";
import { initials } from "@/lib/colors";
import { onOpenCloneSwitcher } from "@/lib/clone-switcher-bus";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type CloneLite = { id: string; name: string; color: string; photoUrl?: string };

type CreatorTeam = { label: string | null; creators: CloneLite[] };
type CreatorCategory = { label: string; teams: CreatorTeam[] };

// These are commercial relationships, not a property of a creator's public
// persona. Keep the named partner rosters here so new, unassigned creators
// land safely under Individual talent instead of disappearing from the picker.
const AGENCY_ROSTERS = [
  { label: "Tasty", names: ["Alanna Pow", "Dan Dangler", "Autumn Renae"] },
  { label: "Moxy Agency", names: ["Riley Mae Lewis", "Allison Parker"] },
] as const;

const WHITELABEL_ROSTERS = [
  { label: "Toochi", names: ["Kyla Yesenosky", "Zoey Foxx"] },
  { label: "JB", names: ["Briana Redd", "Mrs Callace"] },
  { label: "CJ", names: ["Dreka Cakez"] },
] as const;

const creatorKey = (name: string) => name.trim().toLocaleLowerCase();

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
  const {readOnly}=useDashboardAccess();
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

  const creatorCategories = useMemo<CreatorCategory[]>(() => {
    const creatorByName = new Map(clones.map((creator) => [creatorKey(creator.name), creator]));
    const assigned = new Set<string>();

    const makeTeams = (rosters: readonly { label: string; names: readonly string[] }[]) =>
      rosters
        .map((roster) => {
          const creators = roster.names
            .map((name) => creatorByName.get(creatorKey(name)))
            .filter((creator): creator is CloneLite => Boolean(creator));
          creators.forEach((creator) => assigned.add(creatorKey(creator.name)));
          return { label: roster.label, creators };
        })
        .filter((team) => team.creators.length > 0);

    const agencyTeams = makeTeams(AGENCY_ROSTERS);
    const whitelabelTeams = makeTeams(WHITELABEL_ROSTERS);
    const individualCreators = clones.filter((creator) => !assigned.has(creatorKey(creator.name)));

    return [
      { label: "Individual talent", teams: individualCreators.length ? [{ label: null, creators: individualCreators }] : [] },
      { label: "Agency", teams: agencyTeams },
      { label: "Whitelabel partner", teams: whitelabelTeams },
    ].filter((category) => category.teams.length > 0);
  }, [clones]);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return creatorCategories;
    return creatorCategories
      .map((category) => ({
        ...category,
        teams: category.teams
          .map((team) => ({ ...team, creators: team.creators.filter((creator) => creator.name.toLowerCase().includes(q)) }))
          .filter((team) => team.creators.length > 0),
      }))
      .filter((category) => category.teams.length > 0);
  }, [creatorCategories, query]);

  const visibleCreatorCount = filteredCategories.reduce(
    (total, category) => total + category.teams.reduce((teamTotal, team) => teamTotal + team.creators.length, 0),
    0,
  );

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
      if (readOnly) {
        const response = await fetch("/agency/clone-scope",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clone:id})});
        if (!response.ok) throw new Error("Unable to switch creator");
      } else await setCloneScope(id);
      const dest = cloneRouteFor(id);
      if (dest) router.push(dest);
      router.refresh();
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
        <span
          className="creator-name flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: creator.color }}
        >
          {initials(creator.name)}
        </span>
        <span className="creator-name w-full truncate" style={selected ? { color: creator.color } : undefined}>
          {creator.name}
        </span>
      </button>
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
        disabled={pending}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-[#e5f0f8] disabled:opacity-60"
      >
        {active ? (
          <>
            {/* Initials leak the name just as plainly as the name does, so the
                avatar chip carries .creator-name too. */}
            <span
              className="creator-name flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ background: active.color, boxShadow: `0 0 0 2px ${active.color}55` }}
            >
              {initials(active.name)}
            </span>
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
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <DialogContent
        className="top-[12vh] flex max-h-[75vh] w-full max-w-lg translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        initialFocus={inputRef}
      >
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>Switch creator</DialogTitle>
        </DialogHeader>

        <div className="border-b border-line p-3">
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

          <div className="space-y-2">
            {filteredCategories.map((category) => {
              const count = category.teams.reduce((total, team) => total + team.creators.length, 0);
              return (
                <details key={category.label} className="group rounded-lg border border-line bg-surface/40" open={query ? true : undefined}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    <span>{category.label}</span>
                    <span className="flex items-center gap-2 text-[11px] font-medium text-muted">
                      {count} {count === 1 ? "creator" : "creators"}
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </summary>
                  <div className="space-y-3 border-t border-line px-2.5 py-2.5">
                    {category.teams.map((team) => (
                      <div key={team.label ?? "individual"}>
                        {team.label && <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{team.label}</p>}
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {team.creators.map((creator) => <CreatorCard key={creator.id} creator={creator} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>

          {/* Keep adding a creator available without mixing it into someone’s
              commercial category. */}
          {!readOnly && <Link
            href="/clones/new"
            className="mt-3 flex items-center justify-center gap-2 rounded-md border border-dashed border-line px-3 py-2.5 text-sm text-muted transition hover:border-accent hover:text-accent"
          >
            <span className="text-lg leading-none">+</span>
            New creator
          </Link>}

          {clones.length === 0 && (
            <div className="px-2.5 py-6 text-center text-sm text-muted">No creators yet.</div>
          )}
          {clones.length > 0 && visibleCreatorCount === 0 && (
            <div className="px-2.5 py-6 text-center text-sm text-muted">No creators match &quot;{query}&quot;.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

