"use client";

import { useState } from "react";

export default function CopyField({ label, value, mono }: { label: string; value: string; mono?: "code" | "link" }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => setCopied(false),
    );
  };
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={copy}
          title="Click to copy"
          className={"min-w-0 flex-1 cursor-pointer break-all rounded-lg border border-line bg-panel px-3 py-2 text-left font-mono text-ink transition hover:border-accent " + (mono === "code" ? "text-xl tracking-[0.2em]" : "text-[12px]")}
        >
          {value}
        </button>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
