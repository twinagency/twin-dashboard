"use client";

import { diffLines } from "@/lib/text-diff";

// Line-level diff rendering shared by: the pre-save "review changes" panel,
// the pre-restore "here's what will change" panel, the post-save "what just
// changed" recap, and the per-version history row diff. Unified so every
// diff in the editor looks and behaves identically.
export default function DiffView({
  oldText,
  newText,
  oldLabel = "Before",
  newLabel = "After",
}: {
  oldText: string;
  newText: string;
  oldLabel?: string;
  newLabel?: string;
}) {
  if (oldText === newText) {
    return <p className="rounded-lg border border-line bg-bg px-3 py-2 text-xs text-muted">No differences, the two versions are identical.</p>;
  }

  const lines = diffLines(oldText, newText);
  const added = lines.filter((l) => l.type === "add").length;
  const removed = lines.filter((l) => l.type === "del").length;

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-elev px-3 py-1.5 text-[11px] text-muted">
        <span>
          <span className="text-crit">-{removed}</span> <span className="text-good">+{added}</span> · {oldLabel} → {newLabel}
        </span>
      </div>
      <div className="max-h-96 overflow-y-auto font-mono text-xs leading-relaxed">
        {lines.map((l, i) => (
          <div
            key={i}
            className={
              "whitespace-pre-wrap break-words px-3 py-0.5 " +
              (l.type === "add"
                ? "bg-good/10 text-ink"
                : l.type === "del"
                  ? "bg-crit/10 text-ink line-through decoration-crit/50"
                  : "text-muted")
            }
          >
            <span className="mr-2 inline-block w-3 select-none text-muted/60">{l.type === "add" ? "+" : l.type === "del" ? "-" : ""}</span>
            {l.text || " "}
          </div>
        ))}
      </div>
    </div>
  );
}
