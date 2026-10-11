"use client";

import { Info } from "@/components/clone/fields";

export default function MediaVisualDescription({ value, label = "AI visual description" }: {
  value: string | null | undefined;
  label?: string;
}) {
  const hasDescription = typeof value === "string" && value.trim().length > 0;

  return (
    <section className="mt-3 min-w-0 rounded-lg border border-line bg-bg p-3" aria-label={label}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
        {label}
        <Info text="The full saved visual_description field used for content matching. Separate from the short description and fan-facing captions. Read-only here. Scroll inside the box to read longer descriptions." />
      </div>
      <div
        className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-ink [overflow-wrap:anywhere]"
        tabIndex={hasDescription ? 0 : undefined}
        role={hasDescription ? "region" : undefined}
        aria-label={hasDescription ? label + ", full saved text" : undefined}
      >
        {hasDescription ? value : <span className="text-muted">No visual description saved</span>}
      </div>
    </section>
  );
}
