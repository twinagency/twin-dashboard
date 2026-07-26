"use client";

import { useState } from "react";
import type { Clone, SocialRow } from "@/lib/types";
import { Collapse, Section, Field, inputCls, selectCls } from "./fields";
import { VIBE_PRESETS } from "@/lib/vibes";

// ── Structured persona facts (migration 033) ─────────────────────────────────
// The typed widgets that replaced the retired free-text intake questions. Every
// value here is injected into her prompt DETERMINISTICALLY in code (never via
// the AI compiler), so facts can't drift, get dropped, or go stale.
// Submits into the same clone form: plain inputs by column name + hidden JSON
// inputs for the list fields, gated by the `persona_facts` marker (actions.ts).

const GENDER_OPTIONS = ["female", "male", "trans woman", "non-binary"];
const SEXUALITY_OPTIONS = ["straight", "bisexual", "bicurious", "lesbian", "pansexual"];

export const HARD_LIMIT_OPTIONS: string[] = [
  "anal",
  "feet",
  "degrading him",
  "being degraded",
  "dom/sub play",
  "roleplay scenarios",
  "rough / choking talk",
  "group / threesome talk",
  "watersports",
  "cheating / cuckold talk",
];

const SOCIAL_PLATFORMS = ["instagram", "tiktok", "x/twitter", "onlyfans", "snapchat", "youtube", "other"];

function splitLegacyList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Chip list (hidden JSON input, Enter/comma to add) ─────────────────────────
function ChipList({
  label,
  name,
  initial,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  initial: string[];
  placeholder?: string;
  hint?: string;
}) {
  const [chips, setChips] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  const add = () => {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setChips((prev) => [...prev, ...parts.filter((p) => !prev.includes(p))]);
    setDraft("");
  };

  return (
    <div className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input type="hidden" name={name} value={JSON.stringify(chips)} />
      <div className={inputCls + " flex flex-wrap items-center gap-1.5"}>
        {chips.map((c) => (
          <span key={c} className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
            {c}
            <button
              type="button"
              aria-label={`remove ${c}`}
              onClick={() => setChips((prev) => prev.filter((x) => x !== c))}
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
          onBlur={add}
          placeholder={chips.length ? "" : placeholder}
          className="min-w-24 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/60"
        />
      </div>
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

// ── Socials editor (platform + handle + followers rows, hidden JSON) ──────────
function SocialsEditor({ initial }: { initial: SocialRow[] }) {
  const [rows, setRows] = useState<SocialRow[]>(initial);
  const set = (i: number, patch: Partial<SocialRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-2">
      <input type="hidden" name="socials" value={JSON.stringify(rows.filter((r) => r.handle.trim()))} />
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={r.platform}
            onChange={(e) => set(i, { platform: e.target.value })}
            className={selectCls + " max-w-36"}
          >
            {SOCIAL_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {!SOCIAL_PLATFORMS.includes(r.platform) && r.platform && <option value={r.platform}>{r.platform}</option>}
          </select>
          <input
            value={r.handle}
            onChange={(e) => set(i, { handle: e.target.value })}
            placeholder="@handle"
            className={inputCls}
          />
          <input
            value={r.followers ?? ""}
            onChange={(e) => set(i, { followers: e.target.value })}
            placeholder="followers (2M)"
            className={inputCls + " max-w-32"}
          />
          <button
            type="button"
            aria-label="remove row"
            onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
            className="shrink-0 text-muted transition hover:text-crit"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { platform: "instagram", handle: "", followers: "" }])}
        className="justify-self-start rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:text-ink"
      >
        + Add social
      </button>
    </div>
  );
}

// ── Hard-limits checklist ──────────────────────────────────────────────────────
function HardLimits({ initial, extraInitial }: { initial: string[]; extraInitial: string }) {
  const [checked, setChecked] = useState<string[]>(initial);
  const toggle = (v: string) =>
    setChecked((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  // Legacy/free values that aren't in the fixed list still round-trip as chips.
  const custom = checked.filter((c) => !HARD_LIMIT_OPTIONS.includes(c));
  const summary =
    checked.length === 0 ? "none set" : checked.length <= 3 ? checked.join(", ") : `${checked.length} set`;

  return (
    <Collapse emoji="⛔" label="Hard limits" summary={summary}>
    <div className="grid gap-2">
      <input type="hidden" name="hard_limits" value={JSON.stringify(checked)} />
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {HARD_LIMIT_OPTIONS.map((o) => {
          const on = checked.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o)}
              className={
                "rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition " +
                (on ? "border-crit/50 bg-crit/10 text-crit" : "border-line bg-bg/40 text-muted hover:text-ink")
              }
            >
              {on ? "⛔ " : ""}
              {o}
            </button>
          );
        })}
      </div>
      {custom.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {custom.map((c) => (
            <span key={c} className="flex items-center gap-1 rounded-full bg-crit/10 px-2 py-0.5 text-xs text-crit">
              {c}
              <button type="button" onClick={() => toggle(c)} className="text-crit/70 hover:text-crit">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <Field
        label="Other limits"
        name="hard_limits_extra"
        defaultValue={extraInitial}
        placeholder="topics, words, or acts she will never do"
      />
    </div>
    </Collapse>
  );
}

// ── The whole facts panel ─────────────────────────────────────────────────────
export default function PersonaFactsFields({
  clone,
  legacyFields,
  part = "all",
}: {
  clone?: Partial<Clone> | null;
  legacyFields?: Record<string, string> | null;
  // Split so the Identity tab can compose two balanced columns by hand:
  //   "who"    = the Who-she-is fact grid
  //   "socials"= the Socials editor
  //   "vibe"   = Vibe & nicknames
  //   "limits" = the hard-limits collapse
  part?: "who" | "socials" | "vibe" | "limits" | "all";
}) {
  const legacy = legacyFields ?? {};
  // Legacy intake values backfill the widgets when the columns are still empty,
  // so an old clone's facts migrate on its next Save.
  const vibeInitial =
    clone?.vibe_preset ?? (legacy.vibe === "your-own" ? "custom" : legacy.vibe) ?? "";
  const nicknamesInitial = clone?.fan_nicknames?.length ? clone.fan_nicknames : splitLegacyList(legacy.nicknames);
  const turnOnsInitial = clone?.turn_ons?.length ? clone.turn_ons : splitLegacyList(legacy.turn_ons);
  const turnOffsInitial = clone?.turn_offs?.length ? clone.turn_offs : splitLegacyList(legacy.turn_offs);
  const hardLimitsExtraInitial = clone?.hard_limits_extra ?? legacy.hard_limits ?? "";

  const showWho = part === "who" || part === "all";
  const showSocials = part === "socials" || part === "all";
  const showVibe = part === "vibe" || part === "all";
  const showLimits = part === "limits" || part === "all";

  return (
    <>
      {/* Marker: tells the save action the typed widgets were on this form.
          Only the facts pass renders it, so it is never duplicated. */}
      {showWho && <input type="hidden" name="persona_facts" value="1" />}
      {showWho && (
      <>

      <Section
        title="Who she is"
        icon="🪪"
        accent="cyan"
        hint="Typed facts, injected into her prompt exactly as written (never through the AI), so they can't drift or go stale."
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {/* Name lives here rather than in its own card - one input never
              justified a whole section at the top of the tab. */}
          <Field label="Display name" name="name" defaultValue={clone?.name ?? ""} required placeholder="e.g. Sophie" />
          <Field
            label="Birthday"
            name="date_of_birth"
            type="date"
            defaultValue={clone?.date_of_birth ?? ""}
            hint="Her age is derived live, plus birthday awareness"
          />
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Gender</span>
            <select name="gender" defaultValue={clone?.gender ?? "female"} className={selectCls}>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <Field label="Height" name="height" defaultValue={clone?.height ?? ""} placeholder="5'7 (170cm)" />
          <Field label="Ethnicity" name="ethnicity" defaultValue={clone?.ethnicity ?? ""} placeholder="half Italian" />
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Sexuality</span>
            <select name="sexuality" defaultValue={clone?.sexuality ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {SEXUALITY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Job"
            name="occupation"
            defaultValue={clone?.occupation ?? legacy.occupation ?? ""}
            placeholder="model / influencer / student"
          />
          <Field label="Hometown" name="hometown" defaultValue={clone?.hometown ?? ""} placeholder="Melbourne" />
          <Field
            label="Current city"
            name="current_city"
            defaultValue={clone?.current_city ?? ""}
            placeholder="Miami"
            hint="Cross-check her Timezone in Config matches this city, or she talks the wrong time of day"
          />
        </div>
      </Section>
      </>
      )}
      {showSocials && (
      <Section
        title="Socials"
        icon="📱"
        accent="purple"
        hint="Injected word for word: platform, handle, follower count. She'll share these if asked but keeps him chatting here."
      >
        <SocialsEditor initial={clone?.socials?.length ? clone.socials : []} />
      </Section>
      )}

      {showVibe && (

      <Section
        title="Vibe & nicknames"
        icon="✨"
        accent="pink"
        hint="The preset ships a ready-made personality baseline the AI builds on. Nicknames go straight into her prompt, no compile."
      >
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Vibe / archetype</span>
          <select name="vibe_preset" defaultValue={vibeInitial} className={selectCls}>
            <option value="">Pick one…</option>
            {VIBE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}: {p.blurb}
              </option>
            ))}
          </select>
        </label>
        <ChipList
          label="Pet names"
          name="fan_nicknames"
          initial={nicknamesInitial}
          placeholder="babe, baby (Enter to add)"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <ChipList
            label="Turn-ons"
            name="turn_ons"
            initial={turnOnsInitial}
            placeholder="confidence, banter (Enter to add)"
          />
          <ChipList
            label="Turn-offs"
            name="turn_offs"
            initial={turnOffsInitial}
            placeholder="clinginess, bragging (Enter to add)"
          />
        </div>
      </Section>
      )}

      {showLimits && (
        <HardLimits initial={clone?.hard_limits ?? []} extraInitial={hardLimitsExtraInitial} />
      )}
    </>
  );
}
