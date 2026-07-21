// ── Shared visual primitives — "Telegram Blue" design system ──────────────────
// Small, reusable building blocks so every page (Revenue, Configure, Fans, Logs,
// ...) renders with the same surfaces, spacing and type scale. Colors always
// come from the CSS tokens in globals.css (bg/panel/ink/muted/line/accent/good/
// warn/crit/info) so light + dark both stay correct automatically.
//
// Money rule: any component rendering a dollar/⭐ figure should use `good`
// (text-good / MoneyStat accent="good"), never accent blue.

import type { ReactNode } from "react";

// ── Card ───────────────────────────────────────────────────────────────────
export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-line bg-panel text-ink shadow-[var(--shadow-card)] ${padded ? "p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}

// ── Page header ────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">{breadcrumb}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ── Section (page-level, distinct from clone/fields.tsx's form Section) ────
export function SectionCard({
  title,
  hint,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {(title || hint || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs text-muted/80">{hint}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </Card>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────
type StatAccent = "none" | "good" | "warn" | "crit" | "accent";
const STAT_ACCENT_CLS: Record<StatAccent, string> = {
  none: "text-ink",
  good: "text-good",
  warn: "text-warn",
  crit: "text-crit",
  accent: "text-accent",
};

export function StatTile({
  label,
  value,
  sub,
  accent = "none",
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: StatAccent;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-panel p-4 shadow-[var(--shadow-card)] ${className}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${STAT_ACCENT_CLS[accent]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted/80">{sub}</div>}
    </div>
  );
}

// A stat tile specifically for a money/⭐ figure — always green, per the house rule.
export function MoneyStat({ label, value, sub, className = "" }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return <StatTile label={label} value={value} sub={sub} accent="good" className={className} />;
}

// ── Badge ──────────────────────────────────────────────────────────────────
type BadgeTone = "neutral" | "good" | "warn" | "crit" | "accent" | "info";
const BADGE_TONE_CLS: Record<BadgeTone, string> = {
  neutral: "bg-muted/10 text-muted",
  good: "bg-good/15 text-good",
  warn: "bg-warn/15 text-warn",
  crit: "bg-crit/15 text-crit",
  accent: "bg-accent/15 text-accent",
  info: "bg-info/15 text-info",
};

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_TONE_CLS[tone]} ${className}`}>{children}</span>;
}

// Small "newer / less-proven in production" marker — attach next to a feature's
// label or section title. Deliberately subtle (a pill, not a banner).
export function BetaBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Newer feature. Behavior in live production is still being verified"
      className={`inline-flex items-center rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info ${className}`}
    >
      Beta
    </span>
  );
}

// ── Button ─────────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "good";
const BUTTON_VARIANT_CLS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink shadow-[var(--glow-accent)] hover:bg-accent-deep",
  secondary: "border border-line bg-panel text-ink hover:bg-muted/10",
  ghost: "text-muted hover:bg-muted/10 hover:text-ink",
  danger: "border border-crit/30 text-crit hover:bg-crit/10",
  good: "bg-good text-white hover:brightness-90",
};

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANT_CLS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon = "📊", title, hint }: { icon?: string; title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center text-center text-muted">
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 text-sm">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-xs text-muted/80">{hint}</div>}
    </div>
  );
}
