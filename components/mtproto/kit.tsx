// components/mtproto/kit.tsx
//
// Small presentational building blocks shared by every MTProto Campaign
// screen, built only from the dashboard's own tokens (ink / muted / line /
// panel / good / warn / crit / info / accent) and the shared Card and ⓘ Info.
// No state, no data access. Explanations live in ⓘ hints, per the dashboard's
// UI conventions, not in grey paragraphs.

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Info } from "@/components/clone/fields";
import { colorForIndex, initials } from "@/lib/colors";
import { hashIndex, type Tone } from "./view";

const PILL: Record<Tone, string> = {
  neutral: "bg-muted/10 text-muted",
  good: "bg-good/15 text-good",
  warn: "bg-warn/15 text-warn",
  crit: "bg-crit/15 text-crit",
  info: "bg-info/15 text-info",
  accent: "bg-accent/12 text-accent",
};
const DOT: Record<Tone, string> = {
  neutral: "bg-muted/60",
  good: "bg-good",
  warn: "bg-warn",
  crit: "bg-crit",
  info: "bg-info",
  accent: "bg-accent",
};
const BOX: Record<Tone, string> = {
  neutral: "border-line bg-muted/5 text-ink",
  good: "border-good/30 bg-good/10 text-ink",
  warn: "border-warn/40 bg-warn/10 text-ink",
  crit: "border-crit/40 bg-crit/10 text-ink",
  info: "border-info/30 bg-info/10 text-ink",
  accent: "border-accent/25 bg-accent/5 text-ink",
};
const BOX_TITLE: Record<Tone, string> = {
  neutral: "text-ink",
  good: "text-good",
  warn: "text-warn",
  crit: "text-crit",
  info: "text-info",
  accent: "text-accent",
};
const VALUE: Record<Tone, string> = {
  neutral: "text-ink",
  good: "text-good",
  warn: "text-warn",
  crit: "text-crit",
  info: "text-info",
  accent: "text-accent",
};

/** The one status badge shape used for runs, sends, connections and modes. */
export function StatusPill({ tone = "neutral", dot = false, solid = false, children, title, className = "" }: { tone?: Tone; dot?: boolean; solid?: boolean; children: ReactNode; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${solid ? "bg-crit text-white" : PILL[tone]} ${className}`}
    >
      {dot && <span aria-hidden className={`size-1.5 rounded-full ${solid ? "bg-white" : DOT[tone]}`} />}
      {children}
    </span>
  );
}

/** A banner for something the operator must notice. */
export function Notice({ tone = "warn", title, children, className = "", role }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; role?: "alert" | "status" }) {
  return (
    <div role={role ?? (tone === "crit" ? "alert" : undefined)} className={`rounded-xl border px-4 py-3 text-sm ${BOX[tone]} ${className}`}>
      {title && <div className={`font-semibold ${BOX_TITLE[tone]}`}>{title}</div>}
      {children && <div className={title ? "mt-0.5 text-[13px] leading-relaxed" : "leading-relaxed"}>{children}</div>}
    </div>
  );
}

/** Titled card. Explanations hang off the title as an ⓘ hover. */
export function Panel({ title, tip, actions, children, className = "", bodyClassName = "" }: { title: ReactNode; tip?: string; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <Card className={`gap-0 border border-line py-0 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-1.5 font-heading text-sm font-semibold text-ink">
          {title}
          {tip && <Info text={tip} />}
        </h2>
        {actions}
      </div>
      <div className={`p-4 sm:p-5 ${bodyClassName}`}>{children}</div>
    </Card>
  );
}

/** One headline number with a plain label and an ⓘ. Money uses tone="good". */
export function Kpi({ label, tip, value, sub, tone = "neutral" }: { label: string; tip: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-panel p-3.5 shadow-[var(--shadow-card)] sm:p-4">
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        <span className="truncate">{label}</span>
        <Info text={tip} />
      </div>
      <div className={`mt-1.5 font-heading text-2xl font-semibold tabular-nums tracking-[-0.025em] ${VALUE[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted/80">{sub}</div>}
    </div>
  );
}

/** Friendly empty state. `action` is usually a link button. */
export function EmptyBlock({ icon = "○", title, hint, action }: { icon?: string; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line px-4 py-8 text-center">
      <div aria-hidden className="grid size-10 place-items-center rounded-full bg-muted/10 text-lg text-muted">{icon}</div>
      <div className="mt-1 text-sm font-semibold text-ink">{title}</div>
      {hint && <div className="max-w-md text-[13px] leading-relaxed text-muted">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-line/70 ${className}`} />;
}

/** Circle with the creator's initials, colour stable per creator. */
export function CreatorAvatar({ id, name, className = "size-10 text-sm" }: { id: string; name: string; className?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-semibold leading-none text-white ${className}`} style={{ background: colorForIndex(hashIndex(id)) }}>
      {initials(name) || "?"}
    </span>
  );
}

/** A message the creator's account sent (or would send), drawn like Telegram. */
export function Bubble({ who, text, meta, tone = "sent" }: { who?: ReactNode; text: ReactNode; meta?: ReactNode; tone?: "sent" | "muted" }) {
  return (
    <div className="flex flex-col items-end">
      {who && <div className="mb-0.5 max-w-full truncate text-[11px] text-muted">{who}</div>}
      <div
        className={`max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-snug sm:max-w-[80%] ${
          tone === "sent" ? "bg-accent-tint text-ink" : "bg-muted/10 text-muted"
        }`}
      >
        {text}
      </div>
      {meta && <div className="mt-0.5 text-[11px] text-muted/80">{meta}</div>}
    </div>
  );
}

/** Thin progress bar: `value` of `max`. Turns amber near the limit, red at it. */
export function Meter({ value, max, className = "" }: { value: number; max: number; className?: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const tone = ratio >= 1 ? "bg-crit" : ratio >= 0.8 ? "bg-warn" : "bg-accent-2";
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-line ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
}

/** Relative time with the exact time on hover. Hydration-safe. */
export function When({ iso, relative, className = "" }: { iso: string | null | undefined; relative: string; className?: string }) {
  return (
    <time dateTime={iso ?? undefined} title={iso ? new Date(iso).toLocaleString() : undefined} suppressHydrationWarning className={className}>
      {relative}
    </time>
  );
}

/** Numbered step heading used by the New run flow. */
export function StepHeading({ n, title, tip, done }: { n: number; title: string; tip?: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-good text-white" : "bg-accent text-accent-ink"}`}>{done ? "✓" : n}</span>
      <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold text-ink">
        {title}
        {tip && <Info text={tip} />}
      </h2>
    </div>
  );
}
