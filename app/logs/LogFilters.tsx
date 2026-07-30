"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TECH_CHIPS } from "./tech";

const LEVELS = ["all", "info", "warn", "error"] as const;

// Per-fan filter params (clone/fan/fanUser/fanLabel, see page.tsx) ride along
// with every tech/level/search change instead of getting silently dropped -
// otherwise touching any filter chip while looking at one fan's logs would
// snap back to the whole fleet.
function buildHref(
  tech: string,
  level: string,
  q: string,
  fanParams: { clone?: string; fan?: string; fanUser?: string; fanLabel?: string },
): string {
  const p = new URLSearchParams();
  if (tech !== "all") p.set("tech", tech);
  if (level !== "all") p.set("level", level);
  if (q.trim()) p.set("q", q.trim());
  if (fanParams.clone) p.set("clone", fanParams.clone);
  if (fanParams.fan) p.set("fan", fanParams.fan);
  if (fanParams.fanUser) p.set("fanUser", fanParams.fanUser);
  if (fanParams.fanLabel) p.set("fanLabel", fanParams.fanLabel);
  const qs = p.toString();
  return qs ? `/logs?${qs}` : "/logs";
}

// Unified filter bar: tech chips (fans-page style), level chips, search.
// All state lives in the URL so filters survive refresh and are shareable.
export function LogFilters({
  tech,
  level,
  q,
  clone,
  fan,
  fanUser,
  fanLabel,
}: {
  tech: string;
  level: string;
  q: string;
  clone?: string;
  fan?: string;
  fanUser?: string;
  fanLabel?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fanParams = { clone, fan, fanUser, fanLabel };

  // Keep local input in sync if the URL changes underneath us.
  useEffect(() => setSearch(q), [q]);

  function apply(nextTech: string, nextLevel: string, nextQ: string) {
    router.replace(buildHref(nextTech, nextLevel, nextQ, fanParams));
  }

  function onSearch(value: string) {
    setSearch(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply(tech, level, value), 400);
  }

  const levelChip = (l: string) => {
    const active = level === l;
    const tone =
      l === "warn"
        ? active
          ? "border-warn/50 bg-warn/15 text-warn"
          : "border-transparent text-warn/70 hover:text-warn"
        : l === "error"
          ? active
            ? "border-crit/50 bg-crit/15 text-crit"
            : "border-transparent text-crit/70 hover:text-crit"
          : active
            ? "border-line bg-elev text-ink"
            : "border-transparent text-muted hover:text-ink";
    return (
      <button
        key={l}
        type="button"
        onClick={() => apply(tech, l, search)}
        className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${tone}`}
      >
        {l}
      </button>
    );
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {TECH_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => apply(c.key, level, search)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${tech === c.key ? c.on : c.off}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 rounded-full border border-line bg-panel p-0.5">
        {LEVELS.map(levelChip)}
      </div>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search messages"
        className="h-9 w-full rounded-lg border border-line bg-panel px-3 text-xs text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 sm:w-56"
      />
    </div>
  );
}
