// Shared by the dashboard actions, the import scripts and the backfill: how an AnalysisResult becomes columns on photos/videos,
// how a failed analysis is priced, and how a manual edit is detected. No server-only imports so scripts can use it.
import { ANALYSIS_COLUMNS, FACT_FIELDS, type AnalysisResult, type FactKey, type VisualFacts } from "./media-analysis-contract";
import { TAG_FACT_KEY, deniedFactKeys, descriptionProblems } from "./media-classification";
import { normalizeSafeCategoryGuide, priceFromGuide } from "./pricing";

/** Columns that may not exist yet (deploy order: dashboard can ship before the migration). A write that hits a
 * missing-column error is retried without them, so uploads and edits keep working. */
export const OPTIONAL_MEDIA_COLUMNS: readonly string[] = ["visual_description", ...ANALYSIS_COLUMNS];

export function isMissingColumnError(message: string): boolean {
  return /schema cache|column .* does not exist/i.test(message);
}

export function withoutOptionalMediaColumns(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  for (const c of OPTIONAL_MEDIA_COLUMNS) delete copy[c];
  return copy;
}

/** Row fragment for one analysis outcome. A failed analysis writes NO factual fields beyond the NOT NULL defaults and is
 * marked analysis_status "failed" with the error, so it can never be mistaken for "checked, clean". */
export function analysisRowFields(result: AnalysisResult): Record<string, unknown> {
  const state = {
    analysis_status: result.status,
    analysis_version: result.version,
    analysis_model: result.model,
    analysis_provider: result.provider,
    analysis_error: result.error ?? null,
    analysed_at: result.status === "failed" ? null : new Date().toISOString(),
  };
  const f = result.fields;
  if (!f) {
    return {
      ...state, caption: null, tags: [], is_nude: false, nsfw: false, explicitness: "none",
      auto_desc: null, visual_description: null, visual_facts: null,
    };
  }
  return {
    ...state,
    caption: f.caption ?? null,
    is_nude: f.is_nude, explicitness: f.explicitness, nsfw: f.nsfw, tags: f.tags,
    auto_desc: f.auto_desc || null,
    visual_description: f.visual_description || null,
    visual_facts: f.visual_facts,
  };
}

/** Upload/import price when the operator typed none. Only a fully analysed item is priced from its tags. Anything else
 * (failed, needs_review) gets the guide's HIGHEST category price: blank tags would otherwise price an unknown item as
 * plain SFW, i.e. the cheapest, and a nude item sold at the SFW price cannot be taken back. The operator can lower it. */
export function priceForAnalysis(guide: unknown, result: AnalysisResult): number | null {
  const safe = normalizeSafeCategoryGuide(guide);
  if (!safe) return null;
  if (result.status === "analysed" && result.fields) return priceFromGuide(safe, result.fields.tags, result.fields.nsfw);
  return Math.max(...Object.values(safe));
}

const same = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify([...(a as unknown[] ?? [])].sort()) === JSON.stringify([...(b as unknown[] ?? [])].sort());
  return (a ?? null) === (b ?? null);
};

/** True when `update` really changes a FACT_FIELDS value compared with the stored row (resaving an unchanged form is not an edit). */
export function factFieldsChanged(stored: Record<string, unknown> | null, update: Record<string, unknown>): boolean {
  if (!stored) return false;
  return FACT_FIELDS.some((k) => Object.hasOwn(update, k) && !same(stored[k], update[k]));
}

const NUDE_KEYS: readonly FactKey[] = ["nipples", "genitals", "anus", "bare_buttocks", "full_nudity"];
const isFactsObject = (f: unknown): f is VisualFacts =>
  !!f && typeof f === "object" && (f as VisualFacts).v === 2 && !!(f as VisualFacts).evidence && typeof (f as VisualFacts).evidence === "object";

/** The facts after an operator's correction, or null when the row has none (legacy rows: description and tags are then the only truth).
 * Only the operator's change is applied: a tag removed that was the last one speaking for a key makes that key "no", a tag added makes
 * it "yes", is_nude turned off makes the nudity keys "no", and a changed description that denies a part ("nipples are not visible")
 * makes that key "no". Visible phrases that now claim a denied part are dropped. Marks the facts edited. Never touches analysis_status. */
export function correctedFacts(stored: Record<string, unknown>, update: Record<string, unknown>, now: string): VisualFacts | null {
  const facts = stored.visual_facts;
  if (!isFactsObject(facts)) return null;
  const ev = { ...facts.evidence };
  const forKey = (tags: unknown, k: FactKey) => (Array.isArray(tags) ? tags : []).filter((t) => typeof t === "string" && TAG_FACT_KEY[t] === k);
  if (Object.hasOwn(update, "tags")) {
    for (const k of new Set(Object.values(TAG_FACT_KEY))) {
      const before = forKey(stored.tags, k), afterTags = forKey(update.tags, k);
      if (before.length && !afterTags.length && ev[k] === "yes") ev[k] = "no";
      else if (afterTags.some((t) => !before.includes(t)) && ev[k] !== "yes") ev[k] = "yes";
    }
  }
  if (update.is_nude === false && stored.is_nude !== false) {
    for (const k of NUDE_KEYS) if (ev[k] === "yes") ev[k] = "no";
  }
  for (const col of ["auto_desc", "visual_description"] as const) {
    if (!Object.hasOwn(update, col) || same(stored[col], update[col])) continue;
    for (const k of deniedFactKeys(String(update[col] ?? ""))) if (ev[k] === "yes") ev[k] = "no";
  }
  const visible = (facts.visible ?? []).filter((p) => descriptionProblems(p, ev, facts.frames !== undefined).length === 0);
  const uncertainty_reasons = facts.uncertainty_reasons
    ? Object.fromEntries(Object.entries(facts.uncertainty_reasons).filter(([k]) => ev[k as FactKey] === "unclear"))
    : undefined;
  return { ...facts, evidence: ev, visible, ...(uncertainty_reasons ? { uncertainty_reasons } : {}), edited: true, edited_at: now };
}

/** The ONE place a manual edit becomes row state. `stored` is the row before the edit, `update` the columns about to be written
 * (mutated). A real change to a fact field stamps metadata_edited_at (protects the row from batch repair) and brings visual_facts
 * (what the bots match on) in line with the correction. analysis_status is never written here: an edit does not approve a row,
 * only completeReviewUpdate does. */
export function applyFactEdit(stored: Record<string, unknown> | null, update: Record<string, unknown>, now = new Date().toISOString()): void {
  if (!stored || !factFieldsChanged(stored, update)) return;
  update.metadata_edited_at = now;
  const facts = correctedFacts(stored, update, now);
  if (facts) update.visual_facts = facts;
}

/** The explicit review-complete step: needs_review -> analysed, with the facts exactly as they stand (including any correction).
 * Throws for any other state or when there are no facts to approve. metadata_edited_at protects the approved row from batch repair. */
export function completeReviewUpdate(stored: Record<string, unknown>, now = new Date().toISOString()): Record<string, unknown> {
  if (stored.analysis_status !== "needs_review") throw new Error("Only an item that needs review can be marked reviewed");
  if (!isFactsObject(stored.visual_facts)) throw new Error("This item has no analysis facts to approve");
  return {
    analysis_status: "analysed",
    analysis_error: null,
    metadata_edited_at: now,
    visual_facts: { ...stored.visual_facts, reviewed: true, reviewed_at: now },
  };
}

type InsertClient = { from: (table: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> } };

/** Insert a photos/videos row; if the analysis columns are not migrated yet, retry without them (see OPTIONAL_MEDIA_COLUMNS). */
export async function insertMediaRowWithFallback(client: InsertClient, table: "photos" | "videos", row: Record<string, unknown>): Promise<void> {
  let { error } = await client.from(table).insert(row);
  if (error && isMissingColumnError(error.message)) ({ error } = await client.from(table).insert(withoutOptionalMediaColumns(row)));
  if (error) throw new Error(error.message);
}

