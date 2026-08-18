// Pure helpers for the fan knowledge dossier rendered on /users.
//
// No React and no client hooks on purpose. The Fans page is a server
// component, and everything date shaped is parsed and sorted HERE, server
// side, then handed to the client dossier as plain data. Parsing a relative
// date ("next week") on both sides of hydration gives two different answers
// and React blames you for the mismatch, so the client never sees a clock.
//
// The other half of this file exists because the profile extractor writes raw
// model output: lowercase fragments, semicolon soup, ten hobbies in one cell.
// The operator reads this panel to remember a human being, so it gets split
// into rows and given capital letters before it reaches the screen.

// ── Capitalisation ────────────────────────────────────────────────────────────
// Deliberately additive: it raises the first letter of each sentence and never
// lowercases anything. Proper nouns the model already capitalised ("Sydney",
// "Formula 1") survive untouched, which a naive Title Case pass would wreck.
export function sentenceCase(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/^([a-z])/, (c) => c.toUpperCase())
    .replace(/([.!?]\s+)([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase());
}

// ── Splitting one cell into rows ──────────────────────────────────────────────
// Semicolons, pipes and newlines are always separators. Commas are only a
// separator for categories flagged list shaped, because "Sydney, Australia" is
// one location and "guitar, hiking, cooking" is three hobbies, and nothing in
// the string itself tells them apart. A comma directly before a bare year is
// stitched back on so "March 3, 2026" stays one item.
export function splitList(text: string, commaSplits: boolean): string[] {
  const raw = text.trim();
  if (!raw) return [];

  const parts = raw
    .split(commaSplits ? /\s*[;|\n]\s*|\s*,\s*/ : /\s*[;|\n]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const merged: string[] = [];
  for (const part of parts) {
    // A fragment that is only a year, or opens with one, belonged to the date
    // in the fragment before it.
    if (merged.length > 0 && /^\d{4}\b/.test(part)) {
      merged[merged.length - 1] += `, ${part}`;
      continue;
    }
    merged.push(part);
  }

  const seen = new Set<string>();
  return merged.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Dates inside free text ────────────────────────────────────────────────────
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_PATTERN =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|" +
  "aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const DAY_MS = 86_400_000;

function monthIndex(name: string): number {
  const n = name.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(n));
}

// Month + day with no year: pick the year that puts it on the correct side of
// now. An "upcoming" birthday in March read in August means next March, not a
// date five months gone.
function resolveYearless(month: number, day: number, nowMs: number, direction: Direction): number {
  const now = new Date(nowMs);
  const thisYear = new Date(now.getFullYear(), month, day).getTime();
  if (direction === "upcoming") {
    return thisYear >= nowMs - DAY_MS ? thisYear : new Date(now.getFullYear() + 1, month, day).getTime();
  }
  return thisYear <= nowMs + DAY_MS ? thisYear : new Date(now.getFullYear() - 1, month, day).getTime();
}

export type Direction = "upcoming" | "past";

type Hit = { at: number; label: string; exact: boolean };

// Relative phrases. Ordered longest first so "next weekend" is not eaten by
// "next week". `days` is signed for the past direction by the caller.
const RELATIVE: { re: RegExp; days: number; label: string }[] = [
  { re: /\bday after tomorrow\b/i, days: 2, label: "Day after tomorrow" },
  { re: /\bthis weekend\b/i, days: 5, label: "This weekend" },
  { re: /\bnext weekend\b/i, days: 12, label: "Next weekend" },
  { re: /\bnext month\b/i, days: 30, label: "Next month" },
  { re: /\bnext week\b/i, days: 7, label: "Next week" },
  { re: /\bnext year\b/i, days: 365, label: "Next year" },
  { re: /\btomorrow\b/i, days: 1, label: "Tomorrow" },
  { re: /\btonight\b/i, days: 0, label: "Tonight" },
  { re: /\btoday\b/i, days: 0, label: "Today" },
  { re: /\blast weekend\b/i, days: -5, label: "Last weekend" },
  { re: /\blast month\b/i, days: -30, label: "Last month" },
  { re: /\blast week\b/i, days: -7, label: "Last week" },
  { re: /\blast year\b/i, days: -365, label: "Last year" },
  { re: /\byesterday\b/i, days: -1, label: "Yesterday" },
];

function findDate(text: string, nowMs: number, direction: Direction): Hit | null {
  // 1. ISO, the shape the extractor is asked for. Unambiguous, so it wins.
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const at = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
    if (!Number.isNaN(at)) return { at, label: formatDate(at), exact: true };
  }

  // 2. "March 3", "Mar 3rd 2026"
  const md = text.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, "i"));
  if (md) {
    const m = monthIndex(md[1]);
    const d = Number(md[2]);
    if (m >= 0 && d >= 1 && d <= 31) {
      const at = md[3]
        ? new Date(Number(md[3]), m, d).getTime()
        : resolveYearless(m, d, nowMs, direction);
      return { at, label: formatDate(at), exact: true };
    }
  }

  // 3. "3 March", "3rd of March 2026"
  const dm = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_PATTERN})(?:,?\\s*(\\d{4}))?\\b`, "i"));
  if (dm) {
    const m = monthIndex(dm[2]);
    const d = Number(dm[1]);
    if (m >= 0 && d >= 1 && d <= 31) {
      const at = dm[3]
        ? new Date(Number(dm[3]), m, d).getTime()
        : resolveYearless(m, d, nowMs, direction);
      return { at, label: formatDate(at), exact: true };
    }
  }

  // 4. "in 3 weeks"
  const inN = text.match(/\bin\s+(\d{1,3})\s+(day|week|month|year)s?\b/i);
  if (inN) {
    const n = Number(inN[1]);
    const unit = inN[2].toLowerCase();
    const mult = unit === "day" ? 1 : unit === "week" ? 7 : unit === "month" ? 30 : 365;
    const at = nowMs + n * mult * DAY_MS;
    return { at, label: `In ${n} ${unit}${n === 1 ? "" : "s"}`, exact: false };
  }

  // 5. Bare month name, no day. Sorts to the 1st, labelled without a day so it
  //    never claims a precision the fan never gave.
  const bare = text.match(new RegExp(`\\b(${MONTH_PATTERN})\\b(?:\\s+(\\d{4}))?`, "i"));
  if (bare) {
    const m = monthIndex(bare[1]);
    if (m >= 0) {
      const at = bare[2] ? new Date(Number(bare[2]), m, 1).getTime() : resolveYearless(m, 1, nowMs, direction);
      const label = new Date(at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      return { at, label, exact: false };
    }
  }

  // 6. Relative words, last because "next week" is the vaguest thing here.
  for (const r of RELATIVE) {
    if (r.re.test(text)) return { at: nowMs + r.days * DAY_MS, label: r.label, exact: false };
  }

  return null;
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export type FanEvent = {
  text: string;
  // Human label for the chip, null when nothing date shaped was found.
  when: string | null;
  // Sort position. Undated events get null and fall to the bottom in the order
  // the extractor wrote them, rather than being silently dropped.
  at: number | null;
};

// Splits one events cell into separate, individually readable events and puts
// them in chronological order, soonest first for upcoming and most recent
// first for past.
export function parseEvents(raw: string, nowMs: number, direction: Direction): FanEvent[] {
  const items = splitList(raw, true);
  const events = items.map((item, i) => {
    const hit = findDate(item, nowMs, direction);
    return { text: sentenceCase(item), when: hit?.label ?? null, at: hit?.at ?? null, i };
  });

  const dated = events.filter((e) => e.at != null);
  const undated = events.filter((e) => e.at == null);
  dated.sort((a, b) => (direction === "upcoming" ? a.at! - b.at! : b.at! - a.at!));
  undated.sort((a, b) => a.i - b.i);

  return [...dated, ...undated].map(({ text, when, at }) => ({ text, when, at }));
}

// ── Category presentation ─────────────────────────────────────────────────────
// Emoji and list shape per dossier category, keyed by the label built in
// app/users/page.tsx. A label missing from here still renders, it just gets the
// fallback icon and no comma splitting, so adding a category upstream cannot
// break this panel.
export const CATEGORY_META: Record<string, { emoji: string; list: boolean }> = {
  // Personal details
  "Hobbies": { emoji: "🎨", list: true },
  "Interests": { emoji: "🎯", list: true },
  "Siblings": { emoji: "👫", list: true },
  "Location": { emoji: "📍", list: false },
  "Timezone": { emoji: "🌎", list: false },
  "Ethnicity": { emoji: "🧬", list: false },
  "Language": { emoji: "🗣️", list: true },
  "Occupation": { emoji: "💼", list: false },
  "Relationship": { emoji: "💞", list: false },
  "Family / children": { emoji: "👨‍👩‍👧", list: true },
  "Education": { emoji: "🎓", list: false },
  "Pets": { emoji: "🐾", list: true },
  "Birthday / age": { emoji: "🎂", list: false },
  // Context and preferences
  "Upcoming events": { emoji: "📅", list: true },
  "Recent events": { emoji: "🕘", list: true },
  "Goals / plans": { emoji: "🚀", list: true },
  "Routine / availability": { emoji: "⏰", list: true },
  "Likes / favourites": { emoji: "❤️", list: true },
  "Dislikes / boundaries": { emoji: "🚫", list: true },
  "Communication style": { emoji: "💬", list: false },
  "How they found us": { emoji: "🔎", list: false },
  "Chat / content preferences": { emoji: "💌", list: true },
};

export const FALLBACK_EMOJI = "🗂️";

export type DossierRow = {
  label: string;
  emoji: string;
  // Already split and capitalised. Empty means nothing learned yet.
  items: string[];
};

// Turns the {label, value} pairs the page builds into render ready rows.
export function toRows(categories: { label: string; value: string }[]): DossierRow[] {
  return categories.map(({ label, value }) => {
    const meta = CATEGORY_META[label];
    return {
      label,
      emoji: meta?.emoji ?? FALLBACK_EMOJI,
      items: splitList(value ?? "", meta?.list ?? false).map(sentenceCase),
    };
  });
}
