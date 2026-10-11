/**
 * Catalogue repair batch: re-analyses existing photos/videos through the factual analysis path (lib/caption.ts analysePhoto /
 * analyseVideo), with backup, guards, resume and rollback. All logic lives in lib/media-repair.ts.
 *
 *   tsx --tsconfig scripts/tsconfig.json --env-file=.env scripts/repair-media-analysis.ts <mode> [flags]
 *
 * modes
 *   inventory   read-only counts by clone x status / unanalysed / failed-looking / negated description, plus a cost estimate
 *   preview     analyse eligible rows and write proposals to <state>/preview.jsonl. NO database writes (GET-only client).
 *   apply       analyse and write. Needs --confirm-apply. Backup line first, guarded UPDATE, bundle-item copy.
 *   rollback    restore rows from <state>/backup.jsonl (or --backup FILE) that still hold the values this run wrote
 *
 * flags
 *   --clone SLUG   --table photos|videos   --scope all|problem (default all)   --status legacy,failed,pending   --limit N
 *   --spread (round-robin across clones, for samples)   --concurrency N (default 4, max 8)   --retries N (default 2)
 *   --run ID (state dir name; re-use it to RESUME)   --state-root DIR (default ./.media-repair-state)   --skip-failed
 *   --cost-photo USD (default 0.0015)   --cost-video USD (default 0.003)   --analyser real|fake (fake: preview only)   --out FILE
 *
 * Targets only the approved Supabase project or a loopback rig (assertSafeSupabaseUrl). Never touches star_value, is_free,
 * storage_path, clone_id, telegram_file_id or any purchase table (assertWritable).
 * Seam: the real analyser is imported lazily from lib/caption.ts; the fake one is for previews/tests when it is not ready.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertSafeSupabaseUrl, readOnlyFetch, buildInventory, formatInventory, runRepair, rollbackRun, formatSummary, fakeAnalyser, BUCKET,
  type Analyser, type Ctx, type MediaTable,
} from "../lib/media-repair";

const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (n: string) => argv.includes(`--${n}`);

async function realAnalyser(): Promise<Analyser> {
  const mod: any = await import("../lib/caption");
  if (typeof mod.analysePhoto !== "function" || typeof mod.analyseVideo !== "function") {
    throw new Error("lib/caption.ts has no analysePhoto/analyseVideo yet (media-analysis-fix branch). Merge it first, or use --analyser fake for a preview.");
  }
  return (table, bytes, model) => (table === "photos" ? mod.analysePhoto(bytes, model) : mod.analyseVideo(bytes, model));
}

async function main() {
  if (!["inventory", "preview", "apply", "rollback"].includes(mode ?? "")) {
    console.error("usage: repair-media-analysis.ts inventory|preview|apply|rollback [flags]  (see the header of this file)");
    process.exit(2);
  }
  const url = assertSafeSupabaseUrl(process.env.SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_KEY is not set");
  const writes = mode === "apply" || mode === "rollback";
  if (mode === "apply" && !flag("confirm-apply")) throw new Error("apply writes to the database: re-run with --confirm-apply (preview first, always)");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: writes ? fetch : readOnlyFetch() } });

  const runId = opt("run") ?? new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const stateDir = path.join(opt("state-root") ?? path.join(process.cwd(), ".media-repair-state"), runId);
  mkdirSync(stateDir, { recursive: true });
  const costPhoto = Number(opt("cost-photo") ?? 0.0015), costVideo = Number(opt("cost-video") ?? 0.003);
  const ctx: Ctx = {
    db, runId, stateDir, log: (l) => console.log(l), costPhoto, costVideo,
    concurrency: Number(opt("concurrency") ?? 4), retries: Number(opt("retries") ?? 2),
    download: async (p) => { const { data, error } = await db.storage.from(BUCKET).download(p); if (error || !data) throw new Error(`download failed: ${error?.message ?? "no data"}`); return Buffer.from(await data.arrayBuffer()); },
    analyse: fakeAnalyser,
  };
  const table = opt("table") as MediaTable | undefined;
  const clone = opt("clone");

  if (mode === "inventory") {
    const text = formatInventory(await buildInventory(ctx), costPhoto, costVideo);
    console.log(text);
    if (opt("out")) writeFileSync(opt("out")!, text + "\n");
    return;
  }
  if (mode === "rollback") {
    const s = await rollbackRun(ctx, opt("backup"));
    console.log(JSON.stringify(s, null, 2));
    return;
  }
  const analyserKind = opt("analyser") ?? "real";
  if (analyserKind === "fake") {
    if (mode === "apply" && !/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error("--analyser fake may only apply to a local rig");
    ctx.analyse = fakeAnalyser;
    console.log("NOTE: using the FAKE analyser (no model is called, proposals are placeholders)");
  } else ctx.analyse = await realAnalyser();
  const summary = await runRepair(ctx, {
    mode, cloneSlug: clone, table, scope: (opt("scope") as "all" | "problem") ?? "all", limit: opt("limit") ? Number(opt("limit")) : undefined,
    statuses: opt("status")?.split(","), spread: flag("spread"), skipFailed: flag("skip-failed"),
  } as any);
  console.log(formatSummary(summary));
  console.log(`state dir: ${stateDir}`);
  if (summary.errors.length) console.log(`failures (${summary.errors.length}) listed in ${path.join(stateDir, "failed.jsonl")}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
