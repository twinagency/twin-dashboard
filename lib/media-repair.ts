// Catalogue repair batch core (used by scripts/repair-media-analysis.ts and scripts/check-media-repair-db.ts).
//
// Deliberately free of config / server-only imports: the Supabase client, the storage download and the analyser are all INJECTED,
// so tests run against a local rig with a fake analyser and the CLI is the only place that touches the live .env.
//
// Safety model
//  - Only WRITABLE_FIELDS (+ item copies of ITEM_FIELDS) can ever be written; star_value, is_free, storage_path, clone_id,
//    telegram_file_id and every purchase/financial table are not reachable from this module (assertWritable enforces it).
//  - Every UPDATE is guarded: id + clone_id + metadata_edited_at IS NULL + the OLD value of every field it changes. If anything
//    moved since the proposal was read (a person edited the row, another batch ran) it matches 0 rows and is reported as a conflict.
//  - A backup line (before + after) is appended and flushed BEFORE each write. Rollback restores a row only while it still holds
//    exactly the values this run wrote.
//  - A failed or contradictory analysis never writes metadata: the old values stay and the row goes to the failure report.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ANALYSIS_COLUMNS, ANALYSIS_VERSION, FACT_KEYS, type AnalysisResult, type VisualFacts } from "./media-analysis-contract";
import { configuredVisionModel } from "./vision-model";
import { withPhotoVisionColumn } from "./photo-vision-config";
import { withRetry, TRANSIENT_ERROR } from "./retry";
import { analysisRowFields } from "./media-analysis-row";
import { genitalVisibilityReviewReason, paintedObjectReviewReason, kneelingVisibilityReviewReason } from "./media-classification";

export type MediaTable = "photos" | "videos";
export const MEDIA_TABLES: MediaTable[] = ["photos", "videos"];

export const CONTENT_FIELDS = ["caption", "tags", "auto_desc", "visual_description", "visual_facts", "explicitness", "is_nude", "nsfw"] as const;
export const STAMP_FIELDS = ["analysis_status", "analysis_version", "analysis_model", "analysis_provider", "analysis_error", "analysed_at"] as const;
export const WRITABLE_FIELDS: readonly string[] = [...CONTENT_FIELDS, ...STAMP_FIELDS];
/** The only columns copied onto photo_bundle_items (the table has no others of ours). */
export const ITEM_FIELDS = ["caption", "auto_desc", "tags", "visual_description"] as const;
export const NEVER_WRITE = ["star_value", "is_free", "storage_path", "clone_id", "telegram_file_id", "teaser_caption", "id", "created_at"] as const;

const BASE_COLUMNS = ["id", "clone_id", "storage_path", "caption", "tags", "auto_desc", "visual_description", "explicitness", "is_nude", "nsfw"];
export const BUCKET = "media";

export type Row = {
  id: string; clone_id: string; storage_path: string;
  caption: string | null; tags: string[]; auto_desc: string | null; visual_description: string | null;
  explicitness: string; is_nude: boolean; nsfw: boolean;
  analysis_status: string; analysis_version: number | null; analysis_model: string | null; analysis_provider: string | null;
  analysis_error: string | null; analysed_at: string | null; visual_facts: VisualFacts | null; metadata_edited_at: string | null;
};

export type Analyser = (table: MediaTable, bytes: Buffer, configuredModel: string | null) => Promise<AnalysisResult>;

export type Ctx = {
  db: SupabaseClient;
  download: (storagePath: string) => Promise<Buffer>;
  analyse: Analyser;
  log: (line: string) => void;
  stateDir: string;
  runId: string;
  concurrency: number; // hard-capped to MAX_CONCURRENCY
  retries: number; // extra attempts for transient failures (429 / 5xx / timeouts), bounded
  retryBaseMs?: number;
  costPhoto: number; // USD per photo analysis call (estimate)
  costVideo: number; // USD per video analysis call (estimate)
  now?: () => Date;
  /** test hook: called after each processed row; throwing aborts the run like a crash */
  afterRow?: (n: number) => void | Promise<void>;
  /** test hook: called at each crash point of a write (after_backup, after_write, after_ack, before_items, item_after_backup, after_items) */
  step?: (point: string, key: string) => void | Promise<void>;
};
export const MAX_CONCURRENCY = 8;

// ── schema probe ─────────────────────────────────────────────────────────────
export function isMissingColumn(message: string | null | undefined, code?: string | null): boolean {
  return code === "42703" || /column .* does not exist|could not find the .* column/i.test(message ?? "");
}

/** true when migration 20261012000000 is applied (both tables carry every analysis column). */
export async function isMigrated(db: SupabaseClient): Promise<boolean> {
  for (const t of MEDIA_TABLES) {
    const { error } = await db.from(t).select(ANALYSIS_COLUMNS.join(",")).limit(1);
    if (error) {
      if (isMissingColumn(error.message, error.code)) return false;
      throw new Error(`schema probe ${t} failed: ${error.message}`);
    }
  }
  return true;
}

function selectList(migrated: boolean): string {
  return (migrated ? [...BASE_COLUMNS, ...ANALYSIS_COLUMNS] : BASE_COLUMNS).join(", ");
}

function normaliseRow(raw: any): Row {
  return {
    ...raw,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    analysis_status: raw.analysis_status ?? "legacy",
    analysis_version: raw.analysis_version ?? null, analysis_model: raw.analysis_model ?? null,
    analysis_provider: raw.analysis_provider ?? null, analysis_error: raw.analysis_error ?? null,
    analysed_at: raw.analysed_at ?? null, visual_facts: raw.visual_facts ?? null, metadata_edited_at: raw.metadata_edited_at ?? null,
  };
}

export async function fetchRows(ctx: Pick<Ctx, "db" | "retries" | "retryBaseMs">, table: MediaTable, migrated: boolean, cloneId?: string): Promise<Row[]> {
  const out: Row[] = [];
  let after: string | null = null;
  for (;;) {
    let q = ctx.db.from(table).select(selectList(migrated)).order("id", { ascending: true }).limit(1000);
    if (cloneId) q = q.eq("clone_id", cloneId);
    if (after) q = q.gt("id", after);
    const { data } = await withRetry(async () => { const r = await q; if (r.error) throw new Error(`read ${table}: ${r.error.message}`); return r; }, ctx.retries + 1, { baseMs: ctx.retryBaseMs });
    const page = (data ?? []) as any[];
    for (const r of page) out.push(normaliseRow(r));
    if (page.length < 1000) return out;
    after = page[page.length - 1].id;
  }
}

export type CloneInfo = { id: string; slug: string; vision_model: string | null; photo_vision_model?: string | null };
export async function fetchClones(db: SupabaseClient): Promise<CloneInfo[]> {
  const { data, error } = await withPhotoVisionColumn(include => {
    const table = db.from("clones");
    const query = include ? table.select("id, slug, vision_model, photo_vision_model") : table.select("id, slug, vision_model");
    return query.order("slug");
  });
  if (error) throw new Error(`read clones: ${error.message}`);
  return (data ?? []) as CloneInfo[];
}

// ── classification (inventory + selection) ───────────────────────────────────
// A sentence that negates a visibility word ("nipples not visible", "no genitals shown", "without ... exposed"). These are the
// descriptions V2's matcher used to read as positive matches.
const NEGATED = /\b(not|no|isn'?t|aren'?t|without|neither|nor|cannot|can'?t|hidden|obscured)\b[^.;\n]*\b(visible|shown|showing|exposed|seen|present|revealed)\b|\b(visible|shown|exposed)\b[^.;\n]*\bnot\b/i;

export type RowClass = {
  unanalysed: boolean; failedLooking: boolean; negated: boolean; protectedManual: boolean; eligible: boolean; problem: boolean;
};
export function classify(r: Row): RowClass {
  const unanalysed = !r.visual_description?.trim() && !r.auto_desc?.trim();
  const failedLooking = r.tags.length === 0 && r.explicitness === "none" && !r.is_nude && !r.auto_desc?.trim();
  const negated = !!r.visual_description && NEGATED.test(r.visual_description);
  const protectedManual = !!r.metadata_edited_at;
  const eligible = !protectedManual && ["legacy", "pending", "failed"].includes(r.analysis_status);
  const problem = unanalysed || failedLooking || negated || r.analysis_status === "failed" || r.analysis_status === "pending";
  return { unanalysed, failedLooking, negated, protectedManual, eligible, problem };
}

// ── inventory ────────────────────────────────────────────────────────────────
export type InvCell = {
  total: number; legacy: number; pending: number; analysed: number; needs_review: number; failed: number;
  unanalysed: number; failedLooking: number; negated: number; protectedManual: number; eligible: number; eligibleProblem: number;
};
const emptyCell = (): InvCell => ({ total: 0, legacy: 0, pending: 0, analysed: 0, needs_review: 0, failed: 0, unanalysed: 0, failedLooking: 0, negated: 0, protectedManual: 0, eligible: 0, eligibleProblem: 0 });

export type Inventory = { migrated: boolean; cells: { clone: string; table: MediaTable; c: InvCell }[]; totals: Record<MediaTable, InvCell> };

export function addToCell(c: InvCell, r: Row) {
  const k = classify(r);
  c.total++;
  (c as any)[r.analysis_status] = ((c as any)[r.analysis_status] ?? 0) + 1;
  if (k.unanalysed) c.unanalysed++;
  if (k.failedLooking) c.failedLooking++;
  if (k.negated) c.negated++;
  if (k.protectedManual) c.protectedManual++;
  if (k.eligible) c.eligible++;
  if (k.eligible && k.problem) c.eligibleProblem++;
}

export async function buildInventory(ctx: Pick<Ctx, "db" | "retries" | "retryBaseMs">, cloneId?: string): Promise<Inventory> {
  const migrated = await isMigrated(ctx.db);
  const clones = await fetchClones(ctx.db);
  const slug = new Map(clones.map((c) => [c.id, c.slug]));
  const cells = new Map<string, InvCell>();
  const totals = { photos: emptyCell(), videos: emptyCell() };
  for (const table of MEDIA_TABLES) {
    for (const r of await fetchRows(ctx, table, migrated, cloneId)) {
      const key = `${slug.get(r.clone_id) ?? r.clone_id}\t${table}`;
      if (!cells.has(key)) cells.set(key, emptyCell());
      addToCell(cells.get(key)!, r);
      addToCell(totals[table], r);
    }
  }
  return {
    migrated,
    cells: [...cells.entries()].sort().map(([k, c]) => { const [clone, table] = k.split("\t"); return { clone, table: table as MediaTable, c }; }),
    totals,
  };
}

export function estimateCost(inv: Inventory, costPhoto: number, costVideo: number) {
  const all = inv.totals.photos.eligible * costPhoto + inv.totals.videos.eligible * costVideo;
  const problem = inv.totals.photos.eligibleProblem * costPhoto + inv.totals.videos.eligibleProblem * costVideo;
  return { all, problem };
}

export function formatInventory(inv: Inventory, costPhoto: number, costVideo: number): string {
  const head = ["clone", "type", "total", "legacy", "pend", "analysed", "review", "failed", "unanalysed", "failed-looking", "negated-desc", "manual-edit", "eligible", "elig+problem"];
  const rows = inv.cells.map(({ clone, table, c }) => [clone, table === "photos" ? "photo" : "video", c.total, c.legacy, c.pending, c.analysed, c.needs_review, c.failed, c.unanalysed, c.failedLooking, c.negated, c.protectedManual, c.eligible, c.eligibleProblem].map(String));
  const tot = (t: MediaTable) => { const c = inv.totals[t]; return ["ALL", t === "photos" ? "photo" : "video", c.total, c.legacy, c.pending, c.analysed, c.needs_review, c.failed, c.unanalysed, c.failedLooking, c.negated, c.protectedManual, c.eligible, c.eligibleProblem].map(String); };
  const all = [head, ...rows, tot("photos"), tot("videos")];
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((x, i) => (i < 2 ? x.padEnd(w[i]) : x.padStart(w[i]))).join("  ");
  const cost = estimateCost(inv, costPhoto, costVideo);
  const g = inv.totals.photos, v = inv.totals.videos;
  return [
    `schema migrated (analysis columns present): ${inv.migrated ? "yes" : "NO - every row is reported as legacy and manual-edit protection cannot be seen"}`,
    "",
    line(head), ...rows.map(line), line(w.map(() => "").map((_, i) => "-".repeat(w[i]))), line(tot("photos")), line(tot("videos")),
    "",
    "definitions: eligible = status legacy|pending|failed and not manually edited (these would be re-analysed);",
    "  unanalysed = no visual_description and no auto_desc; failed-looking = no tags, explicitness none, not nude, no auto_desc (what a failed call used to save);",
    "  negated-desc = visual_description has a sentence like 'not visible' / 'no ... shown'; manual-edit = metadata_edited_at set (never touched).",
    "",
    "COST ESTIMATE (assumption, not a quote; override with --cost-photo / --cost-video):",
    `  photo call = $${costPhoto} each, video contact-sheet call = $${costVideo} each`,
    `  scope all      : ${g.eligible} photos + ${v.eligible} videos = $${cost.all.toFixed(2)}`,
    `  scope problem  : ${g.eligibleProblem} photos + ${v.eligibleProblem} videos = $${cost.problem.toFixed(2)}`,
    "  (a retry of a transient failure costs one extra call; failed calls are usually billed too)",
  ].join("\n");
}

// ── validation + proposal ────────────────────────────────────────────────────
const TRI = new Set(["yes", "no", "unclear"]);
export function validateFields(f: any): string | null {
  if (!f || typeof f !== "object") return "no fields";
  if (typeof f.auto_desc !== "string") return "auto_desc not a string";
  if (!Array.isArray(f.tags) || f.tags.some((t: unknown) => typeof t !== "string")) return "tags not a string array";
  if (typeof f.visual_description !== "string" || !f.visual_description.trim()) return "empty visual_description";
  if (!["none", "suggestive", "explicit"].includes(f.explicitness)) return "bad explicitness";
  if (typeof f.is_nude !== "boolean" || typeof f.nsfw !== "boolean") return "is_nude/nsfw not boolean";
  const vf = f.visual_facts;
  if (!vf || vf.v !== ANALYSIS_VERSION || !vf.evidence || !Array.isArray(vf.visible)) return "bad visual_facts shape";
  for (const k of FACT_KEYS) if (!TRI.has(vf.evidence[k])) return `visual_facts.evidence.${k} not yes|no|unclear`;
  if (f.caption != null && typeof f.caption !== "string") return "caption not a string";
  return null;
}

// A sales caption that claims something the facts rule out ("no"). "unclear" is not a contradiction.
const CLAIM_WORDS: Partial<Record<(typeof FACT_KEYS)[number], RegExp>> = {
  nipples: /\bnipples?\b|\btit(s|ties)\b|\bboobs?\b/i,
  genitals: /\bpussy\b|\bvagina\b|\bvulva\b|\bclit\b|\bcock\b|\bdick\b|\blabia\b/i,
  anus: /\basshole\b|\banus\b|\bbutt ?hole\b/i,
  full_nudity: /\bnaked\b|\bnude\b|\bnothing on\b/i,
  sex_toy: /\bdildo\b|\bvibrator\b|\bsex toy\b|\bbuzz(ing|er)?\b/i,
  sexual_activity: /\bfuck(ing|ed)?\b|\briding\b|\bmasturbat\w*\b|\bcumming\b/i,
};
export function captionContradictsFacts(caption: string | null, facts: VisualFacts): boolean {
  if (!caption) return false;
  for (const [key, re] of Object.entries(CLAIM_WORDS)) {
    if (facts.evidence[key as keyof typeof facts.evidence] === "no" && re!.test(caption)) return true;
  }
  return false;
}

/** Key-order independent JSON (jsonb comes back with its keys reordered) with timestamps normalised (timestamptz comes back as +00:00). */
function canon(v: unknown): string {
  const norm = (x: any): any => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map((k) => [k, norm(x[k])]));
    if (typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:?\d\d)$/.test(x)) { const t = Date.parse(x); if (!Number.isNaN(t)) return new Date(t).toISOString(); }
    return x;
  };
  return JSON.stringify(norm(v ?? null));
}
const same = (a: unknown, b: unknown) => canon(a) === canon(b);

export type Proposal = {
  run: string; table: MediaTable; id: string; clone_id: string; clone_slug: string; storage_path: string;
  outcome: "proposed" | "unchanged" | "needs_review" | "failed";
  model: string; provider: string | null; costUsd: number | null; latencyMs: number;
  before: Record<string, unknown>; after: Record<string, unknown>; changed: string[];
  error?: string; premigration?: boolean; notes?: string[];
  /** ANALYSIS_VERSION of the code that made this proposal: apply refuses it if the code has moved on. */
  code_version?: number;
};

/** Status-only hold for a row whose repair stayed needs_review / failed: it stops being offered, every metadata field is kept. */
export type Hold = {
  run: string; table: MediaTable; id: string; clone_id: string; clone_slug: string; storage_path: string;
  outcome: "needs_review" | "failed"; reason: string; model: string; code_version: number;
  before: { analysis_status: string; analysis_error: string | null }; after: { analysis_status: "needs_review" | "failed"; analysis_error: string };
};
export const HOLD_FIELDS = ["analysis_status", "analysis_error"] as const;

export function buildProposal(ctx: Pick<Ctx, "runId" | "now">, table: MediaTable, row: Row, slug: string, res: AnalysisResult, migrated: boolean): Proposal {
  const base = {
    run: ctx.runId, table, id: row.id, clone_id: row.clone_id, clone_slug: slug, storage_path: row.storage_path,
    model: res.model, provider: res.provider, costUsd: res.costUsd, latencyMs: res.latencyMs, before: {}, after: {}, changed: [] as string[],
    code_version: ANALYSIS_VERSION,
    ...(migrated ? {} : { premigration: true }),
  };
  if (res.status === "failed" || !res.fields) return { ...base, outcome: "failed", error: res.error ?? "analysis failed" };
  const bad = validateFields(res.fields);
  if (bad) return { ...base, outcome: "failed", error: `invalid analysis result: ${bad}` };
  if (res.status === "needs_review") return { ...base, outcome: "needs_review", error: res.error ?? "analysis contradicts itself" };

  const f = res.fields;
  const visibilityReview = genitalVisibilityReviewReason(f.visual_facts.evidence, `${f.visual_description} ${f.visual_facts.visible.join(". ")}`);
  if (visibilityReview) return { ...base, outcome: "needs_review", error: visibilityReview };
  const paintedObjectReview = table === "photos" && paintedObjectReviewReason(`${f.visual_description} ${f.auto_desc} ${f.visual_facts.visible.join(". ")}`);
  if (paintedObjectReview) return { ...base, outcome: "needs_review", error: paintedObjectReview };
  const kneelingReview = table === "photos" && kneelingVisibilityReviewReason(`${f.visual_description} ${f.auto_desc}`, f.visual_facts.visible);
  if (kneelingReview) return { ...base, outcome: "needs_review", error: kneelingReview };
  // The field set and the state stamp come from the SAME helper the dashboard upload/import path uses (lib/media-analysis-row.ts),
  // so a repaired row is indistinguishable from a freshly uploaded one. Caption is the one exception: the stored sales caption is
  // kept unless it contradicts the facts.
  const mapped = analysisRowFields(res);
  const after: Record<string, unknown> = {};
  for (const k of CONTENT_FIELDS) if (k !== "caption") after[k] = mapped[k];
  // A contradicting stored caption is replaced only by a real new caption. If the analysis produced none, the OLD caption is
  // kept (never null) and the proposal says so: a contradicting caption is better than wiping the sales text.
  const notes: string[] = [];
  if (captionContradictsFacts(row.caption, f.visual_facts)) {
    if (f.caption?.trim()) after.caption = f.caption;
    else notes.push("caption contradicts the facts but no replacement caption was produced: old caption kept");
  }
  const changedContent = Object.keys(after).filter((k) => !same((row as any)[k], after[k]));
  const stamp: Record<string, unknown> = {};
  for (const k of STAMP_FIELDS) stamp[k] = mapped[k];
  stamp.analysed_at = (ctx.now?.() ?? new Date()).toISOString();
  const changed = [...changedContent, ...STAMP_FIELDS];
  const out: Record<string, unknown> = {}, prev: Record<string, unknown> = {};
  for (const k of changed) { out[k] = k in stamp ? (stamp as any)[k] : after[k]; prev[k] = (row as any)[k] ?? null; }
  return { ...base, outcome: "proposed", before: prev, after: out, changed, ...(notes.length ? { notes } : {}) };
}

// ── guarded writes ───────────────────────────────────────────────────────────
export function assertWritable(fields: string[], allowed: readonly string[] = WRITABLE_FIELDS) {
  for (const f of fields) {
    if ((NEVER_WRITE as readonly string[]).includes(f) || !allowed.includes(f)) throw new Error(`refusing to write column ${f}`);
  }
}

const pgArray = (a: string[]) => `{${a.map((s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
/** Adds "column currently equals this value" filters (null-safe, array- and jsonb-aware). */
export function guardOld(q: any, old: Record<string, unknown>): any {
  for (const [k, v] of Object.entries(old)) {
    if (v === null || v === undefined) q = q.is(k, null);
    else if (Array.isArray(v)) q = q.eq(k, pgArray(v as string[]));
    else if (typeof v === "object") q = q.eq(k, JSON.stringify(v));
    else q = q.eq(k, v);
  }
  return q;
}

// ── state files ──────────────────────────────────────────────────────────────
type StateEntry = { key: string; status: string; at: string; detail?: string };
const file = (ctx: Pick<Ctx, "stateDir">, n: string) => path.join(ctx.stateDir, n);
function ensureDir(ctx: Pick<Ctx, "stateDir">) { mkdirSync(ctx.stateDir, { recursive: true }); }
/** Appends one line and fsyncs it, so a backup / intent / state line has reached the disk before the caller goes on. */
function append(f: string, obj: unknown) {
  const fd = openSync(f, "a");
  try { writeSync(fd, JSON.stringify(obj) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
}
function readJsonl<T>(f: string): T[] {
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
}

/** `conflict` marks a backup line whose guarded write matched 0 rows AND the row held neither the old nor the new values. */
type ConflictRec = { kind: "conflict"; table: string; id: string; run: string; at: string };
type BackupRec = { kind: "row" | "item"; table: MediaTable | "photo_bundle_items"; id: string; clone_id: string; storage_path: string; before: Record<string, unknown>; after: Record<string, unknown>; run: string; at: string; hold?: true };

// ── row processing ───────────────────────────────────────────────────────────
export type Mode = "preview" | "apply";
export type RunOpts = {
  mode: Mode; cloneSlug?: string; table?: MediaTable; scope: "all" | "problem"; statuses?: string[]; limit?: number; spread?: boolean;
  /** on resume, do not retry rows that failed earlier in this run (default: retry them) */
  skipFailed?: boolean;
  /** apply only: the reviewed preview.jsonl to apply (holds.jsonl is read from the same folder). Apply never calls the model. */
  preview?: string;
  /** apply only: reviewed operator hold list (bound by sha256 to the preview). Listed rows get a status-only hold instead of their proposal. */
  holdList?: string;
};
export type RunSummary = {
  mode: Mode; migrated: boolean; selected: number; skippedDone: number;
  proposed: number; applied: number; unchanged: number; conflicts: number; failed: number; needsReview: number; itemsUpdated: number; itemConflicts: number;
  holds: number; holdsApplied: number; recovered: number; alreadyApplied: number; conflictReasons: string[];
  /** apply: sha256 of the reviewed preview and of the operator hold list used (null when none); operatorHolds = list entries accepted */
  previewSha256: string | null; holdListSha256: string | null; operatorHolds: number;
  costUsd: number; errors: string[]; notes: string[];
};
const newSummary = (mode: Mode, migrated: boolean): RunSummary => ({
  mode, migrated, selected: 0, skippedDone: 0, proposed: 0, applied: 0, unchanged: 0, conflicts: 0, failed: 0, needsReview: 0, itemsUpdated: 0, itemConflicts: 0,
  holds: 0, holdsApplied: 0, recovered: 0, alreadyApplied: 0, conflictReasons: [], previewSha256: null, holdListSha256: null, operatorHolds: 0, costUsd: 0, errors: [], notes: [],
});

function selectRows(rows: { table: MediaTable; row: Row; slug: string }[], opts: RunOpts) {
  const keep = rows.filter(({ row }) => {
    const k = classify(row);
    if (!k.eligible) return false;
    if (opts.statuses && !opts.statuses.includes(row.analysis_status)) return false;
    return opts.scope === "all" || k.problem;
  });
  // never-analysed / failed rows first (they carry the worst data), then negated, then the rest; stable by id
  const rank = (r: Row) => { const k = classify(r); return k.unanalysed || k.failedLooking || r.analysis_status !== "legacy" ? 0 : k.negated ? 1 : 2; };
  keep.sort((a, b) => rank(a.row) - rank(b.row) || (a.row.id < b.row.id ? -1 : 1));
  if (!opts.spread) return keep;
  const byClone = new Map<string, typeof keep>();
  for (const x of keep) { const l = byClone.get(x.row.clone_id) ?? []; l.push(x); byClone.set(x.row.clone_id, l); }
  const lists = [...byClone.values()], out: typeof keep = [];
  for (let i = 0; out.length < keep.length; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

async function pool<T>(items: T[], n: number, worker: (x: T) => Promise<void>) {
  let next = 0, failed: unknown = null;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, n), items.length) }, async () => {
    while (next < items.length && !failed) {
      const x = items[next++];
      try { await worker(x); } catch (e) { failed = e; }
    }
  }));
  if (failed) throw failed;
}

async function analyseRow(ctx: Ctx, table: MediaTable, row: Row, model: string | null): Promise<AnalysisResult> {
  const bytes = await withRetry(() => ctx.download(row.storage_path), ctx.retries + 1, { baseMs: ctx.retryBaseMs });
  let res!: AnalysisResult;
  for (let attempt = 0; attempt <= ctx.retries; attempt++) {
    try { res = await ctx.analyse(table, bytes, model); }
    catch (e) { res = { status: "failed", model: model ?? "unknown", provider: null, latencyMs: 0, costUsd: null, error: String((e as Error)?.message ?? e), version: ANALYSIS_VERSION }; }
    if (res.status !== "failed" || !TRANSIENT_ERROR.test(res.error ?? "")) break;
    await new Promise((r) => setTimeout(r, (ctx.retryBaseMs ?? 1500) * 2 ** attempt));
  }
  return res;
}

const holdsValues = (row: Record<string, unknown>, vals: Record<string, unknown>) => Object.entries(vals).every(([k, v]) => same(row[k], v));

/**
 * One guarded row write with a durable intent/backup line first and read-back reconciliation after:
 *  - the backup line (before + after) is fsynced BEFORE the write, so it doubles as the write-intent record;
 *  - 1 row matched                     -> "applied"
 *  - 0 rows, or the response was lost  -> the row is READ BACK: already holds the proposed values (+ stamp) -> "recovered" (the write
 *    landed, only the answer got lost); holds neither the old nor the new values -> "conflict"; still holds the old values after a
 *    transport error -> the error is rethrown (nothing landed; a resume retries from the same proposal).
 */
async function writeGuarded(ctx: Ctx, rec: { table: MediaTable; id: string; clone_id: string; storage_path: string; before: Record<string, unknown>; after: Record<string, unknown>; guard?: Record<string, unknown> }, key: string, hold = false): Promise<"applied" | "recovered" | "conflict"> {
  assertWritable(Object.keys(rec.after));
  append(file(ctx, "backup.jsonl"), { kind: "row", table: rec.table, id: rec.id, clone_id: rec.clone_id, storage_path: rec.storage_path, before: rec.before, after: rec.after, run: ctx.runId, at: new Date().toISOString(), ...(hold ? { hold: true as const } : {}) } satisfies BackupRec);
  await ctx.step?.("after_backup", key);
  // guard on every changed content field's old value + the status + the version; stamp timestamps/model need not match
  const guardFields = Object.fromEntries(Object.entries(rec.guard ?? rec.before).filter(([k]) => (CONTENT_FIELDS as readonly string[]).includes(k) || k === "analysis_status" || k === "analysis_version"));
  let q: any = ctx.db.from(rec.table).update(rec.after).eq("id", rec.id).eq("clone_id", rec.clone_id).eq("storage_path", rec.storage_path).is("metadata_edited_at", null);
  q = guardOld(q, guardFields).select("id");
  let matched = 0, err: Error | null = null;
  try {
    const r = await withRetry(async () => { const x = await q; if (x.error && TRANSIENT_ERROR.test(x.error.message)) throw new Error(x.error.message); return x; }, ctx.retries + 1, { baseMs: ctx.retryBaseMs });
    if (r.error) err = new Error(`update ${rec.table}/${rec.id}: ${r.error.message}`); else matched = (r.data ?? []).length;
  } catch (e) { err = e as Error; }
  await ctx.step?.("after_write", key);
  if (!err && matched === 1) { await ctx.step?.("after_ack", key); return "applied"; }
  // ambiguous (lost response) or 0 rows: look at the row instead of guessing
  const cols = [...new Set(["id", "clone_id", "storage_path", "metadata_edited_at", ...Object.keys(rec.after), ...Object.keys(guardFields)])].join(",");
  const rb = await withRetry(async () => { const x: any = await ctx.db.from(rec.table).select(cols).eq("id", rec.id); if (x.error) throw new Error(x.error.message); return x; }, ctx.retries + 1, { baseMs: ctx.retryBaseMs }).catch(() => null);
  const cur = rb ? ((rb.data ?? [])[0] as Record<string, unknown> | undefined) : undefined;
  if (rb === null && err) throw err;
  if (cur && holdsValues(cur, rec.after)) return "recovered";
  if (err && cur && !cur.metadata_edited_at && holdsValues(cur, guardFields)) throw err; // nothing landed
  if (err && !cur) throw err;
  append(file(ctx, "backup.jsonl"), { kind: "conflict", table: rec.table, id: rec.id, run: ctx.runId, at: new Date().toISOString() } satisfies ConflictRec);
  return "conflict";
}

/** Copies the corrected values onto photo_bundle_items with the same storage_path (same clone), guarded on each item's current values. */
async function syncItems(ctx: Ctx, rec: { clone_id: string; storage_path: string; after: Record<string, unknown> }, sum: RunSummary, key = "") {
  const patch = Object.fromEntries(Object.entries(rec.after).filter(([k]) => (ITEM_FIELDS as readonly string[]).includes(k)));
  if (!Object.keys(patch).length) return;
  assertWritable(Object.keys(patch), ITEM_FIELDS);
  const { data: items, error } = await ctx.db.from("photo_bundle_items")
    .select("id, storage_path, caption, auto_desc, tags, visual_description, photo_bundles!inner(clone_id)")
    .eq("storage_path", rec.storage_path).eq("photo_bundles.clone_id", rec.clone_id);
  if (error) throw new Error(`read photo_bundle_items: ${error.message}`);
  for (const it of (items ?? []) as any[]) {
    const changed = Object.keys(patch).filter((k) => !same(it[k] ?? (k === "tags" ? [] : null), patch[k]));
    if (!changed.length) continue;
    const before = Object.fromEntries(changed.map((k) => [k, it[k] ?? null]));
    const after = Object.fromEntries(changed.map((k) => [k, patch[k]]));
    append(file(ctx, "backup.jsonl"), { kind: "item", table: "photo_bundle_items", id: it.id, clone_id: rec.clone_id, storage_path: rec.storage_path, before, after, run: ctx.runId, at: new Date().toISOString() } satisfies BackupRec);
    await ctx.step?.("item_after_backup", key);
    let q: any = ctx.db.from("photo_bundle_items").update(after).eq("id", it.id);
    q = guardOld(q, before).select("id");
    let matched = 0, err: Error | null = null;
    try { const r = await q; if (r.error) err = new Error(`update photo_bundle_items/${it.id}: ${r.error.message}`); else matched = (r.data ?? []).length; } catch (e) { err = e as Error; }
    if (!err && matched === 1) { sum.itemsUpdated++; continue; }
    // lost response or 0 rows: read the item back; already holding the corrected values means the write landed
    const cur: any = await ctx.db.from("photo_bundle_items").select(Object.keys(after).join(",")).eq("id", it.id).then((x: any) => (x.error ? null : (x.data ?? [])[0]), () => null);
    if (cur && holdsValues(cur, after)) { sum.itemsUpdated++; continue; }
    if (err && cur && holdsValues(cur, before)) throw err;
    if (err && !cur) throw err;
    sum.itemConflicts++;
    append(file(ctx, "backup.jsonl"), { kind: "conflict", table: "photo_bundle_items", id: it.id, run: ctx.runId, at: new Date().toISOString() } satisfies ConflictRec);
  }
}

// ── preview file (the reviewed proposals an apply is allowed to write) ───────
export type LoadedPreview = { proposals: Proposal[]; holds: Hold[]; file: string; sha256: string };
export function loadPreview(f: string): LoadedPreview {
  if (!f || !existsSync(f)) throw new Error(`apply needs a reviewed preview: ${f ? `file not found: ${f}` : "pass --preview <run id or preview.jsonl>"}`);
  const proposals = new Map<string, Proposal>();
  for (const p of readJsonl<Proposal>(f)) {
    if (p.outcome !== "proposed") continue;
    const key = `${p.table}:${p.id}`;
    if (proposals.has(key)) throw new Error(`preview is ambiguous: two proposals for ${key}`);
    proposals.set(key, p);
  }
  const holds = new Map<string, Hold>();
  for (const h of readJsonl<Hold>(path.join(path.dirname(f), "holds.jsonl"))) holds.set(`${h.table}:${h.id}`, h); // a re-run of a failed row: last line wins
  for (const k of proposals.keys()) holds.delete(k); // a row that later got a real proposal is not held
  const hash = createHash("sha256");
  hash.update(readFileSync(f));
  return { proposals: [...proposals.values()], holds: [...holds.values()], file: f, sha256: hash.digest("hex") };
}

// ── operator hold list ───────────────────────────────────────────────────────
/** A reviewer's decision to hold a known-incorrect proposal. preview_sha256 binds the entry to the exact preview it was reviewed against. */
export type HoldListEntry = { table: MediaTable; id: string; reason: string; reviewer?: string; preview_sha256: string };
export type LoadedHoldList = { entries: HoldListEntry[]; file: string; sha256: string };
export const OPERATOR_HOLD_PREFIX = "operator hold: ";

/** Adds the preview hash to review entries ({table,id,reason,reviewer?}); the preview file itself is only read. */
export function bindHoldList(previewFile: string, entries: { table: string; id: string; reason: string; reviewer?: string }[]): HoldListEntry[] {
  const sha = loadPreview(previewFile).sha256;
  return entries.map((e) => ({ table: e.table as MediaTable, id: e.id, reason: e.reason, ...(e.reviewer ? { reviewer: e.reviewer } : {}), preview_sha256: sha }));
}

/** JSON array or JSONL. Refuses (throws, before anything is written) a list that is malformed, has duplicates, or was reviewed against another preview. */
export function loadHoldList(f: string, previewSha256: string): LoadedHoldList {
  if (!existsSync(f)) throw new Error(`hold list not found: ${f}`);
  const raw = readFileSync(f);
  const text = raw.toString("utf8").trim();
  let list: any[];
  try { list = text.startsWith("[") ? JSON.parse(text) : text.split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
  catch (e) { throw new Error(`hold list is not valid JSON/JSONL: ${(e as Error).message}`); }
  if (!Array.isArray(list) || !list.length) throw new Error("hold list is empty");
  const seen = new Set<string>();
  for (const e of list) {
    if (!e || !(MEDIA_TABLES as string[]).includes(e.table) || typeof e.id !== "string" || !e.id) throw new Error(`hold list entry has no valid table/id: ${JSON.stringify(e)}`);
    if (typeof e.reason !== "string" || !e.reason.trim()) throw new Error(`hold list entry ${e.table}:${e.id} has no reason`);
    if (typeof e.preview_sha256 !== "string" || !e.preview_sha256) throw new Error(`hold list entry ${e.table}:${e.id} is not bound to a preview (no preview_sha256)`);
    if (e.preview_sha256 !== previewSha256) throw new Error(`hold list refused: ${e.table}:${e.id} was reviewed against preview ${e.preview_sha256.slice(0, 12)}, this preview is ${previewSha256.slice(0, 12)}`);
    const k = `${e.table}:${e.id}`;
    if (seen.has(k)) throw new Error(`hold list names ${k} twice`);
    seen.add(k);
  }
  return { entries: list as HoldListEntry[], file: f, sha256: createHash("sha256").update(raw).digest("hex") };
}

/**
 * Turns the reviewed preview (+ optional hold list) into the items apply will write. A listed id becomes a status-only hold in place of its
 * proposal; an id that is in neither the proposals nor the preview holds is returned in `unknown` (reported as a conflict, never skipped).
 * The hold's before = the row's status + error as the reviewer saw them (from the proposal), guard = the proposal's whole before snapshot.
 */
export function resolveItems(pv: LoadedPreview, hl?: LoadedHoldList): { items: Item[]; unknown: HoldListEntry[]; operatorHolds: number } {
  const map = new Map<string, Item>();
  for (const p of pv.proposals) map.set(`${p.table}:${p.id}`, { kind: "proposal", table: p.table, id: p.id, clone_id: p.clone_id, clone_slug: p.clone_slug, storage_path: p.storage_path, before: p.before, after: p.after, code_version: p.code_version });
  const hkey = (t: string, i: string) => `${t}:${i}#hold`;
  for (const h of pv.holds) map.set(hkey(h.table, h.id), { kind: "hold", table: h.table, id: h.id, clone_id: h.clone_id, clone_slug: h.clone_slug, storage_path: h.storage_path, before: h.before, after: h.after, code_version: h.code_version });
  const unknown: HoldListEntry[] = [];
  let operatorHolds = 0;
  for (const e of hl?.entries ?? []) {
    const reason = (OPERATOR_HOLD_PREFIX + e.reason.trim()).slice(0, 500);
    const prop = map.get(`${e.table}:${e.id}`), ph = map.get(hkey(e.table, e.id));
    const src = prop ?? ph;
    if (!src) { unknown.push(e); continue; }
    const cur = src.before;
    if (!("analysis_status" in cur)) { unknown.push({ ...e, reason: `${e.reason} (reviewed proposal carries no analysis_status)` }); continue; }
    map.delete(`${e.table}:${e.id}`);
    map.set(hkey(e.table, e.id), {
      kind: "hold", operator: true, table: src.table, id: src.id, clone_id: src.clone_id, clone_slug: src.clone_slug, storage_path: src.storage_path,
      before: { analysis_status: cur.analysis_status, analysis_error: cur.analysis_error ?? null },
      guard: prop ? prop.before : ph!.before,
      after: { analysis_status: "needs_review", analysis_error: reason }, code_version: src.code_version,
    });
    operatorHolds++;
  }
  return { items: [...map.values()], unknown, operatorHolds };
}

export type Item = { kind: "proposal" | "hold"; table: MediaTable; id: string; clone_id: string; clone_slug: string; storage_path: string; before: Record<string, unknown>; after: Record<string, unknown>; code_version?: number;
  /** operator hold only: the reviewed proposal's full "before" snapshot. The row must still equal it (conflict otherwise); the hold's own before is only status+error. */
  guard?: Record<string, unknown>; operator?: true };

/** Why a reviewed item may NOT be written now (null = still exactly what was reviewed). Nothing is written for a row that returns a reason. */
export function bindConflict(it: Item, row: Row | undefined, clone: CloneInfo | undefined): string | null {
  if (!(MEDIA_TABLES as string[]).includes(it.table)) return `unknown table ${it.table}`;
  if (!row) return "row no longer exists";
  if (it.code_version !== ANALYSIS_VERSION) return `processing version changed (preview ${it.code_version ?? "unknown"}, code ${ANALYSIS_VERSION}): fresh preview needed`;
  if (row.clone_id !== it.clone_id) return "creator mismatch: the row belongs to another clone than the preview";
  if (!clone || clone.id !== it.clone_id || clone.slug !== it.clone_slug) return `creator mismatch: clone ${it.clone_slug} is not the clone of this row`;
  if (row.storage_path !== it.storage_path) return "file changed: storage_path differs from the preview";
  if (row.metadata_edited_at) return "row was manually edited since the preview";
  try { assertWritable(Object.keys(it.after), it.kind === "hold" ? HOLD_FIELDS : WRITABLE_FIELDS); } catch (e) { return `invalid proposal: ${(e as Error).message}`; }
  if (!classify(row).eligible) return `row status is now ${row.analysis_status}`;
  for (const [k, v] of Object.entries(it.guard ?? it.before)) if (!same((row as any)[k], v)) return `${k} changed since the preview`;
  if (it.kind === "hold") {
    // an operator hold applies to any eligible row still in the status the reviewer saw (legacy, pending or failed; never analysed/manual);
    // a preview-generated hold keeps its original rule: legacy only.
    if (!it.operator && row.analysis_status !== "legacy") return `row status is now ${row.analysis_status} (a hold only applies to a legacy row)`;
    if (!["needs_review", "failed"].includes(String(it.after.analysis_status))) return "invalid hold: bad status";
    if (typeof it.after.analysis_error !== "string" || !it.after.analysis_error) return "invalid hold: no reason";
    return null;
  }
  if (it.after.analysis_status !== "analysed") return "invalid proposal: not an analysed result";
  if (it.after.analysis_version !== ANALYSIS_VERSION) return `proposal version ${String(it.after.analysis_version)} is not the code's ${ANALYSIS_VERSION}`;
  if ("caption" in it.after && (it.after.caption === null || typeof it.after.caption !== "string")) return "invalid proposal: caption would be nulled";
  const merged: any = { ...row, ...it.after };
  const bad = validateFields({ ...merged, auto_desc: merged.auto_desc ?? "" });
  if (bad) return `invalid proposal: ${bad}`;
  const visibilityReview = genitalVisibilityReviewReason(merged.visual_facts.evidence, `${merged.visual_description} ${merged.visual_facts.visible.join(". ")}`);
  if (visibilityReview) return `proposal requires fresh review: ${visibilityReview}`;
  const paintedObjectReview = it.table === "photos" && paintedObjectReviewReason(`${merged.visual_description} ${merged.auto_desc} ${merged.visual_facts.visible.join(". ")}`);
  if (paintedObjectReview) return `proposal requires fresh review: ${paintedObjectReview}`;
  const kneelingReview = it.table === "photos" && kneelingVisibilityReviewReason(`${merged.visual_description} ${merged.auto_desc}`, merged.visual_facts.visible);
  if (kneelingReview) return `proposal requires fresh review: ${kneelingReview}`;
  return null;
}

async function fetchByIds(ctx: Pick<Ctx, "db" | "retries" | "retryBaseMs">, table: MediaTable, ids: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data } = await withRetry(async () => { const r = await ctx.db.from(table).select(selectList(true)).in("id", chunk); if (r.error) throw new Error(`read ${table}: ${r.error.message}`); return r; }, ctx.retries + 1, { baseMs: ctx.retryBaseMs });
    for (const r of (data ?? []) as any[]) out.push(normaliseRow(r));
  }
  return out;
}

function finish(ctx: Ctx, sum: RunSummary) {
  writeFileSync(file(ctx, "report.txt"), formatSummary(sum) + (sum.errors.length ? "\n\nFAILURES\n" + sum.errors.join("\n") : "") + (sum.conflictReasons.length ? "\n\nCONFLICTS (nothing written for these; run a fresh preview)\n" + sum.conflictReasons.join("\n") : "") + (sum.notes.length ? "\n\nNOTES\n" + sum.notes.join("\n") : "") + "\n");
}

export async function runRepair(ctx: Ctx, opts: RunOpts): Promise<RunSummary> {
  ensureDir(ctx);
  ctx.concurrency = Math.min(ctx.concurrency, MAX_CONCURRENCY);
  const migrated = await isMigrated(ctx.db);
  if (opts.mode === "apply" && !migrated) {
    throw new Error("refusing to apply: migration 20261012000000 (analysis columns, incl. the metadata_edited_at manual-edit guard) is not applied on this database");
  }
  if (opts.mode === "apply") return applyPreview(ctx, opts, migrated);
  const sum = newSummary(opts.mode, migrated);

  const clones = await fetchClones(ctx.db);
  const bySlug = new Map(clones.map((c) => [c.slug, c]));
  const byId = new Map(clones.map((c) => [c.id, c]));
  let cloneId: string | undefined;
  if (opts.cloneSlug) { cloneId = bySlug.get(opts.cloneSlug)?.id; if (!cloneId) throw new Error(`no clone with slug ${opts.cloneSlug}`); }

  const stateFile = file(ctx, "state.jsonl");
  const state = readJsonl<StateEntry>(stateFile);
  const doneKeys = new Set(state.filter((s) => ["needs_review", "proposed", ...(opts.skipFailed ? ["failed"] : [])].includes(s.status)).map((s) => s.key));
  const mark = (key: string, status: string, detail?: string) => append(stateFile, { key, status, at: new Date().toISOString(), detail } satisfies StateEntry);

  const all: { table: MediaTable; row: Row; slug: string }[] = [];
  for (const table of opts.table ? [opts.table] : MEDIA_TABLES) {
    for (const row of await fetchRows(ctx, table, migrated, cloneId)) all.push({ table, row, slug: byId.get(row.clone_id)?.slug ?? row.clone_id });
  }
  let picked = selectRows(all, opts).filter((x) => { const done = doneKeys.has(`${x.table}:${x.row.id}`); if (done) sum.skippedDone++; return !done; });
  if (opts.limit !== undefined) picked = picked.slice(0, opts.limit);
  sum.selected = picked.length;
  ctx.log(`${opts.mode}: ${picked.length} rows selected (${sum.skippedDone} already done in this run), concurrency ${ctx.concurrency}, migrated=${migrated}`);

  let n = 0;
  await pool(picked, ctx.concurrency, async ({ table, row, slug }) => {
    const key = `${table}:${row.id}`;
    const model = configuredVisionModel(byId.get(row.clone_id), table === "photos" ? "photo" : "video");
    const res = await analyseRow(ctx, table, row, model);
    const p = buildProposal(ctx, table, row, slug, res, migrated);
    sum.costUsd += p.costUsd ?? 0;
    for (const note of p.notes ?? []) sum.notes.push(`${key}: ${note}`);
    if (p.outcome === "failed" || p.outcome === "needs_review") {
      if (p.outcome === "failed") { sum.failed++; sum.errors.push(`${key}: ${p.error}`); } else sum.needsReview++;
      append(file(ctx, "failed.jsonl"), { key, clone: slug, storage_path: row.storage_path, error: p.outcome === "failed" ? p.error : `needs_review: ${p.error}`, at: new Date().toISOString() });
      // an unresolved LEGACY row gets a status-only hold so it stops being offered; its metadata is never part of the hold
      if (row.analysis_status === "legacy") {
        const reason = String(p.error ?? p.outcome).slice(0, 500) || p.outcome;
        const hold: Hold = {
          run: ctx.runId, table, id: row.id, clone_id: row.clone_id, clone_slug: slug, storage_path: row.storage_path, outcome: p.outcome, reason, model: p.model,
          code_version: ANALYSIS_VERSION, before: { analysis_status: row.analysis_status, analysis_error: row.analysis_error },
          after: { analysis_status: p.outcome, analysis_error: reason },
        };
        append(file(ctx, "holds.jsonl"), hold);
        sum.holds++;
      }
      mark(key, p.outcome, p.error);
    } else {
      sum.proposed++;
      append(file(ctx, "preview.jsonl"), p);
      mark(key, "proposed");
    }
    n++;
    await ctx.afterRow?.(n);
  });

  finish(ctx, sum);
  return sum;
}

/**
 * Apply = write exactly what the reviewed preview says, and nothing else. No download, no model call. Each proposal is bound to its
 * row id, clone, table, storage_path, processing version and the previous values; if any moved the row is a conflict and nothing is
 * written for it (a fresh preview is needed). The old guards (allow-list, metadata_edited_at is null, old-value guards) still apply.
 */
async function applyPreview(ctx: Ctx, opts: RunOpts, migrated: boolean): Promise<RunSummary> {
  const pv = loadPreview(opts.preview ?? "");
  // operator hold list: bound to THIS preview's hash; a mismatch refuses the whole apply before anything is written
  const hl = opts.holdList ? loadHoldList(opts.holdList, pv.sha256) : undefined;
  const sum = newSummary("apply", migrated);
  const clones = await fetchClones(ctx.db);
  const bySlug = new Map(clones.map((c) => [c.slug, c]));
  const byId = new Map(clones.map((c) => [c.id, c]));
  if (opts.cloneSlug && !bySlug.has(opts.cloneSlug)) throw new Error(`no clone with slug ${opts.cloneSlug}`);
  writeFileSync(file(ctx, "preview.used.jsonl"), readFileSync(pv.file));
  sum.notes.push(`applied preview ${pv.file} sha256 ${pv.sha256}: ${pv.proposals.length} proposals, ${pv.holds.length} holds`);

  const stateFile = file(ctx, "state.jsonl");
  const state = readJsonl<StateEntry>(stateFile);
  const TERMINAL = new Set(["applied", "recovered", "conflict", "already_applied"]);
  const doneKeys = new Set(state.filter((s) => TERMINAL.has(s.status)).map((s) => s.key));
  const mark = (key: string, status: string, detail?: string) => append(stateFile, { key, status, at: new Date().toISOString(), detail } satisfies StateEntry);

  const resolved = resolveItems(pv, hl);
  sum.previewSha256 = pv.sha256; sum.holdListSha256 = hl?.sha256 ?? null; sum.operatorHolds = resolved.operatorHolds;
  if (hl) {
    writeFileSync(file(ctx, "hold-list.used.json"), readFileSync(hl.file));
    sum.notes.push(`operator hold list ${hl.file} sha256 ${hl.sha256}: ${hl.entries.length} entries, ${resolved.operatorHolds} accepted, ${resolved.unknown.length} unknown`);
  }
  for (const u of resolved.unknown) {
    const why = `operator hold ${u.table}:${u.id}: not in the reviewed preview (unknown id), nothing written (${u.reason})`;
    sum.conflicts++; sum.conflictReasons.push(why); ctx.log(`conflict ${why}`);
  }
  let items: Item[] = resolved.items.filter((it) => (!opts.table || it.table === opts.table) && (!opts.cloneSlug || it.clone_slug === opts.cloneSlug));
  items.sort((a, b) => (a.table + a.id < b.table + b.id ? -1 : 1));
  if (opts.limit !== undefined) items = items.slice(0, opts.limit);
  const stateKey = (it: Item) => `${it.table}:${it.id}${it.kind === "hold" ? "#hold" : ""}`;

  const rowsOf = new Map<string, Row>();
  for (const table of MEDIA_TABLES) {
    for (const r of await fetchByIds(ctx, table, items.filter((i) => i.table === table).map((i) => i.id))) rowsOf.set(`${table}:${r.id}`, r);
  }

  // resume: rows whose intent line exists but whose outcome was never recorded (crash after backup / after write / before ack)
  const backups = readJsonl<BackupRec | ConflictRec>(file(ctx, "backup.jsonl"));
  const lastRow = new Map<string, BackupRec>();
  for (const b of backups) if (b.kind === "row") lastRow.set(`${b.table}:${b.id}${b.hold ? "#hold" : ""}`, b);
  for (const [key, b] of lastRow) {
    if (doneKeys.has(key)) continue;
    const cur = rowsOf.get(key.replace("#hold", ""));
    if (cur && holdsValues(cur as any, b.after)) { sum.recovered++; mark(key, "recovered", "found written after an interruption"); doneKeys.add(key); ctx.log(`recovered ${key}: write had landed`); }
  }
  // resume: rows applied/recovered whose bundle-item copy did not finish (items are copied again, guarded, so it is idempotent)
  const st2 = readJsonl<StateEntry>(stateFile);
  const itemsDone = new Set(st2.filter((s) => s.status === "items_done").map((s) => s.key));
  const wrote = new Set(st2.filter((s) => s.status === "applied" || s.status === "recovered").map((s) => s.key));
  for (const [key, b] of lastRow) {
    if (b.table === "photos" && !b.hold && wrote.has(key) && !itemsDone.has(key)) {
      await syncItems(ctx, b, sum, key); mark(key, "items_done"); itemsDone.add(key);
    }
  }

  const todo = items.filter((it) => { const d = doneKeys.has(stateKey(it)); if (d) sum.skippedDone++; return !d; });
  sum.selected = todo.length;
  ctx.log(`apply: ${todo.length} reviewed rows (${sum.skippedDone} already done in this run), concurrency ${ctx.concurrency}, preview ${pv.sha256.slice(0, 12)}`);
  let n = 0;
  await pool(todo, ctx.concurrency, async (it) => {
    const key = stateKey(it), rowKey = `${it.table}:${it.id}`;
    const row = rowsOf.get(rowKey);
    if (row && holdsValues(row as any, it.after) && (it.kind === "hold" || row.analysis_status === "analysed")) {
      sum.alreadyApplied++; mark(key, "already_applied"); // a repeat apply of the same preview is a no-op
    } else {
      const why = bindConflict(it, row, byId.get(it.clone_id));
      if (why) {
        sum.conflicts++; sum.conflictReasons.push(`${key}: ${why}`); mark(key, "conflict", why); ctx.log(`conflict ${key}: ${why}`);
      } else {
        const r = await writeGuarded(ctx, it, key, it.kind === "hold");
        if (r === "conflict") { sum.conflicts++; sum.conflictReasons.push(`${key}: row changed while writing`); mark(key, "conflict", "row changed while writing"); ctx.log(`conflict ${key}: row changed, left untouched`); }
        else {
          if (r === "applied") { it.kind === "hold" ? sum.holdsApplied++ : sum.applied++; } else sum.recovered++;
          mark(key, r);
          await ctx.step?.("before_items", key);
          if (it.table === "photos" && it.kind === "proposal") { await syncItems(ctx, it, sum, key); await ctx.step?.("after_items", key); mark(key, "items_done"); }
        }
      }
    }
    n++;
    await ctx.afterRow?.(n);
  });
  finish(ctx, sum);
  return sum;
}

// ── tammy-style pilot: inventory + preview for ONE clone's photos, with a plan a person can read ───────────────
export async function runPilot(ctx: Ctx, cloneSlug: string, expect?: number): Promise<{ summary: RunSummary; plan: string; planFile: string }> {
  ensureDir(ctx);
  const clones = await fetchClones(ctx.db);
  const clone = clones.find((c) => c.slug === cloneSlug);
  if (!clone) throw new Error(`no clone with slug ${cloneSlug}`);
  const migrated = await isMigrated(ctx.db);
  const photos = await fetchRows(ctx, "photos", migrated, clone.id);
  if (expect !== undefined && photos.length !== expect) throw new Error(`pilot: ${cloneSlug} has ${photos.length} photos, expected ${expect}: refusing to preview a different set`);
  const inv = await buildInventory(ctx, clone.id);
  const summary = await runRepair(ctx, { mode: "preview", cloneSlug, table: "photos", scope: "all" });
  const proposals = readJsonl<Proposal>(file(ctx, "preview.jsonl")).filter((p) => p.outcome === "proposed");
  const holds = readJsonl<Hold>(file(ctx, "holds.jsonl"));
  const plan = formatPilotPlan(cloneSlug, photos, proposals, holds, formatInventory(inv, ctx.costPhoto, ctx.costVideo), ctx.runId, summary);
  const planFile = file(ctx, "PILOT-PLAN.txt");
  writeFileSync(planFile, plan + "\n");
  writeFileSync(file(ctx, "rows-before.json"), JSON.stringify(photos, null, 1));
  return { summary, plan, planFile };
}

/** What an operator hold list does to a pilot plan: ids held (with the reviewer's reason), unknown ids, and the two hashes it is bound by. */
export type PlanHolds = { held: Map<string, string>; unknown: { table: string; id: string; reason: string }[]; previewSha256: string; holdListSha256: string; conflicts?: Map<string, string> };

/**
 * Plan from a SAVED reviewed preview + an operator hold list: no model call, no write (reads rows only). Prints exactly which proposals apply
 * and which are held with their reasons, and flags anything that would conflict against the rows as they are now.
 */
export async function planPilotFromPreview(ctx: Ctx, cloneSlug: string, previewFile: string, holdListFile: string): Promise<{ plan: string; planFile: string; previewSha256: string; holdListSha256: string }> {
  ensureDir(ctx);
  const clones = await fetchClones(ctx.db);
  const clone = clones.find((c) => c.slug === cloneSlug);
  if (!clone) throw new Error(`no clone with slug ${cloneSlug}`);
  const migrated = await isMigrated(ctx.db);
  const photos = await fetchRows(ctx, "photos", migrated, clone.id);
  const pv = loadPreview(previewFile);
  const hl = loadHoldList(holdListFile, pv.sha256);
  const { items, unknown } = resolveItems(pv, hl);
  const rowBy = new Map(photos.map((r) => [r.id, r]));
  const conflicts = new Map<string, string>();
  for (const it of items) { const why = bindConflict(it, rowBy.get(it.id), clone); if (why) conflicts.set(it.id, why); }
  const held = new Map(items.filter((i) => i.operator).map((i) => [i.id, String(i.after.analysis_error).slice(OPERATOR_HOLD_PREFIX.length)]));
  const inv = await buildInventory(ctx, clone.id);
  const sum = newSummary("preview", migrated);
  const plan = formatPilotPlan(cloneSlug, photos, pv.proposals.filter((p) => p.clone_id === clone.id), pv.holds.filter((h) => h.clone_id === clone.id), formatInventory(inv, ctx.costPhoto, ctx.costVideo), ctx.runId, sum,
    { held, unknown, previewSha256: pv.sha256, holdListSha256: hl.sha256, conflicts });
  const planFile = file(ctx, "PILOT-PLAN.txt");
  writeFileSync(planFile, plan + "\n");
  return { plan, planFile, previewSha256: pv.sha256, holdListSha256: hl.sha256 };
}

export function formatPilotPlan(slug: string, photos: Row[], proposals: Proposal[], holds: Hold[], inventoryText: string, runId: string, sum: RunSummary, op?: PlanHolds): string {
  const pBy = new Map(proposals.map((p) => [p.id, p])), hBy = new Map(holds.map((h) => [h.id, h]));
  const L: string[] = [
    `PILOT PLAN: clone ${slug}, photos only (${photos.length}), run ${runId}`,
    "PREVIEW ONLY. Nothing has been written. Apply uses these exact proposals (no second model call) and refuses any row that changed.",
    "",
    ...(op ? [
      `OPERATOR HOLD LIST: ${op.held.size} proposals HELD (not applied), ${proposals.filter((p) => !op.held.has(p.id)).length} proposals APPLIED, ${op.unknown.length} unknown ids`,
      `preview sha256 ${op.previewSha256}`, `hold list sha256 ${op.holdListSha256}`, "",
    ] : []),
    `proposals ${proposals.length}  holds ${holds.length}  failed ${sum.failed}  needs_review ${sum.needsReview}  model cost reported ${sum.costUsd.toFixed(4)} USD`,
    "",
    "INVENTORY", inventoryText.split("\n").slice(0, 8).join("\n"), "",
  ];
  const show = (v: unknown) => (v === null || v === undefined ? "(empty)" : typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v));
  for (const r of photos) {
    const p = pBy.get(r.id), h = hBy.get(r.id);
    L.push(`PHOTO ${r.id}  ${r.storage_path}  status ${r.analysis_status}${r.metadata_edited_at ? "  MANUALLY EDITED (never touched)" : ""}`);
    if (p && op?.held.has(r.id)) {
      L.push(`  HELD BY OPERATOR (the proposal below is NOT applied): ${op.held.get(r.id)}`);
      L.push(`    analysis_status ${p.before.analysis_status} -> needs_review; analysis_error "${OPERATOR_HOLD_PREFIX}${op.held.get(r.id)}"; every metadata field kept as it is`);
      if (op.conflicts?.has(r.id)) L.push(`    WOULD CONFLICT NOW: ${op.conflicts.get(r.id)}`);
      L.push("  WITHHELD PROPOSAL (for the record)");
      for (const k of p.changed) {
        if (k === "analysed_at") continue;
        L.push(`    ${k}:`, `      current : ${show(p.before[k])}`, `      withheld: ${show(p.after[k])}`);
      }
    } else if (p) {
      if (op?.conflicts?.has(r.id)) L.push(`  WOULD CONFLICT NOW: ${op.conflicts.get(r.id)}`);
      L.push(`  PROPOSED (model ${p.model})${op ? "  -> APPLIED" : ""}`);
      for (const k of p.changed) {
        if (k === "analysed_at") continue;
        L.push(`    ${k}:`, `      current : ${show(p.before[k])}`, `      proposed: ${show(p.after[k])}`);
      }
      for (const n of p.notes ?? []) L.push(`    note: ${n}`);
    } else if (h) {
      L.push(`  HOLD (${h.outcome}): ${h.reason}`);
      L.push(`    analysis_status ${h.before.analysis_status} -> ${h.after.analysis_status}; analysis_error set; every metadata field kept as it is`);
    } else if (!classify(r).eligible) L.push(`  NOT SELECTED: status ${r.analysis_status}${r.metadata_edited_at ? ", manually edited" : ""}`);
    else L.push("  NO RESULT (not analysed in this run)");
    L.push("");
  }
  L.push("HOLDS (status-only; stop these items being offered):");
  if (!holds.length) L.push("  none");
  for (const h of holds) L.push(`  ${h.id}  ${h.before.analysis_status} -> ${h.after.analysis_status}  reason: ${h.reason}`);
  if (op) {
    L.push("", "OPERATOR HOLDS (reviewer-selected; status-only, proposal not applied):");
    if (!op.held.size) L.push("  none");
    for (const [id, reason] of op.held) L.push(`  ${id}  -> needs_review  reason: ${reason}`);
    if (op.unknown.length) { L.push("UNKNOWN ids on the hold list (not in the preview; apply reports each as a conflict and writes nothing for it):"); for (const u of op.unknown) L.push(`  ${u.table}:${u.id}  ${u.reason}`); }
  }
  return L.join("\n");
}

export function formatSummary(s: RunSummary): string {
  return [
    `mode ${s.mode}  migrated ${s.migrated}`,
    `selected ${s.selected}  skipped-already-done ${s.skippedDone}`,
    `proposed ${s.proposed}  applied ${s.applied}  recovered ${s.recovered}  already-applied ${s.alreadyApplied}  conflicts ${s.conflicts}  failed ${s.failed}  needs_review ${s.needsReview}`,
    `holds ${s.holds} previewed  ${s.holdsApplied} applied`,
    `bundle items updated ${s.itemsUpdated}  item conflicts ${s.itemConflicts}`,
    `model cost reported ${s.costUsd.toFixed(4)} USD`,
    ...(s.previewSha256 ? [`preview sha256 ${s.previewSha256}`] : []),
    ...(s.holdListSha256 ? [`hold list sha256 ${s.holdListSha256}  operator holds accepted ${s.operatorHolds}`] : []),
  ].join("\n");
}

// ── rollback ─────────────────────────────────────────────────────────────────
export type RollbackSummary = { restored: number; alreadyRestored: number; changedSince: number; itemsRestored: number; errors: string[] };

export async function rollbackRun(ctx: Pick<Ctx, "db" | "log" | "stateDir" | "retries" | "retryBaseMs">, backupFile?: string): Promise<RollbackSummary> {
  const sum: RollbackSummary = { restored: 0, alreadyRestored: 0, changedSince: 0, itemsRestored: 0, errors: [] };
  const lines = readJsonl<BackupRec | ConflictRec>(backupFile ?? path.join(ctx.stateDir, "backup.jsonl"));
  // A "conflict" line means the row held neither the old nor the new values when it was read back, so nothing of ours is expected there.
  // It is still tried (guarded on the exact written values, so it can only match a row we wrote) and a miss is silent, never "changed since apply".
  const conflicted = new Set(lines.filter((l): l is ConflictRec => l.kind === "conflict").map((l) => `${l.run}:${l.table}:${l.id}`));
  const recs = lines.filter((l): l is BackupRec => l.kind !== "conflict");
  for (const b of recs.reverse()) {
    const isItem = b.kind === "item";
    try {
      assertWritable(Object.keys(b.before), isItem ? ITEM_FIELDS : WRITABLE_FIELDS);
      // restore only while the row still holds exactly the values this run wrote
      let q: any = ctx.db.from(b.table).update(b.before).eq("id", b.id);
      if (!isItem) q = q.eq("clone_id", b.clone_id).is("metadata_edited_at", null);
      q = guardOld(q, b.after).select("id");
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if ((data ?? []).length === 1) { isItem ? sum.itemsRestored++ : sum.restored++; continue; }
      // 0 rows: either already back to the old values, or someone changed it since
      let r: any = ctx.db.from(b.table).select(Object.keys(b.before).join(",")).eq("id", b.id);
      const cur = await r;
      const row = (cur.data ?? [])[0];
      if (row && Object.keys(b.before).every((k) => same(row[k], b.before[k]))) sum.alreadyRestored++;
      else if (conflicted.has(`${b.run}:${b.table}:${b.id}`)) continue;
      else { sum.changedSince++; ctx.log(`not rolled back (changed since apply): ${b.table}/${b.id}`); }
    } catch (e) { sum.errors.push(`${b.table}/${b.id}: ${(e as Error).message}`); }
  }
  return sum;
}

// ── deterministic fake analyser (tests, and previews when the real one is not ready) ─────────────────────────
export function fakeFacts(over: Partial<Record<(typeof FACT_KEYS)[number], "yes" | "no" | "unclear">> = {}, visible: string[] = ["white bikini top", "beach"]): VisualFacts {
  const evidence = Object.fromEntries(FACT_KEYS.map((k) => [k, "no"])) as VisualFacts["evidence"];
  return { v: ANALYSIS_VERSION, evidence: { ...evidence, ...over }, visible };
}
export const fakeAnalyser: Analyser = async (table, bytes, model) => ({
  status: "analysed", model: model ?? "fake/model", provider: "fake", latencyMs: 1, costUsd: 0, version: ANALYSIS_VERSION,
  fields: {
    auto_desc: `fake ${table} ${bytes.length}b`, tags: ["solo"], visual_description: `A woman in a white bikini top on a beach. Not visible: nipples, genitals (fake ${bytes.length}b).`,
    visual_facts: fakeFacts({ swimwear: "yes" }), explicitness: "suggestive", is_nude: false, nsfw: false, caption: "fake caption",
  },
});

// ── connection guards (used by the CLI; exported so the check can prove them) ─────────────────────────────────
/** Only the approved project or a loopback address may be targeted. Allow-list on purpose: anything else is refused. */
export function assertSafeSupabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("SUPABASE_URL is not set");
  let host = "";
  try { host = new URL(url).hostname; } catch { throw new Error("SUPABASE_URL is not a valid URL"); }
  if (host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "aouaenqayfltoqrmpitg.supabase.co") return url;
  throw new Error(`refusing to run: ${host} is not the approved Supabase project or a local rig`);
}

/** fetch that throws on anything but GET/HEAD: used for inventory and preview so they cannot write even by mistake. */
export function readOnlyFetch(base: typeof fetch = fetch): typeof fetch {
  return ((input: any, init?: RequestInit) => {
    const method = (init?.method ?? (typeof input === "object" && input && "method" in input ? (input as Request).method : "GET")).toUpperCase();
    if (method !== "GET" && method !== "HEAD") throw new Error(`read-only mode: ${method} ${String(typeof input === "string" ? input : (input as any).url ?? input)} blocked`);
    return base(input, init);
  }) as typeof fetch;
}

