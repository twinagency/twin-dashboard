// Shared by the dashboard actions, the import scripts and the backfill: how an AnalysisResult becomes columns on photos/videos,
// how a failed analysis is priced, and how a manual edit is detected. No server-only imports so scripts can use it.
import { ANALYSIS_COLUMNS, FACT_FIELDS, type AnalysisResult } from "./media-analysis-contract";
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

type InsertClient = { from: (table: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> } };

/** Insert a photos/videos row; if the analysis columns are not migrated yet, retry without them (see OPTIONAL_MEDIA_COLUMNS). */
export async function insertMediaRowWithFallback(client: InsertClient, table: "photos" | "videos", row: Record<string, unknown>): Promise<void> {
  let { error } = await client.from(table).insert(row);
  if (error && isMissingColumnError(error.message)) ({ error } = await client.from(table).insert(withoutOptionalMediaColumns(row)));
  if (error) throw new Error(error.message);
}
