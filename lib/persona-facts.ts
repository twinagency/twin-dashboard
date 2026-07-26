// Dashboard MIRROR of the runtime's deterministic persona layer (src/prompt.ts:
// personaFactsBlock / hardLimitsClause / effectivePersona / derivedSlots), so
// the Configure prompt preview shows exactly what the bot assembles at runtime.
// KEEP IN SYNC with src/prompt.ts. Works on the snake_case clone row.

import type { SocialRow } from "./types";

// Imperfection profile intensity scale (migration 042). A frequency scale
// (how OFTEN something happens) reads more natural for these traits than
// low/medium/high, which implies magnitude. KEEP IN SYNC with
// ../../bot/src/types.ts ImperfectionLevel.
export type ImperfectionLevel = "never" | "sometimes" | "often" | "always";

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

  // ── identity canon (migration 039) ──────────────────────────────────────────
  stage_name?: string | null;
  real_name?: string | null;
  name_shared_with_fans?: string | null;

  creator_type?: string | null;
  known_for?: string | null;
  career_start_year?: number | null;
  career_history?: string | null;
  cover_story?: string | null;
  admits_platforms?: boolean | null;
  platforms?: string[] | null;

  hair_color?: string | null;
  hair_length?: string | null;
  eye_color?: string | null;
  body_type?: string | null;
  cup_size?: string | null;
  measurements?: string | null;
  tattoos?: boolean | null;
  tattoo_details?: string[] | null;
  piercings?: boolean | null;
  piercing_details?: string[] | null;
  enhancements?: string | null;
  ethnicity_tags?: string[] | null;
  ethnicity_other?: string | null;
  voice_accent?: string | null;
  voice_pace?: string | null;
  voice_texture?: string | null;

  meeting_policy?: string | null;
  love_policy?: string | null;
  relationship_canon?: string | null;
  acknowledges_other_fans?: boolean | null;

  wake_time?: string | null;
  sleep_time?: string | null;
  daily_blocks?: { time: string; activity: string }[] | null;

  content_hard_nos?: string[] | null;
  content_done?: string[] | null;

  reaction_to_rudeness?: string | null;
  reaction_to_compliments?: string | null;
  burst_style?: string | null;

  uses_lowercase?: boolean | null;
  drops_punctuation?: boolean | null;
  makes_typos?: boolean | null;
  double_texts?: boolean | null;

  // Imperfection profile as an intensity (migration 042) — supersedes the
  // booleans above once set; null falls back to the boolean.
  lowercase_level?: ImperfectionLevel | null;
  punctuation_drop_level?: ImperfectionLevel | null;
  typo_level?: ImperfectionLevel | null;
  double_text_level?: ImperfectionLevel | null;
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

// "HH:MM:SS" (Postgres `time`) → "7:00am". Falls back to the raw string on
// anything unparseable so a malformed value never throws.
function fmtTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return t.trim();
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${min}${ampm}`;
}

// ── Identity canon (migration 039) label maps ─────────────────────────────────
const CREATOR_TYPE_LABEL: Record<string, string> = {
  of_creator: "OnlyFans creator",
  influencer: "influencer",
  adult_performer: "adult performer",
  model: "model",
  cam_girl: "cam girl",
  fitness_model: "fitness model",
};
const MEETING_POLICY_TEXT: Record<string, string> = {
  hard_no: "If he asks to meet up in person, always say no. Travel, safety or being too busy are good reasons, stay warm but firm.",
  soft_deflect: "If he asks to meet up in person, deflect softly (not ready yet, maybe someday), never a hard no and never a real commitment.",
  playful_maybe: "If he asks to meet up in person, keep it a fun maybe, flirt with the idea without ever actually committing to plans.",
};
const LOVE_POLICY_TEXT: Record<string, string> = {
  says_it_back: "If he says he loves you, say it back warmly, like you mean it.",
  deflects_warmly: "If he says he loves you, deflect warmly (aww you're sweet, you're gonna make me blush) without saying it back.",
  playful_dodge: "If he says he loves you, dodge it playfully (tease him, change the subject) instead of answering directly.",
};
const RELATIONSHIP_CANON_TEXT: Record<string, string> = {
  single: "You are single.",
  taken: "You are in a relationship, but you keep chat flirty and never let it get in the way.",
  complicated: "Your relationship status is complicated. If asked, keep it vague rather than a clean single or taken answer.",
  wont_say: "You never give a straight answer about your relationship status, deflect it playfully every time.",
};
const REACTION_RUDE_TEXT: Record<string, string> = {
  goes_quiet: "goes quiet and pulls back",
  claps_back: "claps back sharply",
  playful_scold: "playfully scolds him",
};
const REACTION_COMPLIMENT_TEXT: Record<string, string> = {
  deflects: "deflects the compliment",
  teases: "teases him back on it",
  accepts_warmly: "accepts it warmly",
};
const BURST_STYLE_TEXT: Record<string, string> = {
  one_long: "sends one longer message",
  short_bursts: "sends a few short messages in a row",
};

// Imperfection profile as an intensity (migration 042). Each level is
// genuinely different wording, not a label swap: "never" writes nothing,
// "sometimes" is soft, "always" is a strong instruction. KEEP IN SYNC with
// ../../bot/src/prompt.ts.
const LOWERCASE_LEVEL_TEXT: Record<ImperfectionLevel, string> = {
  never: "",
  sometimes: "she occasionally drops into all-lowercase texting, but usually still capitalizes normally",
  often: "she mostly texts in lowercase, capitals are rare for her",
  always: "she always texts in full lowercase, never capitalizing anything, not even the start of a sentence or the word I",
};
const PUNCTUATION_DROP_LEVEL_TEXT: Record<ImperfectionLevel, string> = {
  never: "",
  sometimes: "she sometimes leaves off the period at the end of a text",
  often: "she usually skips end punctuation (periods, question marks) unless it would read oddly without one",
  always: "she never uses end punctuation, no periods, no question marks, ever",
};
const TYPO_LEVEL_TEXT: Record<ImperfectionLevel, string> = {
  never: "",
  sometimes: "she very occasionally makes a small typo (maybe one every dozen or so messages) and doesn't correct it",
  often: "she makes small typos fairly often (a dropped letter, a swapped key) and rarely goes back to fix them",
  always: "she makes typos constantly, almost every message has at least one small slip, and she almost never corrects them",
};
const DOUBLE_TEXT_LEVEL_TEXT: Record<ImperfectionLevel, string> = {
  never: "",
  sometimes: "she occasionally sends a quick second message right after her first instead of one longer one",
  often: "she regularly splits her thoughts into two or three quick messages in a row instead of one longer message",
  always: "she almost always fires off a burst of several short messages back to back instead of writing one longer one",
};

// Level (migration 042) wins when set; else fall back to the migration-039
// boolean's old single-sentence text, so a clone never resaved after 042
// ships keeps behaving exactly as it did before.
function imperfectionText(
  level: ImperfectionLevel | null | undefined,
  legacyBool: boolean | null | undefined,
  table: Record<ImperfectionLevel, string>,
  legacyText: string,
): string {
  if (level) return table[level];
  if (legacyBool) return legacyText;
  return "";
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

  // Name disclosure (migration 039). Security-relevant: real_name is only
  // ever surfaced when name_shared_with_fans says fans actually know it.
  const stage = c.stage_name?.trim();
  const real = c.real_name?.trim();
  const nameMode = c.name_shared_with_fans?.trim();
  if (stage || real) {
    if (nameMode === "real" && real) {
      lines.push(`Fans know your real name: ${real}.`);
    } else if (nameMode === "both" && (stage || real)) {
      const parts = [stage, real].filter(Boolean);
      lines.push(`Fans know you by both your stage name and real name: ${parts.join(" / ")}.`);
    } else if (stage) {
      lines.push(`Fans know you as ${stage}.` + (real ? ` Your real name is ${real}, NEVER reveal it to fans.` : ""));
    }
  }

  if (c.height?.trim()) lines.push(`Height: ${c.height.trim()}.`);

  // Heritage: new multi-select chips + other, falling back to nothing if unset
  // (the legacy single `ethnicity` column is a read-only prefill source only,
  // never read here directly, see ethnicity_other's prefill in the widget).
  const heritage = [...(c.ethnicity_tags ?? []).map((s) => s.trim()).filter(Boolean)];
  if (c.ethnicity_other?.trim()) heritage.push(c.ethnicity_other.trim());
  if (heritage.length) lines.push(`Heritage: ${heritage.join(", ")}.`);
  else if (c.ethnicity?.trim()) lines.push(`Heritage: ${c.ethnicity.trim()}.`); // pre-039 clones

  if (c.sexuality?.trim()) lines.push(`Sexuality: ${c.sexuality.trim()}.`);
  const from = c.hometown?.trim();
  const city = c.current_city?.trim();
  if (from && city) lines.push(`You're from ${from} and currently live in ${city}.`);
  else if (from) lines.push(`You're from ${from}.`);
  else if (city) lines.push(`You currently live in ${city}.`);

  // Creator identity (migration 039) — supersedes the legacy `occupation` line.
  const coverStory = c.cover_story?.trim();
  const creatorLabel = c.creator_type ? (CREATOR_TYPE_LABEL[c.creator_type] ?? c.creator_type) : "";
  if (coverStory) {
    lines.push(
      `What you volunteer first if asked your job: ${coverStory}.` +
        (creatorLabel ? ` If pressed, or he already knows, you're actually a ${creatorLabel}.` : ""),
    );
  } else if (creatorLabel) {
    lines.push(`Your job (what you tell fans): ${creatorLabel}.`);
  } else if (c.occupation?.trim()) {
    lines.push(`Your job (what you tell fans): ${c.occupation.trim()}.`); // pre-039 clones
  }
  if (c.known_for?.trim()) lines.push(`What you're actually known for: ${c.known_for.trim()}.`);
  if (c.career_start_year) {
    const detail = c.career_history?.trim() ? ` (${c.career_history.trim()})` : "";
    lines.push(`You've been doing this since ${c.career_start_year}${detail}.`);
  } else if (c.career_history?.trim()) {
    lines.push(`How you got into it: ${c.career_history.trim()}.`);
  }
  const platforms = (c.platforms ?? []).map((s) => s.trim()).filter(Boolean);
  if (c.admits_platforms === true && platforms.length) {
    lines.push(`You're open about being on: ${platforms.join(", ")}. Fans can ask and you'll confirm.`);
  } else if (c.admits_platforms === false) {
    lines.push(`Never confirm which platforms you're on if asked, deflect playfully instead of naming any.`);
  }

  const socials = (c.socials ?? []).filter((s) => s?.handle?.trim());
  if (socials.length) {
    lines.push(
      `Your socials: ${socials.map(socialLine).join(", ")}. If he asks for your insta/socials you can share these, ` +
        `but your exclusive stuff lives right here in this chat - keep him chatting here, don't send him away.`,
    );
  }

  // Physical canon (migration 039) — highest-priority block per the audit,
  // currently improvised and self-contradicting between sessions.
  const hair = [c.hair_length?.trim(), c.hair_color?.trim()].filter(Boolean).join(" ");
  if (hair) lines.push(`Hair: ${hair}.`);
  if (c.eye_color?.trim()) lines.push(`Eyes: ${c.eye_color.trim()}.`);
  if (c.body_type?.trim()) lines.push(`Body type: ${c.body_type.trim()}.`);
  const figure = [c.cup_size?.trim() ? `${c.cup_size.trim()} cup` : "", c.measurements?.trim()]
    .filter(Boolean)
    .join(", ");
  if (figure) lines.push(`Figure: ${figure}.`);
  if (c.tattoos === true) {
    const details = (c.tattoo_details ?? []).map((s) => s.trim()).filter(Boolean);
    lines.push(`Tattoos: ${details.length ? details.join("; ") : "yes, unspecified"}.`);
  } else if (c.tattoos === false) {
    lines.push(`You have no tattoos.`);
  }
  if (c.piercings === true) {
    const details = (c.piercing_details ?? []).map((s) => s.trim()).filter(Boolean);
    lines.push(`Piercings: ${details.length ? details.join("; ") : "yes, unspecified"}.`);
  } else if (c.piercings === false) {
    lines.push(`You have no piercings.`);
  }
  if (c.enhancements === "natural") lines.push(`Your body is all natural, no enhancements.`);
  else if (c.enhancements === "augmented") lines.push(`You've had augmentation work done, own it confidently if asked.`);
  else if (c.enhancements === "prefers_not_to_say")
    lines.push(`You don't discuss whether anything is natural or enhanced, deflect that question playfully.`);

  // Daily rhythm (migration 039) — pairs with `timezone`.
  if (c.wake_time || c.sleep_time) {
    const wake = c.wake_time ? fmtTime(c.wake_time) : null;
    const sleep = c.sleep_time ? fmtTime(c.sleep_time) : null;
    if (wake && sleep) {
      lines.push(
        `Your rough daily rhythm: you wake up around ${wake} and go to sleep around ${sleep}, your own local time. ` +
          `Check the current local time before saying you just woke up or are about to sleep.`,
      );
    } else if (wake) {
      lines.push(`You wake up around ${wake} your own local time.`);
    } else if (sleep) {
      lines.push(`You go to sleep around ${sleep} your own local time.`);
    }
  }
  const blocks = (c.daily_blocks ?? []).filter((b) => b?.activity?.trim());
  if (blocks.length) {
    lines.push(`Typical day: ${blocks.map((b) => `${b.time ? fmtTime(b.time) + " " : ""}${b.activity.trim()}`).join("; ")}.`);
  }

  // Texting mechanics (migration 039, intensity added in 042) — survives as
  // flags instead of being normalised away by the compiler when it's only
  // implied by example_texts. The migration-042 level wins when set; the
  // migration-039 boolean is only a fallback for a clone never resaved since.
  const style: string[] = [];
  const lowercaseText = imperfectionText(c.lowercase_level, c.uses_lowercase, LOWERCASE_LEVEL_TEXT, "she texts mostly in lowercase");
  if (lowercaseText) style.push(lowercaseText);
  const punctuationText = imperfectionText(c.punctuation_drop_level, c.drops_punctuation, PUNCTUATION_DROP_LEVEL_TEXT, "she drops end punctuation");
  if (punctuationText) style.push(punctuationText);
  const typoText = imperfectionText(c.typo_level, c.makes_typos, TYPO_LEVEL_TEXT, "she occasionally makes small typos, don't over-correct them");
  if (typoText) style.push(typoText);
  const doubleTextText = imperfectionText(
    c.double_text_level,
    c.double_texts,
    DOUBLE_TEXT_LEVEL_TEXT,
    "she sometimes double-texts (a short second message right after the first) instead of one longer message",
  );
  if (doubleTextText) style.push(doubleTextText);
  if (style.length) lines.push(`Texting habits: ${style.join("; ")}.`);

  // Reaction policies (migration 039), structured out of the `quirks` prose.
  if (c.reaction_to_rudeness && REACTION_RUDE_TEXT[c.reaction_to_rudeness]) {
    lines.push(`If he's rude, she ${REACTION_RUDE_TEXT[c.reaction_to_rudeness]}.`);
  }
  if (c.reaction_to_compliments && REACTION_COMPLIMENT_TEXT[c.reaction_to_compliments]) {
    lines.push(`When complimented, she ${REACTION_COMPLIMENT_TEXT[c.reaction_to_compliments]}.`);
  }
  if (c.burst_style && BURST_STYLE_TEXT[c.burst_style]) {
    lines.push(`Her message rhythm: she typically ${BURST_STYLE_TEXT[c.burst_style]}.`);
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

// Content canon (migration 039) — distinct from hard_limits above, which
// governs CHAT topics only. This governs what she's actually filmed/shown.
export function contentCanonClause(c: PersonaFactCols): string {
  const done = (c.content_done ?? []).map((s) => s.trim()).filter(Boolean);
  const nos = (c.content_hard_nos ?? []).map((s) => s.trim()).filter(Boolean);
  const lines: string[] = [];
  if (done.length) lines.push(`Content you have actually done publicly, you can confirm these truthfully if asked: ${done.join("; ")}.`);
  if (nos.length)
    lines.push(`Content you will NEVER film or sell, no matter how he asks or how much he offers: ${nos.join("; ")}.`);
  return lines.join(" ");
}

// Behaviour policy (migration 039) — deterministic, not LLM-interpreted.
// Prepended to {{RELATIONSHIP}} the same way facts prepend to {{KNOWLEDGE_BASE}}.
export function relationshipPolicyClause(c: PersonaFactCols): string {
  const lines: string[] = [];
  if (c.relationship_canon && RELATIONSHIP_CANON_TEXT[c.relationship_canon]) lines.push(RELATIONSHIP_CANON_TEXT[c.relationship_canon]);
  if (c.meeting_policy && MEETING_POLICY_TEXT[c.meeting_policy]) lines.push(MEETING_POLICY_TEXT[c.meeting_policy]);
  if (c.love_policy && LOVE_POLICY_TEXT[c.love_policy]) lines.push(LOVE_POLICY_TEXT[c.love_policy]);
  if (c.acknowledges_other_fans === true)
    lines.push("You're open that you chat with lots of fans if it comes up, don't pretend he's your only one.");
  else if (c.acknowledges_other_fans === false)
    lines.push("Never mention or imply that you talk to other fans, keep the chat feeling exclusive to him.");
  return lines.join(" ");
}

// Voice canon (migration 039) — mostly supersedes the retired `voice_sound`
// intake key. Prepended to {{VOICE_TRAITS}} the same way facts prepend to
// {{KNOWLEDGE_BASE}}.
export function voiceTraitsClause(c: PersonaFactCols): string {
  const parts: string[] = [];
  if (c.voice_accent?.trim()) parts.push(`${c.voice_accent.trim()} accent`);
  if (c.voice_pace?.trim()) parts.push(`${c.voice_pace.trim()} pace`);
  if (c.voice_texture?.trim()) parts.push(`${c.voice_texture.trim()} texture`);
  if (!parts.length) return "";
  return `Voice: ${parts.join(", ")}.`;
}

// Layer the structured columns onto a compiled persona record (mirror of the
// runtime's effectivePersona). Returns the persona untouched when nothing is set.
export function applyStructuredPersona(
  persona: Record<string, string> | null,
  c: PersonaFactCols,
): Record<string, string> | null {
  const facts = personaFactsBlock(c);
  const limits = hardLimitsClause(c);
  const content = contentCanonClause(c);
  const relPolicy = relationshipPolicyClause(c);
  const voice = voiceTraitsClause(c);
  const nicks = (c.fan_nicknames ?? []).map((s) => s.trim()).filter(Boolean);
  if (!facts && !limits && !content && !relPolicy && !voice && nicks.length === 0) return persona;
  const p: Record<string, string> = { ...(persona ?? { NAME: c.name ?? "" }) };
  if (!p.NAME?.trim() && c.name) p.NAME = c.name;
  if (nicks.length) p.NICKNAMES = nicks.join(", ");
  if (facts) p.KNOWLEDGE_BASE = facts + (p.KNOWLEDGE_BASE?.trim() ? `\n${p.KNOWLEDGE_BASE}` : "");
  if (limits || content) {
    const flirt = [limits, content].filter(Boolean).join("\n");
    p.FLIRT_NSFW = (p.FLIRT_NSFW?.trim() ? `${p.FLIRT_NSFW}\n` : "") + flirt;
  }
  if (relPolicy) p.RELATIONSHIP = relPolicy + (p.RELATIONSHIP?.trim() ? `\n${p.RELATIONSHIP}` : "");
  if (voice) p.VOICE_TRAITS = voice + (p.VOICE_TRAITS?.trim() ? `\n${p.VOICE_TRAITS}` : "");
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
