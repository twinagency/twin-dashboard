"use client";

import { useMemo, useRef, useState } from "react";
import type { OrModel } from "@/app/api/models/route";

// Searchable OpenRouter model picker. Renders a hidden input[name] so it submits
// inside a plain <form>. Shows price per 1M prompt tokens next to each model.
export default function ModelSelect({
  label,
  name,
  models,
  defaultValue,
}: {
  label: string;
  name: string;
  models: OrModel[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = models.find((m) => m.id === value);
  const perM = (p: number) => (p > 0 ? `$${(p * 1_000_000).toFixed(2)}/M` : "free");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      : models;
    return list.slice(0, 60);
  }, [models, query]);

  return (
    <div className="relative" ref={boxRef}>
      <span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">{label}</span>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-left text-sm outline-none hover:border-gray-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <span className={selected ? "" : "text-gray-400 dark:text-neutral-500"}>
          {selected ? selected.name : value || "Select model…"}
        </span>
        <span className="ml-2 shrink-0 text-xs text-gray-400 dark:text-neutral-500">
          {selected ? perM(selected.prompt) : ""}
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="w-full rounded-t-md border-b border-gray-200 bg-transparent px-3 py-2 text-sm outline-none dark:border-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
          />
          <div className="max-h-64 overflow-y-auto py-1">
            {models.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">Loading models…</div>
            )}
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setValue(m.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-neutral-900"
              >
                <span className="min-w-0">
                  <span className="block truncate">{m.name}</span>
                  <span className="block truncate text-xs text-gray-400 dark:text-neutral-500">{m.id}</span>
                </span>
                <span className="shrink-0 text-xs text-gray-400 dark:text-neutral-500">{perM(m.prompt)}</span>
              </button>
            ))}
            {filtered.length === 0 && models.length > 0 && (
              <div className="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">No matches.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
