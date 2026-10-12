// A COPY of the V2 matcher's row-evidence logic (twin-sexbot src/media.ts: FACT_WORDS, TAG_FACT, tagKey, analysisState,
// isFacts, evidenceOf), so the dashboard can test "what V2 will match after an operator correction" without a cross-repo
// import. Facts rows only (visual_facts.v === 2); legacy rows without facts use V2's description path and are not modelled.
// If V2's evidenceOf changes, update this copy.
const FACT_WORDS: Record<string, string> = {
  nipples: "nipples topless boobs", genitals: "genitals", anus: "anus anal", bare_buttocks: "ass buttocks", full_nudity: "nude",
  sexual_activity: "sex sexual", sex_toy: "toy plug dildo vibrator", swimwear: "bikini", lingerie: "lingerie", mirror_reflection: "mirror", suggestive_pose: "pose",
};
const TAG_FACT: Record<string, string> = {
  topless: "nipples", nipples: "nipples", nipple: "nipples", pussy: "genitals", vulva: "genitals", vagina: "genitals", genitals: "genitals", cunt: "genitals",
  anal: "anus", anus: "anus", ass: "bare_buttocks", butt: "bare_buttocks", buttocks: "bare_buttocks", booty: "bare_buttocks",
  nude: "full_nudity", naked: "full_nudity", full_nude: "full_nudity", fullnude: "full_nudity", full_nudity: "full_nudity",
  sex: "sexual_activity", sex_toy: "sex_toy", toy: "sex_toy", dildo: "sex_toy", vibrator: "sex_toy", plug: "sex_toy", butt_plug: "sex_toy",
  bikini: "swimwear", swimwear: "swimwear", lingerie: "lingerie", mirror_selfie: "mirror_reflection",
};
const tagKey = (t: string) => TAG_FACT[t.toLowerCase().trim().replace(/[\s-]+/g, "_")];
export type V2State = "legacy" | "pending" | "analysed" | "needs_review" | "failed";
export function analysisState(r: any): V2State {
  const st = r?.analysis_status;
  return st === "pending" || st === "failed" || st === "needs_review" || st === "analysed" ? st : "legacy";
}
const isFacts = (f: any): boolean => !!f && typeof f === "object" && f.v === 2 && !!f.evidence && typeof f.evidence === "object";
export function evidenceOf(r: any): { text: string; tags: string[]; state: V2State; trusted: boolean } {
  const state = analysisState(r), tags: string[] = Array.isArray(r.tags) ? r.tags : [];
  if (state === "pending" || state === "failed" || state === "needs_review") return { text: "", tags: [], state, trusted: false };
  if (!isFacts(r.visual_facts)) return { text: tags.join(" "), tags, state, trusted: true }; // legacy description path not modelled
  const ev = r.visual_facts.evidence;
  const yes = Object.keys(FACT_WORDS).filter((k) => ev[k] === "yes");
  const kept = tags.filter((t) => { const k = tagKey(t); return !k || ev[k] === "yes"; });
  const visible = Array.isArray(r.visual_facts.visible) ? r.visual_facts.visible.filter((x: any) => typeof x === "string") : [];
  return { text: [...yes.map((k) => FACT_WORDS[k]), ...visible, ...kept, ...kept.map((t) => t.replace(/_/g, " "))].join(" "), tags: kept, state, trusted: true };
}
/** Does this stored row, read by V2, present attribute `word` (e.g. "nipples", "topless")? */
export const v2Matches = (row: any, word: string): boolean => {
  const e = evidenceOf(row);
  return e.trusted && new Set(e.text.toLowerCase().split(/\s+/)).has(word);
};

