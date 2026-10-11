/**
 * Catalogue repair batch: re-analyses existing photos/videos through the factual analysis path (lib/caption.ts analysePhoto /
 * analyseVideo), with backup, guards, resume and rollback. All logic lives in lib/media-repair.ts.
 *
 *   tsx --tsconfig scripts/tsconfig.json --env-file=.env scripts/repair-media-analysis.ts <mode> [flags]
 *
 * modes
 *   inventory   read-only counts by clone x status / unanalysed / failed-looking / negated description, plus a cost estimate
 *   preview     analyse eligible rows and write proposals to <state>/preview.jsonl. NO database writes (GET-only client).
 *   apply       write EXACTLY a reviewed preview: --preview <run id | path to preview.jsonl> --confirm-apply. NO model call. Each proposal is
 *               bound to row id / clone / table / storage_path / analysis version / previous values; anything changed = conflict, no write.
 *               Backup (fsynced) before each guarded UPDATE, read-back reconciliation of lost responses, bundle-item copy, status holds.
 *   pilot       --clone SLUG [--expect N]: inventory + preview of that clone's photos only, writes PILOT-PLAN.txt and rows-before.json
 *   hold-list   --preview FILE --in REVIEW.json --out HOLDLIST.json: binds reviewer entries [{table,id,reason,reviewer?}] to the sha256 of that preview
 *               (offline, no database). Then: apply ... --hold-list HOLDLIST.json  holds those rows (status-only, reason recorded, metadata kept)
 *               instead of applying their proposals; refused if the list was bound to a different preview.
 *   pilot       ... --preview FILE --hold-list FILE: no model call; prints the plan of that saved preview with applied vs held (reasons)
 *   rollback    restore rows from <state>/backup.jsonl (or --backup FILE) that still hold the values this run wrote
 *
 * flags
 *   --clone SLUG   --table photos|videos   --scope all|problem (default all)   --status legacy,failed,pending   --limit N
 *   --spread (round-robin across clones, for samples)   --concurrency N (default 4, max 8)   --retries N (default 2)
 *   --model MODEL (force one vision model for every row)   --run ID (state dir name; re-use it to RESUME)   --state-root DIR (default ./.media-repair-state)   --skip-failed
 *   --cost-photo USD (default 0.0015)   --cost-video USD (default 0.003)   --analyser real|fake (fake: preview only)   --out FILE
 *
 * Targets only the approved Supabase project or a loopback rig (assertSafeSupabaseUrl). Never touches star_value, is_free,
 * storage_path, clone_id, telegram_file_id or any purchase table (assertWritable).
 * Seam: the real analyser is imported lazily from lib/caption.ts; the fake one is for previews/tests when it is not ready.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import {
  planPilotFromPreview, bindHoldList, assertSafeSupabaseUrl, readOnlyFetch, buildInventory, formatInventory, runRepair, runPilot, rollbackRun, formatSummary, fakeAnalyser, BUCKET,
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
  const forced = opt("model"); // --model forces one model for every row (eval / pilot), else the clone's configured vision_model
  return (table, bytes, model) => (table === "photos" ? mod.analysePhoto(bytes, forced ?? model) : mod.analyseVideo(bytes, forced ?? model));
}

async function main() {
  if (!["inventory", "preview", "apply", "rollback", "pilot", "hold-list"].includes(mode ?? "")) {
    console.error("usage: repair-media-analysis.ts inventory|preview|apply|rollback|pilot|hold-list [flags]  (see the header of this file)");
    process.exit(2);
  }
  if (mode === "hold-list") {
    if (!opt("preview") || !opt("in") || !opt("out")) throw new Error("hold-list needs --preview FILE --in REVIEW.json --out FILE");
    const entries = JSON.parse(readFileSync(opt("in")!, "utf8"));
    const bound = bindHoldList(path.resolve(opt("preview")!), entries);
    writeFileSync(opt("out")!, JSON.stringify(bound, null, 1) + "\n");
    console.log(`wrote ${bound.length} entries bound to preview sha256 ${bound[0]?.preview_sha256}`);
    return;
  }
  const url = assertSafeSupabaseUrl(process.env.SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_KEY is not set");
  const writes = mode === "apply" || mode === "rollback";
  if (mode === "pilot" && !opt("clone")) throw new Error("pilot needs --clone SLUG");
  if (mode === "apply" && !flag("confirm-apply")) throw new Error("apply writes to the database: re-run with --confirm-apply (preview first, always)");
  if (mode === "apply" && !opt("preview")) throw new Error("apply needs a reviewed preview: pass --preview <run id or path to preview.jsonl>");
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
  const stateRoot = opt("state-root") ?? path.join(process.cwd(), ".media-repair-state");
  if (mode === "apply") {
    const pv = opt("preview")!;
    const previewFile = pv.includes("/") || pv.endsWith(".jsonl") ? path.resolve(pv) : path.join(stateRoot, pv, "preview.jsonl");
    const summary = await runRepair(ctx, { mode: "apply", cloneSlug: clone, table, scope: "all", limit: opt("limit") ? Number(opt("limit")) : undefined, preview: previewFile, holdList: opt("hold-list") ? path.resolve(opt("hold-list")!) : undefined });
    console.log(formatSummary(summary));
    console.log(`state dir: ${stateDir}`);
    if (summary.conflictReasons.length) console.log(`conflicts (${summary.conflictReasons.length}), listed in ${path.join(stateDir, "report.txt")}: run a fresh preview for those rows`);
    return;
  }
  if (mode === "pilot" && opt("hold-list")) {
    if (!clone) throw new Error("pilot needs --clone SLUG");
    if (!opt("preview")) throw new Error("pilot --hold-list needs --preview FILE (the saved reviewed preview the list is bound to)");
    const r = await planPilotFromPreview(ctx, clone, path.resolve(opt("preview")!), path.resolve(opt("hold-list")!));
    console.log(r.plan);
    console.log(`plan: ${r.planFile}\npreview sha256 ${r.previewSha256}\nhold list sha256 ${r.holdListSha256}`);
    if (opt("out")) writeFileSync(opt("out")!, r.plan + "\n");
    return;
  }
  const analyserKind = opt("analyser") ?? "real";
  if (analyserKind === "fake") {
    if (mode === "apply" && !/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error("--analyser fake may only apply to a local rig");
    ctx.analyse = fakeAnalyser;
    console.log("NOTE: using the FAKE analyser (no model is called, proposals are placeholders)");
  } else ctx.analyse = await realAnalyser();
  if (mode === "pilot") {
    if (!clone) throw new Error("pilot needs --clone SLUG");
    const r = await runPilot(ctx, clone, opt("expect") ? Number(opt("expect")) : undefined);
    console.log(formatSummary(r.summary));
    console.log(`plan: ${r.planFile}`);
    if (opt("out")) writeFileSync(opt("out")!, r.plan + "\n");
    console.log(`state dir: ${stateDir}`);
    return;
  }
  const summary = await runRepair(ctx, {
    mode, cloneSlug: clone, table, scope: (opt("scope") as "all" | "problem") ?? "all", limit: opt("limit") ? Number(opt("limit")) : undefined,
    statuses: opt("status")?.split(","), spread: flag("spread"), skipFailed: flag("skip-failed"),
  } as any);
  console.log(formatSummary(summary));
  console.log(`state dir: ${stateDir}`);
  if (summary.errors.length) console.log(`failures (${summary.errors.length}) listed in ${path.join(stateDir, "failed.jsonl")}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
