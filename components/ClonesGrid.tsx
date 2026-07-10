"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MoneyAmount from "@/components/MoneyAmount";
import { fmtNum } from "@/lib/money";
import { initials } from "@/lib/colors";
import { toggleClonePause } from "@/app/clones/actions";

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
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clones…"
          className="w-full max-w-xs rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs text-gray-900 placeholder-gray-500 outline-none transition focus:border-gray-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-400 dark:focus:border-neutral-600"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-12 text-center text-gray-500 dark:text-neutral-400">
          No clones match “{query}”.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/clones/${c.id}`}
              className="group rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm transition hover:border-gray-400 hover:shadow-md dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
            >
              {/* Header: avatar (ringed in the clone color) + name + status + features */}
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-full p-[2px]" style={{ backgroundColor: c.color }}>
                  <div className="rounded-full bg-white p-[2px] dark:bg-neutral-900">
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
                    <span className="truncate text-lg font-semibold text-gray-900 dark:text-neutral-100">{c.name}</span>
                    <button
                      type="button"
                      onClick={(e) => togglePause(e, c)}
                      title={c.active ? "Click to pause this bot" : "Click to resume this bot"}
                      className={
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition hover:opacity-80 " +
                        (c.active
                          ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                          : "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400")
                      }
                    >
                      <span className={"h-2 w-2 rounded-full " + (c.active ? "bg-green-500" : "bg-gray-400 dark:bg-neutral-500")} />
                      {c.active ? "active · pause" : "paused · resume"}
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {c.features.map((f) => (
                      <span
                        key={f}
                        className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats: stars · made · users */}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 dark:border-neutral-800 pt-3 text-center">
                <div>
                  <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-neutral-100">{fmtNum(c.stars)}⭐</div>
                  <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">Stars</div>
                </div>
                <div>
                  <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-neutral-100">
                    <MoneyAmount stars={c.stars} />
                  </div>
                  <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">Made</div>
                </div>
                <div>
                  <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-neutral-100">{fmtNum(c.users)}</div>
                  <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">Users</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
