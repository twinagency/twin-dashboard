"use client";
import { useState } from "react";

export type ViewAsRow = { targetType: "agency" | "creator"; targetId: string; name: string; detail: string };

export default function ViewAsList({ rows, action }: { rows: ViewAsRow[]; action: (formData: FormData) => void }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle ? rows.filter((r) => (r.name + " " + r.detail).toLowerCase().includes(needle)) : rows;
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search agencies and creators"
        className={inputCls}
      />
      <div className="mt-3 flex flex-col gap-2">
        {filtered.map((r) => (
          <form
            key={`${r.targetType}:${r.targetId}`}
            action={action}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2"
          >
            <input type="hidden" name="targetType" value={r.targetType} />
            <input type="hidden" name="targetId" value={r.targetId} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{r.name}</div>
              <div className="truncate text-xs opacity-60">{r.detail}</div>
            </div>
            <button type="submit" className="shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/90">
              View as
            </button>
          </form>
        ))}
        {filtered.length === 0 && <div className="py-4 text-sm opacity-60">No matches.</div>}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50";
