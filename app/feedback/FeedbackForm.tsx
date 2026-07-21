"use client";

import { useState, useTransition } from "react";
import { inputCls, selectCls, Section } from "@/components/clone/fields";
import { createFeedback } from "./actions";
import { SEVERITIES, type FeedbackType } from "./shared";

type CloneLite = { id: string; name: string };

export default function FeedbackForm({ clones }: { clones: CloneLite[] }) {
  const [type, setType] = useState<FeedbackType>("bug");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    startTransition(async () => {
      try {
        await createFeedback(fd);
        // createFeedback redirects on success; if it returns, nothing else to do.
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const isBug = type === "bug";

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <Section>
        {/* Type toggle — bug vs suggestion */}
        <div>
          <span className="mb-1.5 block text-xs text-muted">What is this?</span>
          <div className="inline-flex rounded-lg border border-line bg-muted/10 p-1">
            {(
              [
                { v: "bug", label: "🐞 Report a bug" },
                { v: "suggestion", label: "💡 Suggest a feature" },
              ] as { v: FeedbackType; label: string }[]
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setType(o.v)}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                  (type === o.v
                    ? "bg-panel text-ink shadow-sm ring-1 ring-black/5"
                    : "text-muted hover:text-ink")
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-muted">
            Title<span className="ml-1 text-accent">*</span>
          </span>
          <input
            name="title"
            required
            placeholder={isBug ? "e.g. Paywall shows twice on first purchase" : "e.g. Let operators schedule campaigns per weekday"}
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-muted">
            {isBug ? "What happened? Steps to reproduce" : "Describe the idea"}
          </span>
          <textarea
            name="body"
            rows={5}
            placeholder={
              isBug
                ? "What did you expect, what actually happened, and how to trigger it."
                : "What problem does it solve, and how might it work?"
            }
            className={inputCls}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Clone (optional)</span>
            <select name="clone_id" defaultValue="" className={selectCls}>
              <option value="">(Not clone-specific)</option>
              {clones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {isBug && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Severity (optional)</span>
              <select name="severity" defaultValue="" className={selectCls}>
                <option value="">(Unset)</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {isBug && (
          <div className="grid gap-2 rounded-lg border border-line bg-bg/60 p-4">
            <span className="text-xs font-medium text-muted">Screenshot (optional)</span>
            <input
              type="file"
              name="screenshot"
              accept="image/*"
              className="block text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-muted/20 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink"
            />
            <span className="text-[11px] text-muted">
              Or paste an image URL instead:
            </span>
            <input name="screenshot_url" placeholder="https://…" className={inputCls} />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-sm text-crit">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-ink shadow-md transition-all hover:bg-accent-deep hover:shadow-lg active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Submitting…" : isBug ? "Submit bug report" : "Submit suggestion"}
          </button>
          <a href="/feedback" className="text-sm text-muted hover:text-ink">
            Cancel
          </a>
        </div>
      </Section>
    </form>
  );
}
