"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TECH_CHIPS } from "./tech";

const LEVELS = ["all", "info", "warn", "error"] as const;

function buildHref(tech: string, level: string, q: string): string {
  const p = new URLSearchParams();
  if (tech !== "all") p.set("tech", tech);
  if (level !== "all") p.set("level", level);
  if (q.trim()) p.set("q", q.trim());
  const qs = p.toString();
  return qs ? `/logs?${qs}` : "/logs";
}

// Unified filter bar: tech chips (fans-page style), level chips, search.
// All state lives in the URL so filters survive refresh and are shareable.
export function LogFilters({ tech, level, q }: { tech: string; level: string; q: string }) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync if the URL changes underneath us.
  useEffect(() => setSearch(q), [q]);

  function apply(nextTech: string, nextLevel: string, nextQ: string) {
    router.replace(buildHref(nextTech, nextLevel, nextQ));
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
    <div className="mb-4 flex flex-wrap items-center gap-3">
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
        className="w-56 rounded-md border border-line bg-panel px-3 py-1.5 text-xs text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}
