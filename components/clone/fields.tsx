"use client";

import { useEffect, useState } from "react";

// ── Shared styling tokens ─────────────────────────────────────────────────────
// One source of truth for input/select look, so Configure + Create match exactly
// and light/dark both stay consistent.
// Deliberately compact: Configure is a dense control panel, not a signup form.
// Each tab should fit one screen, so inputs stay short and tight.
//
// GREY RULE (2026-07-29). Three things used to render three different greys by
// accident: the label (text-muted), the ⓘ hint (text-muted/80) and the
// placeholder — which had NO class here at all, so it fell through to the
// browser default (~54% opacity of text-ink, much lighter than either). The
// explicit `placeholder:text-muted` below makes the placeholder deliberately
// the SAME grey as the label, and a real typed/saved value stays `text-ink`
// (solid). Never drop that placeholder class: without it a field's placeholder
// and its saved value stop being clearly distinguishable.
export const inputCls =
  "min-h-9 min-w-0 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

export const selectCls = inputCls;

// ── Card / section shell ──────────────────────────────────────────────────────
// Sections get a visual identity: an emoji `icon` chip + an `accent` color used
// on the left border and chip background, so each card is recognizable at a
// glance. Defaults keep untouched call sites rendering exactly as before.
export type SectionAccent =
  | "blue"
  | "green"
  | "pink"
  | "purple"
  | "amber"
  | "red"
  | "cyan"
  | "neutral";
const SECTION_ACCENTS: Record<SectionAccent, { bar: string; chip: string }> = {
  blue: { bar: "border-l-accent/70", chip: "bg-accent/15" },
  green: { bar: "border-l-good/70", chip: "bg-good/15" },
  pink: { bar: "border-l-pink-500/70", chip: "bg-pink-500/15" },
  purple: { bar: "border-l-purple-500/70", chip: "bg-purple-500/15" },
  amber: { bar: "border-l-warn/70", chip: "bg-warn/15" },
  red: { bar: "border-l-crit/70", chip: "bg-crit/15" },
  cyan: { bar: "border-l-cyan-400/70", chip: "bg-cyan-400/15" },
  neutral: { bar: "border-l-line", chip: "bg-muted/15" },
};

export function Section({
  title,
  hint,
  tip,
  icon,
  accent = "neutral",
  children,
  className = "",
  cols = 1,
}: {
  title?: React.ReactNode;
  hint?: string;
  // Longer explainer moved out of the visible hint; shows on hover of the header.
  tip?: string;
  // Emoji rendered in a small colored chip next to the title.
  icon?: string;
  accent?: SectionAccent;
  children: React.ReactNode;
  // e.g. "xl:col-span-2" — lets wide sections span both columns of the
  // condensed 2-col Configure layout.
  className?: string;
  // How many columns the card's own fields flow into. Short controls (a name,
  // a number, a select) waste a whole row each at cols=1, which is what made
  // every tab scroll — set 2/3 so they sit side by side.
  cols?: 1 | 2 | 3;
}) {
  const a = SECTION_ACCENTS[accent];
  const colCls = cols === 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : "";
  // Hint + tip both live in the header tooltip now — the visible explanatory
  // sentence was costing a line on every card. The ⓘ marks that there's more.
  const tipText = [hint, tip].filter(Boolean).join(" - ");
  return (
    <section
      className={`flex h-full min-w-0 flex-col rounded-2xl border border-line border-l-[3px] ${a.bar} bg-panel p-4 text-ink shadow-[0_8px_28px_rgb(16_24_40/0.05)] ` + className}
    >
      {title && (
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink">
          {icon && (
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] ${a.chip}`}>
              {icon}
            </span>
          )}
          {title}
          {tipText && <Info text={tipText} />}
        </h3>
      )}
      <div className={`grid min-w-0 grid-cols-1 items-start gap-3 ${colCls}` + (title ? " mt-3" : "")}>{children}</div>
    </section>
  );
}

// ── Sub-heading inside a Section card (small emoji + label divider) ───────────
export function SubHead({
  emoji,
  label,
  tip,
  children,
}: {
  emoji: string;
  label: string;
  tip?: string;
  children?: React.ReactNode;
}) {
  // `tip` renders through Info (a real styled hover bubble). It used to be the
  // native `title` attribute plus a decorative ⓘ glyph that did nothing on its
  // own: native tooltips take ~1s, can't be styled, and never appear on touch.
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
      <span>{emoji}</span>
      {label}
      {tip && <Info text={tip} />}
      {children}
    </p>
  );
}

// A group heading that separates the form into scannable bands. Hint becomes
// a hoverable ⓘ next to the label, same convention as Section/FieldLabel —
// it used to render as a permanent grey sentence under the label, which is
// exactly the "wall of small print" that convention was introduced to kill.
export function GroupHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1 mt-2 flex items-center gap-1.5 first:mt-0">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</h2>
      {hint && <Info text={hint} />}
    </div>
  );
}

// ── Titled block ──────────────────────────────────────────────────────────────
// Was a click-to-expand card. The operator wants every setting in the edit
// section visible at once rather than hidden behind 22 separate "Edit ▼"
// buttons, so this now renders a plain titled card with its children always on
// screen.
//
// The props that drove the closed state (defaultOpen, summary, filled) are
// still accepted and ignored, so all existing call sites keep compiling and
// nothing needs a sweep. Drop them from the call sites if this sticks.
export function Collapse({
  label,
  hint,
  summary,
  emoji,
  accent = "neutral",
  filled,
  defaultOpen = false,
  className = "",
  children,
}: {
  label: React.ReactNode;
  // Longer explainer, shown as a hoverable ⓘ next to the title (same
  // convention as Section/FieldLabel — never a grey paragraph).
  hint?: string;
  summary?: string;
  emoji?: string;
  accent?: SectionAccent;
  // Shows a small filled/empty dot next to the title so a wall of collapsed
  // cards can be scanned at a glance for which ones have data.
  filled?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const a = SECTION_ACCENTS[accent];
  return (
    <div className={`h-full rounded-xl border border-line border-l-[3px] ${a.bar} bg-panel ` + className}>
      <div className="flex w-full items-center gap-2 px-3 py-3 text-left">
        {emoji && (
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] ${a.chip}`}>
            {emoji}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink">
          {label}
          {hint && <Info text={hint} />}
        </span>
      </div>
      <div className="border-t border-line p-3">{children}</div>
    </div>
  );
}

// ── Modal overlay ─────────────────────────────────────────────────────────────
// For big editors that shouldn't cost permanent page height (the onboarding
// questionnaire). Same rule as Collapse: children stay mounted when closed, so
// the form still submits every field whether or not the overlay is open.
export function Modal({
  open,
  onClose,
  title,
  hint,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  // Escape closes; body scroll locks while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <div className={open ? "fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8" : "hidden"}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {/* Hint is an ⓘ hover next to the title, never a grey sentence
                under it, matching Section/Collapse/FieldLabel. */}
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              {title}
              {hint && <Info text={hint} />}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto shrink-0 rounded-md border border-line px-2 py-1 text-xs text-muted transition hover:text-ink"
          >
            Done
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// A soft inner card, for nested blocks inside a Section.
export function SubCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={"rounded-lg border border-line bg-bg/60 p-3 " + className}>
      {children}
    </div>
  );
}

// ── Info tooltip ──────────────────────────────────────────────────────────────
// A real hover bubble, not the native `title` attribute — native tooltips take
// ~1s to appear, can't be styled, and simply never show on touch devices, which
// made the ⓘ look broken.
export function Info({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={"group/info relative inline-flex shrink-0 " + className}>
      <span className="cursor-help text-[10px] leading-none text-muted/80 transition group-hover/info:text-accent">
        ⓘ
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden w-64 max-w-[70vw] -translate-x-1/2 rounded-lg border border-line bg-panel p-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-ink shadow-xl group-hover/info:block"
      >
        {text}
      </span>
    </span>
  );
}

// ── Warning banner ────────────────────────────────────────────────────────────
// A caution at the head of a group of settings that can cost money or loosen a
// brake. Deliberately ONE visible sentence plus an ⓘ for the detail: a full
// grey paragraph is the exact pattern the rest of this file exists to avoid, so
// this is not a licence to reintroduce one under a yellow border.
export function Warning({
  text,
  detail,
  className = "",
}: {
  text: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={
        "flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] leading-relaxed text-ink " +
        className
      }
    >
      <span aria-hidden className="mt-px shrink-0 text-warn">
        ⚠
      </span>
      <span className="min-w-0">
        {text}
        {detail && <Info text={detail} className="ml-1 align-middle" />}
      </span>
    </div>
  );
}

// ── Field label ───────────────────────────────────────────────────────────────
// One label row for every control. A `hint` becomes a hoverable ⓘ rather than a
// grey sentence under the input — those explanation lines were costing a line
// per field and turned every card into a wall of small print.
export function FieldLabel({
  label,
  hint,
  required,
}: {
  label: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <span className="mb-0.5 flex items-center gap-1 text-xs text-muted">
      <span>{label}</span>
      {required && <span className="text-accent">*</span>}
      {hint && <Info text={hint} />}
    </span>
  );
}

// ── Text / number field (uncontrolled — submits via name) ─────────────────────
export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  required,
  hint,
  secret,
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  // Blurs the value at rest (bot tokens, voice IDs, anything shoulder-surf
  // sensitive) — sharpens only while actually focused/editing. The real
  // value stays in the input the whole time (defaultValue/form submit are
  // unaffected), this is a visual mask only, not access control.
  secret?: boolean;
  // HTML5 bounds for type="number" fields (e.g. a cooldown can't go negative).
  // Browser-level guardrail only — the real clamp always happens server-side
  // too (rowFromForm), since a client control is never the source of truth.
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block min-w-0">
      <FieldLabel label={label} hint={hint} required={required} />
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        min={type === "number" ? min : undefined}
        max={type === "number" ? max : undefined}
        step={type === "number" ? step : undefined}
        className={inputCls + (secret ? " blur-[3px] transition-[filter] duration-150 focus:blur-none" : "")}
      />
    </label>
  );
}

export function Area({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 2,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block min-w-0">
      <FieldLabel label={label} hint={hint} />
      <textarea
        name={name}
        rows={rows}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        className={inputCls}
      />
    </label>
  );
}

// ── Line list ─────────────────────────────────────────────────────────────────
// One entry per row, for content that is a LIST of sentence-length items rather
// than a paragraph: her example texts, her running bits, her backstory beats.
// TagInput can't hold these because it splits on commas, and a plain textarea
// turns them into one blob nobody can edit a single line of.
//
// Submits the entries newline-joined under `name`, which is exactly the shape
// lib/persona-build.ts listEntries() reads back. Storage is unchanged, so prose
// written before the list editors existed still loads, one entry per line.
export function LineList({
  label,
  name,
  initial,
  placeholder,
  hint,
  rows = 2,
}: {
  label: string;
  name: string;
  initial: string[];
  placeholder?: string;
  hint?: string;
  rows?: number;
}) {
  const [entries, setEntries] = useState<string[]>(initial.length ? initial : [""]);

  const update = (i: number, v: string) =>
    setEntries((prev) => prev.map((e, n) => (n === i ? v : e)));
  const remove = (i: number) =>
    setEntries((prev) => (prev.length === 1 ? [""] : prev.filter((_, n) => n !== i)));

  return (
    <div className="block">
      <FieldLabel label={label} hint={hint} />
      <input type="hidden" name={name} value={entries.map((e) => e.trim()).filter(Boolean).join("\n")} />
      <div className="grid gap-1.5">
        {entries.map((e, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <textarea
              rows={rows}
              value={e}
              placeholder={placeholder}
              onChange={(ev) => update(i, ev.target.value)}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove this entry"
              className="mt-1 shrink-0 rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-ink"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setEntries((prev) => [...prev, ""])}
        className="mt-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-ink"
      >
        + Add another
      </button>
    </div>
  );
}

// ── Controlled select ─────────────────────────────────────────────────────────
export function Select<T extends string>({
  label,
  name,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
}) {
  return (
    <label className="block">
      <FieldLabel label={label} hint={hint} />
      <select name={name} value={value} onChange={(e) => onChange(e.target.value as T)} className={selectCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── Tag input (open-ended list, Enter/comma to add a removable chip) ──────────
// For fields where the real-world values can't be fully enumerated (tattoo
// spots, content categories a creator invents, nicknames...). Submits as a
// JSON array in a hidden input, same wire format as the old per-file ChipList.
// `suggestions` optionally renders common values as one-click "+ add" chips
// underneath, so an enumerable common set stays discoverable without forcing
// every value through a fixed grid.
export function TagInput({
  label,
  name,
  initial,
  placeholder,
  hint,
  suggestions,
}: {
  label?: string;
  name: string;
  initial: string[];
  placeholder?: string;
  hint?: string;
  suggestions?: string[];
}) {
  const [chips, setChips] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  const add = (raw?: string) => {
    const parts = (raw ?? draft)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setChips((prev) => [...prev, ...parts.filter((p) => !prev.includes(p))]);
    if (raw === undefined) setDraft("");
  };
  const remove = (c: string) => setChips((prev) => prev.filter((x) => x !== c));
  const remaining = (suggestions ?? []).filter((s) => !chips.includes(s));

  return (
    <div className="block">
      {label && <FieldLabel label={label} hint={hint} />}
      <input type="hidden" name={name} value={JSON.stringify(chips)} />
      <div className={inputCls + " flex flex-wrap items-center gap-1.5"}>
        {chips.map((c) => (
          <span key={c} className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
            {c}
            <button
              type="button"
              aria-label={`remove ${c}`}
              onClick={() => remove(c)}
              className="text-accent/70 transition hover:text-accent"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && draft === "" && chips.length) {
              setChips((prev) => prev.slice(0, -1));
            }
          }}
          onBlur={() => add()}
          placeholder={chips.length ? "" : placeholder}
          className="min-w-24 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
      </div>
      {remaining.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted transition hover:border-accent/50 hover:text-accent"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Collapsed multi-select (fixed option set, pick several) ───────────────────
// Closed shut behind a one-line summary ("English, Spanish +1") so a 10-22
// option set doesn't cost a permanent grid's worth of height. Expands to a
// toggle grid on click; legacy/custom values not in `options` still round-trip
// as removable chips underneath, same as the old always-open ToggleChipGrid.
export function MultiSelect({
  label,
  name,
  options,
  initial,
  hint,
  cols = 3,
}: {
  label?: string;
  name: string;
  options: string[];
  initial: string[];
  hint?: string;
  cols?: 2 | 3 | 4;
}) {
  const [checked, setChecked] = useState<string[]>(initial);
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    setChecked((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  const custom = checked.filter((c) => !options.includes(c));
  const summary =
    checked.length === 0
      ? "none set"
      : checked.length <= 2
        ? checked.join(", ")
        : `${checked.slice(0, 2).join(", ")} +${checked.length - 2}`;
  const gridCls = cols === 4 ? "sm:grid-cols-4" : cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";

  return (
    <div className="block">
      {label && <FieldLabel label={label} hint={hint} />}
      <input type="hidden" name={name} value={JSON.stringify(checked)} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={inputCls + " flex items-center justify-between gap-2 text-left"}
      >
        <span className={"min-w-0 flex-1 truncate " + (checked.length ? "text-ink" : "text-muted")} title={summary}>{summary}</span>
        <span className="shrink-0 text-[11px] text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-1.5 grid gap-1.5 rounded-lg border border-line bg-bg/40 p-2">
          <div className={`grid grid-cols-2 gap-1.5 ${gridCls}`}>
            {options.map((o) => {
              const on = checked.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(o)}
                  className={
                    "rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition " +
                    (on ? "border-accent/50 bg-accent/10 text-accent" : "border-line bg-bg/40 text-muted hover:text-ink")
                  }
                >
                  {o}
                </button>
              );
            })}
          </div>
          {custom.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line pt-1.5">
              {custom.map((c) => (
                <span key={c} className="flex items-center gap-1 rounded-full bg-muted/15 px-2 py-0.5 text-xs text-ink">
                  {c}
                  <button type="button" onClick={() => toggle(c)} className="text-muted/70 hover:text-ink">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Segmented pill control (one-line replacement for a 3-option Select) ───────
// Identical submit semantics to Select: one hidden input carrying name + value.
// `title` on each option holds the longer description (hover tooltip).
export type SegAccent = "accent" | "pink" | "red" | "green" | "amber" | "purple";
const SEG_ACTIVE: Record<SegAccent, string> = {
  accent: "bg-accent/20 text-accent",
  pink: "bg-pink-500/20 text-pink-400",
  red: "bg-crit/20 text-crit",
  green: "bg-good/20 text-good",
  amber: "bg-warn/20 text-warn",
  purple: "bg-purple-500/20 text-purple-400",
};
export function Segmented<T extends string>({
  label,
  name,
  value,
  onChange,
  options,
  hint,
  accent = "accent",
  warning,
}: {
  label: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
  hint?: string;
  accent?: SegAccent;
  // Optional inline conflict warning, rendered under the control. Pass the
  // result of useDialConflict(...) through <Warning /> — see that hook below.
  warning?: React.ReactNode;
}) {
  return (
    <div className="block">
      <FieldLabel label={label} hint={hint} />
      <input type="hidden" name={name} value={value} />
      <div className="clone-segmented flex gap-1 overflow-x-auto rounded-xl border border-line bg-bg/60 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={
              "min-w-max flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition " +
              (value === o.value ? SEG_ACTIVE[accent] : "text-muted hover:text-ink")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
      {warning && <div className="mt-1.5">{warning}</div>}
    </div>
  );
}

// ── Dial-conflict warning hook ────────────────────────────────────────────────
// One place to express "these two live field values fight each other," instead
// of a static banner that's true regardless of what's actually saved. `checks`
// is evaluated top to bottom; the first match wins, so order real hazards
// before softer ones. Returns null when nothing matches, so a call site can do
// `{conflict && <Warning {...conflict} />}` right next to the control it's
// about. Generic over the config shape so this file doesn't need to import
// CloneConfigState from useCloneConfig.ts.
export type DialConflictCheck<C> = {
  when: (cfg: C) => boolean;
  text: string;
  detail?: string;
};
export function useDialConflict<C>(cfg: C, checks: DialConflictCheck<C>[]): { text: string; detail?: string } | null {
  for (const c of checks) {
    if (c.when(cfg)) return { text: c.text, detail: c.detail };
  }
  return null;
}

// ── Mini toggle card (emoji + short label + switch, for toggle grids) ─────────
// Same submit semantics as Toggle: hidden input carrying "true"/"false".
export function ToggleCard({
  emoji,
  label,
  name,
  checked,
  onChange,
  badge,
  title,
}: {
  emoji: string;
  label: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  badge?: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="grid">
      <input type="hidden" name={name} value={String(checked)} />
      <button
        type="button"
        aria-label={title ? `${label}. ${title}` : label}
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={
          "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition " +
          (checked
            ? "border-accent/40 bg-accent/10"
            : "border-line bg-bg/40 opacity-75 hover:opacity-100")
        }
      >
        {/* `title` renders as a real ⓘ hover bubble, not the native title
            attribute (~1s delay, unstyleable, invisible on touch). */}
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium text-ink">
          <span className="text-sm">{emoji}</span>
          <span>{label}</span>
          {title && <Info text={title} />}
          {badge}
        </span>
        <span
          className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-accent" : "bg-muted/30"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
          />
        </span>
      </button>
    </div>
  );
}

// ── Range slider (submits a hidden input so it works in a plain form) ─────────
export function Slider({
  label,
  name,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format,
  hint,
  warning,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  // Longer explainer, shown as a hoverable ⓘ next to the label. Sliders used to
  // be the one control with no hint slot, which is why their explanations were
  // still being written as grey paragraphs underneath them.
  hint?: string;
  // Optional inline conflict warning, rendered under the control. Same
  // convention as Segmented's `warning` prop — pass the result of
  // useDialConflict(...) through <Warning /> at the call site.
  warning?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1">
          {label}
          {hint && <Info text={hint} />}
        </span>
        <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-sm font-bold tabular-nums text-accent">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </span>
      <input type="hidden" name={name} value={value} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
      {warning && <div className="mt-1.5">{warning}</div>}
    </label>
  );
}

// ── Toggle (submits "true"/"false" via hidden input) ──────────────────────────
// default: green on / red off (used for status).  soft: emerald on / grey off.
export function Toggle({
  label,
  name,
  checked,
  onChange,
  accent = "default",
  hint,
}: {
  label: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  accent?: "default" | "soft";
  hint?: string;
}) {
  const trackColor = checked
    ? accent === "soft"
      ? "bg-accent"
      : "bg-good"
    : accent === "soft"
      ? "bg-muted/30"
      : "bg-crit";
  return (
    <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm">
      <input type="hidden" name={name} value={String(checked)} />
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${trackColor}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </button>
      <span className="text-ink">{label}</span>
      {hint && <Info text={hint} />}
    </label>
  );
}

// ── Collapsible "Advanced" wrapper ────────────────────────────────────────────
export function Advanced({ children, defaultOpen = false }: { children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="grid gap-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted transition hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-90" : "")}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        Advanced
        <span className="font-normal normal-case tracking-normal text-muted">
          {open ? "" : "· models, memory, timing, voice tuning"}
        </span>
      </button>
      {/* Keep children mounted (just hidden) so their form fields always submit - 
          collapsing must never drop a saved value on Save. */}
      <div className={open ? "grid gap-6" : "hidden"}>{children}</div>
    </div>
  );
}

// ── Prompt textarea — locked by default, hover to reveal Edit ─────────────────
export function PromptField({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="group relative block">
      <FieldLabel label={label} />
      {/* The locked state is still a REAL SAVED VALUE (the compiled prompt), so
          it renders text-ink solid. Only the greyed border/background says
          "read-only" — greying the text itself made saved content look unset.
          The placeholder (empty prompt) is the only grey text here. */}
      <textarea
        name={name}
        rows={6}
        defaultValue={defaultValue}
        readOnly={!editing}
        placeholder="(empty, hit Re-compile to generate)"
        className={
          "w-full rounded-xl border px-3 py-2.5 font-mono text-xs leading-relaxed text-ink placeholder:text-muted outline-none transition " +
          (editing
            ? "border-accent bg-panel focus:ring-2 focus:ring-accent/20"
            : "cursor-not-allowed border-line bg-bg")
        }
      />
      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute right-2 top-7 flex items-center gap-1 rounded-md border border-line bg-panel/90 px-2 py-1 text-xs font-medium text-ink opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-bg"
        >
          Edit
        </button>
      ) : (
        <span className="absolute right-2 top-7 rounded-md bg-warn/15 px-2 py-1 text-xs font-medium text-warn">
          Editing
        </span>
      )}
    </div>
  );
}

// ── ElevenLabs model options ──────────────────────────────────────────────────
// A genuinely closed set (ElevenLabs ships a fixed handful of TTS models), so
// this is a dropdown rather than a free-text field an operator has to
// remember the exact id for.
export const ELEVEN_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "eleven_multilingual_v2", label: "Multilingual v2 (best quality, default)" },
  { value: "eleven_turbo_v2_5", label: "Turbo v2.5 (faster, cheaper)" },
  { value: "eleven_turbo_v2", label: "Turbo v2 (English only)" },
  { value: "eleven_flash_v2_5", label: "Flash v2.5 (fastest, lowest latency)" },
  { value: "eleven_flash_v2", label: "Flash v2 (English only)" },
  { value: "eleven_monolingual_v1", label: "Monolingual v1 (legacy, English only)" },
];

// ── Timezone options ──────────────────────────────────────────────────────────
// Curated common IANA zones (value is the real IANA id the runtime feeds to Intl).
// Not exhaustive by design — covers the zones an operator is realistically in.
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "UTC", label: "UTC (default)" },
  { value: "America/Los_Angeles", label: "US Pacific (Los Angeles)" },
  { value: "America/Denver", label: "US Mountain (Denver)" },
  { value: "America/Chicago", label: "US Central (Chicago)" },
  { value: "America/New_York", label: "US Eastern (New York)" },
  { value: "America/Sao_Paulo", label: "Brazil (São Paulo)" },
  { value: "Europe/London", label: "UK (London)" },
  { value: "Europe/Paris", label: "Central Europe (Paris/Berlin)" },
  { value: "Europe/Athens", label: "Eastern Europe (Athens)" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Asia/Dubai", label: "Gulf (Dubai)" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Bangkok", label: "Southeast Asia (Bangkok)" },
  { value: "Asia/Manila", label: "Philippines (Manila)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Japan (Tokyo)" },
  { value: "Australia/Sydney", label: "Australia East (Sydney)" },
  { value: "Pacific/Auckland", label: "New Zealand (Auckland)" },
];

// ── Onboarding detail-collection options ──────────────────────────────────────
// The details an operator can ask her to naturally collect from a new fan. `value`
// is the stable key stored in clones.onboarding_collect_fields and mirrored by the
// runtime greeting/profile nudges (src/flows/human.ts COLLECT_FIELD_PHRASE).
export const COLLECT_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "name", label: "His name" },
  { value: "age", label: "His age" },
  { value: "country", label: "Country" },
  { value: "city", label: "City" },
  { value: "timezone", label: "Timezone / hours around" },
  { value: "job", label: "Job / work" },
  { value: "relationship_status", label: "Relationship status" },
  { value: "interests", label: "Hobbies & interests" },
  { value: "likes", label: "What he likes in a girl" },
  { value: "birthday", label: "Birthday" },
  { value: "language", label: "Language" },
  { value: "how_found", label: "How he found her" },
];

// ── Language-lock options ─────────────────────────────────────────────────────
// The languages an operator can force a clone into (stored in clones.languages,
// enforced by src/services/language.ts — keep this list in sync with the
// LANGUAGE_OPTIONS there). Latin-script languages first (the common case), then
// the non-Latin ones. `foreign` flags a non-Latin script for the small caption.
export const LANGUAGE_OPTIONS: { value: string; foreign?: boolean }[] = [
  { value: "English" },
  { value: "Spanish" },
  { value: "French" },
  { value: "German" },
  { value: "Portuguese" },
  { value: "Italian" },
  { value: "Dutch" },
  { value: "Polish" },
  { value: "Turkish" },
  { value: "Indonesian" },
  { value: "Vietnamese" },
  { value: "Tagalog" },
  { value: "Russian", foreign: true },
  { value: "Ukrainian", foreign: true },
  { value: "Greek", foreign: true },
  { value: "Arabic", foreign: true },
  { value: "Hebrew", foreign: true },
  { value: "Hindi", foreign: true },
  { value: "Thai", foreign: true },
  { value: "Chinese", foreign: true },
  { value: "Japanese", foreign: true },
  { value: "Korean", foreign: true },
];

// ── Shared constants ──────────────────────────────────────────────────────────
export const DEFAULT_PAYWALL_MESSAGE =
  "you're out of messages baby, grab some more to keep chatting with me 💕";
export const DEFAULT_PAYWALL_BUTTON = "Continue 💕";

export const DEFAULT_SPOIL_OPTIONS: { stars: number; label: string }[] = [
  { stars: 1000, label: "" },
  { stars: 2500, label: "" },
  { stars: 5000, label: "" },
  { stars: 10000, label: "" },
  { stars: 25000, label: "" },
  { stars: 50000, label: "" },
  { stars: 100000, label: "" },
];

export const MODEL_FIELDS: { name: string; label: string; def: string }[] = [
  { name: "text_model", label: "Text", def: "x-ai/grok-4.20" },
  { name: "voice_model", label: "Voice", def: "deepseek/deepseek-v4-pro" },
  { name: "media_model", label: "Media match", def: "mistralai/mistral-small-3.2-24b-instruct" },
  { name: "routing_model", label: "Routing / Smart decider", def: "qwen/qwen3-30b-a3b-instruct-2507" },
  { name: "voice_enhance_model", label: "Voice enhance", def: "google/gemini-2.5-flash-lite" },
  // Also fires when the fan sends a VIDEO (she reacts to a grabbed frame) —
  // there is no separate video model, this one covers both (see flows/vision.ts).
  { name: "photo_reply_model", label: "Photo & video reply", def: "qwen/qwen3-vl-32b-instruct" },
  { name: "vision_model", label: "Vision (media library tagging)", def: "qwen/qwen3-vl-32b-instruct" },
];

// ── Recommended models per job ────────────────────────────────────────────────
// Surfaced as a pinned group at the top of each model picker, with a tier badge
// + short note, so a non-technical operator can pick a good model at a glance.
export type RecTier = "best" | "value" | "cheap";
export type Rec = { id: string; tier: RecTier; note: string };
export const RECOMMENDED: Record<string, Rec[]> = {
  text_model: [
    { id: "x-ai/grok-4.20", tier: "best", note: "Filthy + reliable tool-calling" },
    { id: "deepseek/deepseek-v3.2", tier: "value", note: "~7x cheaper, still strong" },
    { id: "thedrummer/cydonia-24b-v4.1", tier: "cheap", note: "Cheapest uncensored writer" },
  ],
  routing_model: [
    { id: "qwen/qwen3-30b-a3b-instruct-2507", tier: "best", note: "10/10 tools, fastest" },
    { id: "qwen/qwen3-30b-a3b-instruct-2507", tier: "value", note: "Same pick, best value too" },
    { id: "google/gemini-2.5-flash-lite", tier: "cheap", note: "Cheapest solid decider" },
  ],
  vision_model: [
    { id: "qwen/qwen3-vl-32b-instruct", tier: "best", note: "Uncensored, half the price of 235b" },
    { id: "qwen/qwen3-vl-8b-instruct", tier: "value", note: "Cheaper, still uncensored" },
    { id: "mistralai/mistral-small-3.2-24b-instruct", tier: "cheap", note: "Cheapest that sees well" },
  ],
  photo_reply_model: [
    { id: "qwen/qwen3-vl-32b-instruct", tier: "best", note: "Uncensored, half the price of 235b" },
    { id: "qwen/qwen3-vl-8b-instruct", tier: "value", note: "Cheaper, still uncensored" },
    { id: "mistralai/mistral-small-3.2-24b-instruct", tier: "cheap", note: "Cheapest that sees well" },
  ],
  voice_model: [
    { id: "x-ai/grok-4.20", tier: "best", note: "Most natural spoken lines" },
    { id: "deepseek/deepseek-v3.2", tier: "value", note: "Much cheaper, still good" },
    { id: "deepseek/deepseek-v4-pro", tier: "cheap", note: "Cheap + capable" },
  ],
  voice_enhance_model: [
    { id: "google/gemini-2.5-flash-lite", tier: "best", note: "Only model that adds <break> tags" },
    { id: "inclusionai/ling-2.6-flash", tier: "cheap", note: "Cheapest that still helps" },
  ],
  media_model: [
    { id: "mistralai/mistral-small-3.2-24b-instruct", tier: "best", note: "5/5 match accuracy, fast" },
    { id: "qwen/qwen3-30b-a3b-instruct-2507", tier: "value", note: "Great value alternative" },
  ],
};

// Models known to underperform for a given job — flagged with a subtle warning
// chip so an operator who picked one sees there are better options.
export const WEAK: Record<string, { id: string; why: string }[]> = {
  voice_enhance_model: [{ id: "openai/gpt-4.1-nano", why: "No-op, doesn't add break tags" }],
};

// Tier → badge label + theme-aware Tailwind classes. Kept here so the picker and
// any future summary view render tiers identically.
export const REC_TIER_BADGE: Record<RecTier, { label: string; cls: string }> = {
  best: {
    label: "⭐ Best",
    cls: "bg-good/15 text-good",
  },
  value: {
    label: "💰 Value",
    cls: "bg-warn/15 text-warn",
  },
  cheap: {
    label: "🪙 Cheapest",
    cls: "bg-accent/15 text-accent",
  },
};
