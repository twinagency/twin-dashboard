"use client";

import { useMemo, useRef, useState } from "react";
import type { OrModel } from "@/app/api/models/route";
import { REC_TIER_BADGE, type Rec } from "./clone/fields";

// Small pill for a recommendation tier (⭐ Best / 💰 Value / 🪙 Cheapest).
function TierBadge({ tier, className = "" }: { tier: Rec["tier"]; className?: string }) {
  const b = REC_TIER_BADGE[tier];
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.cls} ${className}`}>
      {b.label}
    </span>
  );
}

// Searchable OpenRouter model picker. Renders a hidden input[name] so it submits
// inside a plain <form>. Shows in/out price per 1M tokens next to each model, and
// pins a "Recommended" group (with tier badges) at the top of the dropdown.
export default function ModelSelect({
  label,
  name,
  models,
  defaultValue,
  recommended,
  weak,
}: {
  label: string;
  name: string;
  models: OrModel[];
  defaultValue?: string;
  recommended?: Rec[];
  weak?: { id: string; why: string }[];
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = models.find((m) => m.id === value);
  const perM = (p: number) => (p > 0 ? `$${(p * 1_000_000).toFixed(2)}/M` : "free");
  // Both prompt (in) and completion (out) price, e.g. "$1.00/M in / $2.00/M out".
  const priceLine = (m: OrModel) => `${perM(m.prompt)} in / ${perM(m.completion)} out`;

  const recForValue = recommended?.find((r) => r.id === value);
  const weakForValue = weak?.find((w) => w.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      : models;
    return list.slice(0, 60);
  }, [models, query]);

  const pick = (id: string) => {
    setValue(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={boxRef}>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-bg px-3 py-2 text-left text-sm outline-none hover:border-accent/60"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={"truncate " + (selected || value ? "" : "text-muted")}>
            {selected ? selected.name : value || "Select model…"}
          </span>
          {recForValue && <TierBadge tier={recForValue.tier} />}
          {weakForValue && (
            <span
              title={weakForValue.why}
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-warn/15 text-warn"
            >
              ⚠ better options
            </span>
          )}
        </span>
        <span className="ml-2 shrink-0 text-xs text-muted">
          {selected ? priceLine(selected) : ""}
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-line bg-panel shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="w-full rounded-t-md border-b border-line bg-transparent px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-64 overflow-y-auto py-1">
            {/* Pinned recommendations — always shown at the top, ignore the query. */}
            {recommended && recommended.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Recommended
                </div>
                {recommended.map((r, i) => {
                  const m = models.find((mm) => mm.id === r.id);
                  return (
                    <button
                      key={`${r.id}-${r.tier}-${i}`}
                      type="button"
                      onClick={() => pick(r.id)}
                      className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/10"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <TierBadge tier={r.tier} />
                          <span className="truncate">{m ? m.name : r.id}</span>
                        </span>
                        <span className="block truncate text-xs text-muted">{r.id}</span>
                        <span className="block truncate text-xs text-muted">{r.note}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted">
                        {m ? priceLine(m) : "—"}
                      </span>
                    </button>
                  );
                })}
                <div className="my-1 border-t border-line" />
              </>
            )}

            {models.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted">Loading models…</div>
            )}
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/10"
              >
                <span className="min-w-0">
                  <span className="block truncate">{m.name}</span>
                  <span className="block truncate text-xs text-muted">{m.id}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{priceLine(m)}</span>
              </button>
            ))}
            {filtered.length === 0 && models.length > 0 && (
              <div className="px-3 py-2 text-sm text-muted">No matches.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
