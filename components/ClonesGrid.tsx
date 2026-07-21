"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MoneyAmount from "@/components/MoneyAmount";
import { fmtNum } from "@/lib/money";
import { initials } from "@/lib/colors";
import { toggleClonePause } from "@/app/clones/actions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type CloneCard = {
  id: string;
  name: string;
  slug: string;
  status: string;
  active: boolean;
  color: string;
  photoUrl?: string;
  stars: number;
  users: number;
  features: string[];
};

export default function ClonesGrid({ clones }: { clones: CloneCard[] }) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const [, startTransition] = useTransition();

  const togglePause = (e: React.MouseEvent, c: CloneCard) => {
    e.preventDefault(); // don't navigate into the card
    e.stopPropagation();
    startTransition(async () => {
      await toggleClonePause(c.id, c.active);
      router.refresh();
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clones;
    return clones.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
  }, [query, clones]);

  return (
    <div>
      <div className="mb-5">
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clones…"
          className="h-9 max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-12 text-center text-muted">
          No clones match “{query}”.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/clones/${c.id}`}
              className="group rounded-xl border border-line bg-panel p-4 shadow-[var(--shadow-card)] transition hover:border-accent/60"
            >
              {/* Header: avatar (ringed in the clone color) + name + status + features */}
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-full p-[2px]" style={{ backgroundColor: c.color }}>
                  <div className="rounded-full bg-panel p-[2px]">
                    {c.photoUrl ? (
                      <img src={c.photoUrl} alt={c.name} className="block h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ backgroundColor: c.color }}
                      >
                        {initials(c.name)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-lg font-semibold text-ink">{c.name}</span>
                    <button
                      type="button"
                      onClick={(e) => togglePause(e, c)}
                      title={c.active ? "Click to pause this bot" : "Click to resume this bot"}
                      className="shrink-0"
                    >
                      <Badge
                        className={
                          "gap-1.5 px-2.5 py-1 transition hover:opacity-80 " +
                          (c.active ? "bg-good/15 text-good" : "bg-muted/10 text-muted")
                        }
                      >
                        <span className={"h-2 w-2 rounded-full " + (c.active ? "bg-good" : "bg-muted")} />
                        {c.active ? "active · pause" : "paused · resume"}
                      </Badge>
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {c.features.map((f) => (
                      <Badge key={f} variant="secondary" className="font-medium text-muted">
                        {f}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats: stars · made · users */}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                <div>
                  <div className="font-mono text-lg font-bold tabular-nums text-good">{fmtNum(c.stars)}⭐</div>
                  <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted">Stars</div>
                </div>
                <div>
                  <div className="font-mono text-lg font-bold tabular-nums text-good">
                    <MoneyAmount stars={c.stars} />
                  </div>
                  <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted">Made</div>
                </div>
                <div>
                  <div className="font-mono text-lg font-bold tabular-nums text-ink">{fmtNum(c.users)}</div>
                  <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted">Users</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
