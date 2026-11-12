// lib/media-repair.ts on the in-memory PostgREST fake in ./postgrest-wire.ts, plus test-local analysis data.
// Added by W4 lane lib-dashboard-data-plus2. Analysis results are built here, never by lib's fakeAnalyser/fakeFacts, so a
// change to lib's fake cannot silently change what a test asserts against.
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ANALYSIS_VERSION, FACT_KEYS, type AnalysisResult, type FactKey, type Tri } from "../../lib/media-analysis-contract";
import type { Analyser, Ctx, MediaTable, Row } from "../../lib/media-repair";
import { A } from "./ids";
import { FAKE_URL, rowsReply, type Wire } from "./postgrest-wire";

export const rowId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** A model id that is not lib's "fake/model" default. */
const REAL_MODEL = "qwen/qwen3-vl-235b-a22b-instruct";

/** A photos row that was never analysed (status legacy, no facts, never hand-edited). */
export function legacyRow(n = 1, over: Partial<Row> = {}): Row {
  return {
    id: rowId(n), clone_id: A, storage_path: `${A}/p${n}.jpg`, caption: "hello there", tags: [], auto_desc: null,
    visual_description: null, explicitness: "none", is_nude: false, nsfw: false, analysis_status: "legacy", analysis_version: null,
    analysis_model: null, analysis_provider: null, analysis_error: null, analysed_at: null, visual_facts: null, metadata_edited_at: null,
    ...over,
  };
}

type AnalysisOver = {
  provider?: string; costUsd?: number | null; model?: string | null; table?: MediaTable; bytes?: Buffer;
  /** merged over "every key no, swimwear yes" */
  evidence?: Partial<Record<FactKey, Tri>>;
  /** absent = keep the default caption; null = the analyser returned no caption */
  caption?: string | null;
};

/**
 * A valid, bind-passing "analysed" result from a real provider (Alibaba via OpenRouter): a white bikini top on a beach,
 * nothing explicit visible. A fake-provider result is `realAnalysis({ provider: "fake" })`.
 */
export function realAnalysis(over: AnalysisOver = {}): AnalysisResult {
  const table = over.table ?? "photos";
  const bytes = over.bytes ?? Buffer.from("bytes");
  const evidence = { ...Object.fromEntries(FACT_KEYS.map((k) => [k, "no"])), swimwear: "yes", ...over.evidence } as Record<FactKey, Tri>;
  const fields: NonNullable<AnalysisResult["fields"]> = {
    auto_desc: `${table} ${bytes.length}b, woman in a white bikini top on a beach`, tags: ["solo"],
    visual_description: `A woman in a white bikini top on a beach. Not visible: nipples, genitals (${bytes.length}b).`,
    visual_facts: { v: ANALYSIS_VERSION, evidence, visible: ["white bikini top", "beach"] },
    explicitness: "suggestive", is_nude: false, nsfw: false, caption: "sunny beach day",
  };
  if ("caption" in over) fields.caption = over.caption;
  return {
    status: "analysed", model: over.model ?? REAL_MODEL, provider: over.provider ?? "Alibaba", latencyMs: 1,
    costUsd: over.costUsd === undefined ? 0 : over.costUsd, version: ANALYSIS_VERSION, fields,
  };
}

/** A permanent or transient analyser failure as the real analyser reports it (no fields; the provider may still bill). */
export function failedAnalysis(over: { error: string; costUsd?: number | null; model?: string | null }): AnalysisResult {
  return { status: "failed", model: over.model ?? REAL_MODEL, provider: "Alibaba", latencyMs: 1, costUsd: over.costUsd ?? 0, version: ANALYSIS_VERSION, error: over.error };
}

/** An Analyser that answers realAnalysis(over) for whatever table/bytes/model it is called with. */
export const realAnalyser = (over: Omit<AnalysisOver, "table" | "bytes" | "model"> = {}): Analyser =>
  async (table, bytes, model) => realAnalysis({ ...over, table, bytes, model });

/** The three reads a preview run makes: the clone, its photos, no videos. */
export function serveRepairDb(wire: Wire, photos: readonly Row[]): void {
  wire.on("GET /rest/v1/clones", rowsReply([{ id: A, slug: "alpha", vision_model: null, photo_vision_model: null }]));
  wire.on("GET /rest/v1/photos", rowsReply(photos));
  wire.on("GET /rest/v1/videos", rowsReply([]));
}

let db: SupabaseClient | undefined;
/** supabase-js against the fake; created on first use, after useWire() has set the fake env. */
function fakeDb(): SupabaseClient {
  db ??= createClient(FAKE_URL, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => globalThis.fetch(input, init) },
  });
  return db;
}

/** A repair Ctx on the fake: one worker, no retries, downloads succeed, the analyser is realAnalyser(). */
export function repairCtx(over: Partial<Ctx> & Pick<Ctx, "stateDir">): Ctx {
  return {
    db: fakeDb(), runId: "r1", log: () => {}, concurrency: 1, retries: 0, retryBaseMs: 0, costPhoto: 0.001, costVideo: 0.002,
    download: async (p) => Buffer.from(`bytes:${p}`), analyse: realAnalyser(), ...over,
  };
}

/** One fs.mkdtempSync root under os.tmpdir() for the file, removed after it; `fresh()` makes a new empty dir inside. */
export function tempRoot(prefix: string): { fresh: () => string } {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  after(() => rmSync(root, { recursive: true, force: true }));
  return { fresh: () => mkdtempSync(path.join(root, "d-")) };
}
