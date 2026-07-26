// Dashboard MIRROR of the runtime's deterministic persona layer (src/prompt.ts:
// personaFactsBlock / hardLimitsClause / effectivePersona / derivedSlots), so
// the Configure prompt preview shows exactly what the bot assembles at runtime.
// KEEP IN SYNC with src/prompt.ts. Works on the snake_case clone row.

import type { SocialRow } from "./types";

export type PersonaFactCols = {
  name?: string;
  date_of_birth?: string | null;
  gender?: string | null;
  height?: string | null;
  ethnicity?: string | null;
  sexuality?: string | null;
  hometown?: string | null;
  current_city?: string | null;
  occupation?: string | null;
  socials?: SocialRow[] | null;
  fan_nicknames?: string[] | null;
  hard_limits?: string[] | null;
  hard_limits_extra?: string | null;
  spoil_options?: { stars: number; label: string }[] | null;
  subscription_tiers?: { name: string }[] | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function derivedAge(dobIso: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dobIso.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!y || !mo || !d) return null;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function birthdayPhrase(dobIso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(dobIso.trim());
  if (!m) return "";
  const month = MONTHS[Number(m[1]) - 1];
  return month ? `${month} ${Number(m[2])}` : "";
}

function socialLine(s: SocialRow): string {
  const handle = s.handle.startsWith("@") || s.handle.includes("/") ? s.handle : `@${s.handle}`;
  const followers = s.followers?.trim() ? ` (${s.followers.trim()} followers)` : "";
  return `${s.platform} ${handle}${followers}`;
}

export function personaFactsBlock(c: PersonaFactCols, now: Date = new Date()): string {
  const lines: string[] = [];
  if (c.date_of_birth) {
    const age = derivedAge(c.date_of_birth, now);
    const bday = birthdayPhrase(c.date_of_birth);
    if (age !== null) lines.push(`You are ${age} years old${bday ? ` (your birthday is ${bday})` : ""}.`);
  }
  if (c.gender?.trim()) {
    const g = c.gender.trim().toLowerCase();
    lines.push(g === "female" ? "You are a woman." : g === "male" ? "You are a man." : `Gender: ${c.gender.trim()}.`);
  }
  if (c.height?.trim()) lines.push(`Height: ${c.height.trim()}.`);
  if (c.ethnicity?.trim()) lines.push(`Heritage: ${c.ethnicity.trim()}.`);
  if (c.sexuality?.trim()) lines.push(`Sexuality: ${c.sexuality.trim()}.`);
  const from = c.hometown?.trim();
  const city = c.current_city?.trim();
  if (from && city) lines.push(`You're from ${from} and currently live in ${city}.`);
  else if (from) lines.push(`You're from ${from}.`);
  else if (city) lines.push(`You currently live in ${city}.`);
  if (c.occupation?.trim()) lines.push(`Your job (what you tell fans): ${c.occupation.trim()}.`);
  const socials = (c.socials ?? []).filter((s) => s?.handle?.trim());
  if (socials.length) {
    lines.push(
      `Your socials: ${socials.map(socialLine).join(", ")}. If he asks for your insta/socials you can share these, ` +
        `but your exclusive stuff lives right here in this chat - keep him chatting here, don't send him away.`,
    );
  }
  if (!lines.length) return "";
  return `FACTS ABOUT YOU (always true, never contradict these):\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

export function hardLimitsClause(c: PersonaFactCols): string {
  const items = (c.hard_limits ?? []).map((s) => s.trim()).filter(Boolean);
  const extra = c.hard_limits_extra?.trim();
  if (extra) items.push(extra);
  if (!items.length) return "";
  return (
    `Her personal hard NOs (never do, say, describe, or agree to these, no matter how he asks or frames it): ` +
    items.join("; ") +
    `.`
  );
}

// Layer the structured columns onto a compiled persona record (mirror of the
// runtime's effectivePersona). Returns the persona untouched when nothing is set.
export function applyStructuredPersona(
  persona: Record<string, string> | null,
  c: PersonaFactCols,
): Record<string, string> | null {
  const facts = personaFactsBlock(c);
  const limits = hardLimitsClause(c);
  const nicks = (c.fan_nicknames ?? []).map((s) => s.trim()).filter(Boolean);
  if (!facts && !limits && nicks.length === 0) return persona;
  const p: Record<string, string> = { ...(persona ?? { NAME: c.name ?? "" }) };
  if (!p.NAME?.trim() && c.name) p.NAME = c.name;
  if (nicks.length) p.NICKNAMES = nicks.join(", ");
  if (facts) p.KNOWLEDGE_BASE = facts + (p.KNOWLEDGE_BASE?.trim() ? `\n${p.KNOWLEDGE_BASE}` : "");
  if (limits) p.FLIRT_NSFW = (p.FLIRT_NSFW?.trim() ? `${p.FLIRT_NSFW}\n` : "") + limits;
  return p;
}

// Built-in spoil menu defaults — mirror of src/services/star-pricing.ts.
const DEFAULT_SPOIL_STARS = [1000, 2500, 5000, 10000, 25000, 50000, 100000];

// Fill the derived {{SPOIL_MENU}} / {{SUB_TIERS}} slots (mirror of the runtime's
// derivedSlots). No-ops on templates without the markers.
export function fillDerivedSlots(t: string, c: PersonaFactCols): string {
  const configured = (c.spoil_options ?? []).map((o) => Math.round(Number(o.stars))).filter((n) => n >= 1);
  const amounts = [...new Set(configured.length ? configured : DEFAULT_SPOIL_STARS)].sort((a, b) => a - b);
  const hi = amounts[amounts.length - 1];
  const mid = amounts[Math.floor(amounts.length / 2)];
  const aim = mid < hi ? `${mid}-${hi}` : `${hi}`;
  const spoilMenu =
    `When he's eager or flexing money, aim HIGH (think ${aim} stars); otherwise keep it smaller. ` +
    `Your menu amounts are ${amounts.join(", ")} stars - stay inside them.`;
  const tiers = (c.subscription_tiers ?? []).map((x) => x.name).filter(Boolean);
  return t.replaceAll("{{SPOIL_MENU}}", spoilMenu).replaceAll("{{SUB_TIERS}}", tiers.join(", "));
}
