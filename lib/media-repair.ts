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
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ANALYSIS_COLUMNS, ANALYSIS_VERSION, FACT_KEYS, type AnalysisResult, type VisualFacts } from "./media-analysis-contract";
import { withRetry, TRANSIENT_ERROR } from "./retry";
import { analysisRowFields } from "./media-analysis-row";

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

export type CloneInfo = { id: string; slug: string; vision_model: string | null };
export async function fetchClones(db: SupabaseClient): Promise<CloneInfo[]> {
  const { data, error } = await db.from("clones").select("id, slug, vision_model").order("slug");
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

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type Proposal = {
  run: string; table: MediaTable; id: string; clone_id: string; clone_slug: string; storage_path: string;
  outcome: "proposed" | "unchanged" | "needs_review" | "failed";
  model: string; provider: string | null; costUsd: number | null; latencyMs: number;
  before: Record<string, unknown>; after: Record<string, unknown>; changed: string[];
  error?: string; premigration?: boolean;
};

export function buildProposal(ctx: Pick<Ctx, "runId" | "now">, table: MediaTable, row: Row, slug: string, res: AnalysisResult, migrated: boolean): Proposal {
  const base = {
    run: ctx.runId, table, id: row.id, clone_id: row.clone_id, clone_slug: slug, storage_path: row.storage_path,
    model: res.model, provider: res.provider, costUsd: res.costUsd, latencyMs: res.latencyMs, before: {}, after: {}, changed: [] as string[],
    ...(migrated ? {} : { premigration: true }),
  };
  if (res.status === "failed" || !res.fields) return { ...base, outcome: "failed", error: res.error ?? "analysis failed" };
  const bad = validateFields(res.fields);
  if (bad) return { ...base, outcome: "failed", error: `invalid analysis result: ${bad}` };
  if (res.status === "needs_review") return { ...base, outcome: "needs_review", error: res.error ?? "analysis contradicts itself" };

  const f = res.fields;
  // The field set and the state stamp come from the SAME helper the dashboard upload/import path uses (lib/media-analysis-row.ts),
  // so a repaired row is indistinguishable from a freshly uploaded one. Caption is the one exception: the stored sales caption is
  // kept unless it contradicts the facts.
  const mapped = analysisRowFields(res);
  const after: Record<string, unknown> = {};
  for (const k of CONTENT_FIELDS) if (k !== "caption") after[k] = mapped[k];
  if (captionContradictsFacts(row.caption, f.visual_facts)) after.caption = f.caption?.trim() ? f.caption : null;
  const changedContent = Object.keys(after).filter((k) => !same((row as any)[k], after[k]));
  const stamp: Record<string, unknown> = {};
  for (const k of STAMP_FIELDS) stamp[k] = mapped[k];
  stamp.analysed_at = (ctx.now?.() ?? new Date()).toISOString();
  const changed = [...changedContent, ...STAMP_FIELDS];
  const out: Record<string, unknown> = {}, prev: Record<string, unknown> = {};
  for (const k of changed) { out[k] = k in stamp ? (stamp as any)[k] : after[k]; prev[k] = (row as any)[k] ?? null; }
  return { ...base, outcome: "proposed", before: prev, after: out, changed };
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
function append(f: string, obj: unknown) { appendFileSync(f, JSON.stringify(obj) + "\n"); }
function readJsonl<T>(f: string): T[] {
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
}

type BackupRec = { kind: "row" | "item"; table: MediaTable | "photo_bundle_items"; id: string; clone_id: string; storage_path: string; before: Record<string, unknown>; after: Record<string, unknown>; run: string; at: string };

// ── row processing ───────────────────────────────────────────────────────────
export type Mode = "preview" | "apply";
export type RunOpts = {
  mode: Mode; cloneSlug?: string; table?: MediaTable; scope: "all" | "problem"; statuses?: string[]; limit?: number; spread?: boolean;
  /** on resume, do not retry rows that failed earlier in this run (default: retry them) */
  skipFailed?: boolean;
};
export type RunSummary = {
  mode: Mode; migrated: boolean; selected: number; skippedDone: number;
  proposed: number; applied: number; unchanged: number; conflicts: number; failed: number; needsReview: number; itemsUpdated: number; itemConflicts: number;
  costUsd: number; errors: string[];
};

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

async function applyProposal(ctx: Ctx, p: Proposal, sum: RunSummary): Promise<"applied" | "conflict"> {
  assertWritable(Object.keys(p.after));
  // backup first, flushed by appendFileSync before the write is attempted
  append(file(ctx, "backup.jsonl"), { kind: "row", table: p.table, id: p.id, clone_id: p.clone_id, storage_path: p.storage_path, before: p.before, after: p.after, run: ctx.runId, at: new Date().toISOString() } satisfies BackupRec);
  // guard on every changed content field's old value + the status; stamp timestamps/model need not match
  const guardFields = Object.fromEntries(Object.entries(p.before).filter(([k]) => (CONTENT_FIELDS as readonly string[]).includes(k) || k === "analysis_status"));
  let q: any = ctx.db.from(p.table).update(p.after).eq("id", p.id).eq("clone_id", p.clone_id).is("metadata_edited_at", null);
  q = guardOld(q, guardFields).select("id");
  const { data, error } = await withRetry(async () => { const r = await q; if (r.error && TRANSIENT_ERROR.test(r.error.message)) throw new Error(r.error.message); return r; }, ctx.retries + 1, { baseMs: ctx.retryBaseMs });
  if (error) throw new Error(`update ${p.table}/${p.id}: ${error.message}`);
  return (data ?? []).length === 1 ? "applied" : "conflict";
}

/** Copies the corrected values onto photo_bundle_items with the same storage_path (same clone), guarded on each item's current values. */
async function syncItems(ctx: Ctx, rec: { clone_id: string; storage_path: string; after: Record<string, unknown> }, sum: RunSummary) {
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
    let q: any = ctx.db.from("photo_bundle_items").update(after).eq("id", it.id);
    q = guardOld(q, before).select("id");
    const r = await q;
    if (r.error) throw new Error(`update photo_bundle_items/${it.id}: ${r.error.message}`);
    if ((r.data ?? []).length === 1) sum.itemsUpdated++; else sum.itemConflicts++;
  }
}

export async function runRepair(ctx: Ctx, opts: RunOpts): Promise<RunSummary> {
  ensureDir(ctx);
  ctx.concurrency = Math.min(ctx.concurrency, MAX_CONCURRENCY);
  const migrated = await isMigrated(ctx.db);
  if (opts.mode === "apply" && !migrated) {
    throw new Error("refusing to apply: migration 20261012000000 (analysis columns, incl. the metadata_edited_at manual-edit guard) is not applied on this database");
  }
  const sum: RunSummary = { mode: opts.mode, migrated, selected: 0, skippedDone: 0, proposed: 0, applied: 0, unchanged: 0, conflicts: 0, failed: 0, needsReview: 0, itemsUpdated: 0, itemConflicts: 0, costUsd: 0, errors: [] };

  const clones = await fetchClones(ctx.db);
  const bySlug = new Map(clones.map((c) => [c.slug, c]));
  const byId = new Map(clones.map((c) => [c.id, c]));
  let cloneId: string | undefined;
  if (opts.cloneSlug) { cloneId = bySlug.get(opts.cloneSlug)?.id; if (!cloneId) throw new Error(`no clone with slug ${opts.cloneSlug}`); }

  const stateFile = file(ctx, "state.jsonl");
  const state = readJsonl<StateEntry>(stateFile);
  const doneKeys = new Set(state.filter((s) => ["applied", "unchanged", "conflict", "needs_review", "proposed", ...(opts.skipFailed ? ["failed"] : [])].includes(s.status) && (opts.mode === "apply" ? s.status !== "proposed" : true)).map((s) => s.key));
  const mark = (key: string, status: string, detail?: string) => append(stateFile, { key, status, at: new Date().toISOString(), detail } satisfies StateEntry);

  // resume: rows applied by an interrupted earlier run whose bundle-item copy did not finish
  if (opts.mode === "apply") {
    const itemsDone = new Set(state.filter((s) => s.status === "items_done").map((s) => s.key));
    for (const b of readJsonl<BackupRec>(file(ctx, "backup.jsonl"))) {
      const key = `${b.table}:${b.id}`;
      if (b.kind === "row" && b.table === "photos" && state.some((s) => s.key === key && s.status === "applied") && !itemsDone.has(key)) {
        await syncItems(ctx, b, sum); mark(key, "items_done"); itemsDone.add(key);
      }
    }
  }

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
    const model = byId.get(row.clone_id)?.vision_model ?? null;
    const res = await analyseRow(ctx, table, row, model);
    const p = buildProposal(ctx, table, row, slug, res, migrated);
    sum.costUsd += p.costUsd ?? 0;
    if (p.outcome === "failed") {
      sum.failed++; sum.errors.push(`${key}: ${p.error}`);
      append(file(ctx, "failed.jsonl"), { key, clone: slug, storage_path: row.storage_path, error: p.error, at: new Date().toISOString() });
      mark(key, "failed", p.error);
    } else if (p.outcome === "needs_review") {
      sum.needsReview++;
      append(file(ctx, "failed.jsonl"), { key, clone: slug, storage_path: row.storage_path, error: `needs_review: ${p.error}`, at: new Date().toISOString() });
      mark(key, "needs_review", p.error);
    } else if (opts.mode === "preview") {
      sum.proposed++;
      append(file(ctx, "preview.jsonl"), p);
      mark(key, "proposed");
    } else {
      const r = await applyProposal(ctx, p, sum);
      if (r === "applied") {
        sum.applied++; mark(key, "applied");
        if (table === "photos") { await syncItems(ctx, { clone_id: p.clone_id, storage_path: p.storage_path, after: p.after }, sum); mark(key, "items_done"); }
      } else { sum.conflicts++; mark(key, "conflict", "row changed since it was read"); ctx.log(`conflict ${key}: row changed, left untouched`); }
    }
    n++;
    await ctx.afterRow?.(n);
  });

  writeFileSync(file(ctx, "report.txt"), formatSummary(sum) + (sum.errors.length ? "\n\nFAILURES\n" + sum.errors.join("\n") : "") + "\n");
  return sum;
}

export function formatSummary(s: RunSummary): string {
  return [
    `mode ${s.mode}  migrated ${s.migrated}`,
    `selected ${s.selected}  skipped-already-done ${s.skippedDone}`,
    `proposed ${s.proposed}  applied ${s.applied}  conflicts ${s.conflicts}  failed ${s.failed}  needs_review ${s.needsReview}`,
    `bundle items updated ${s.itemsUpdated}  item conflicts ${s.itemConflicts}`,
    `model cost reported ${s.costUsd.toFixed(4)} USD`,
  ].join("\n");
}

// ── rollback ─────────────────────────────────────────────────────────────────
export type RollbackSummary = { restored: number; alreadyRestored: number; changedSince: number; itemsRestored: number; errors: string[] };

export async function rollbackRun(ctx: Pick<Ctx, "db" | "log" | "stateDir" | "retries" | "retryBaseMs">, backupFile?: string): Promise<RollbackSummary> {
  const sum: RollbackSummary = { restored: 0, alreadyRestored: 0, changedSince: 0, itemsRestored: 0, errors: [] };
  const recs = readJsonl<BackupRec>(backupFile ?? path.join(ctx.stateDir, "backup.jsonl"));
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
