/**
 * ONE-OFF (2026-11-05, Ronan's call): make every Luna Skyee + Clarissa Mason photo/video bot-ready with NO manual review.
 * Reuses the system's own code: analysePhoto/analyseVideo (lib/caption.ts), analysisRowFields + completeReviewUpdate
 * (lib/media-analysis-row.ts, the same approval the dashboard Review button applies).
 *   needs_review row with facts  -> approve only (no model call)
 *   failed row                   -> re-analyse (photos qwen/qwen3.8-27b, videos qwen/qwen3-vl-235b-a22b-instruct), write the
 *                                   analysis fields (caption/tags/desc/facts), and approve it if the model held it for review
 * Never touches star_value, is_free, storage_path, clone_id, telegram_file_id. Every row's previous values go to a backup
 * jsonl BEFORE its guarded UPDATE (guard: same id + clone_id + previous analysis_status).
 *   tsx --tsconfig scripts/tsconfig.json --env-file=.env scripts/local-approve-media-20261105.ts dry|apply|rollback
 */
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { analysisRowFields, completeReviewUpdate } from "../lib/media-analysis-row";

const SLUGS = ["luna-skyee"];
const PHOTO_MODEL = "qwen/qwen3.8-27b";
const VIDEO_MODEL = "qwen/qwen3-vl-235b-a22b-instruct";
const BACKUP = "/home/ronan/twin/media-approve-backup-luna-videos-20261105.jsonl";
const COLS = ["caption", "tags", "is_nude", "nsfw", "explicitness", "auto_desc", "visual_description", "visual_facts", "analysis_status",
  "analysis_version", "analysis_model", "analysis_provider", "analysis_error", "analysed_at", "metadata_edited_at"];
const mode = process.argv[2];
if (!["dry", "apply", "rollback"].includes(mode ?? "")) { console.error("usage: dry|apply|rollback"); process.exit(2); }
const url = process.env.SUPABASE_URL ?? "";
if (!url.includes("aouaenqayfltoqrmpitg")) throw new Error("refusing: not the approved Supabase project");
const db = createClient(url, (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, { auth: { persistSession: false } });

async function rollback() {
  if (!existsSync(BACKUP)) throw new Error("no backup file");
  const lines = readFileSync(BACKUP, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  let n = 0;
  for (const b of lines.reverse()) {
    const { error } = await db.from(b.table).update(b.before).eq("id", b.id).eq("clone_id", b.clone_id);
    if (error) console.log("ROLLBACK FAIL", b.table, b.id, error.message); else n++;
  }
  console.log(`rolled back ${n}/${lines.length}`);
}

async function main() {
  if (mode === "rollback") return rollback();
  const caption: any = await import("../lib/caption");
  const { data: clones, error: ce } = await db.from("clones").select("id,slug").in("slug", SLUGS);
  if (ce) throw new Error(ce.message);
  const sum: Record<string, number> = {};
  const bump = (k: string) => (sum[k] = (sum[k] ?? 0) + 1);
  for (const c of clones!) {
    for (const table of ["photos", "videos"] as const) {
      const { data: rows, error } = await db.from(table).select(["id", "clone_id", "storage_path", ...COLS].join(",")).eq("clone_id", c.id).in("analysis_status", ["failed", "needs_review"]);
      if (error) throw new Error(error.message);
      const queue = [...(rows as any[])];
      const worker = async () => {
        for (let r = queue.shift(); r; r = queue.shift()) {
          const tag = `${c.slug} ${table} ${r.id.slice(0, 8)} [${r.analysis_status}]`;
          try {
            let update: Record<string, unknown>;
            if (r.analysis_status === "needs_review" && r.visual_facts && typeof r.visual_facts === "object") {
              update = completeReviewUpdate(r);
              bump(`${c.slug} ${table} approve-only`);
            } else {
              const { data: blob, error: de } = await db.storage.from("media").download(r.storage_path);
              if (de || !blob) throw new Error("download failed: " + (de?.message ?? "empty"));
              const bytes = Buffer.from(await blob.arrayBuffer());
              let res: any;
              for (let attempt = 0; attempt < 3; attempt++) {
                res = table === "photos" ? await caption.analysePhoto(bytes, PHOTO_MODEL) : await caption.analyseVideo(bytes, VIDEO_MODEL);
                if (res.status !== "failed") break;
              }
              if (res.status === "failed") { console.log("STILL FAILED", tag, String(res.error).slice(0, 120)); bump(`${c.slug} ${table} still-failed`); continue; }
              const fields = analysisRowFields(res);
              update = res.status === "needs_review" ? { ...fields, ...completeReviewUpdate({ ...r, ...fields }) } : fields;
              bump(`${c.slug} ${table} reanalysed-${res.status}->analysed`);
            }
            const desc = String(update.caption ?? update.auto_desc ?? r.caption ?? "").slice(0, 70);
            if (mode === "dry") { console.log("DRY", tag, "->", update.analysis_status, "|", desc); continue; }
            appendFileSync(BACKUP, JSON.stringify({ table, id: r.id, clone_id: r.clone_id, before: Object.fromEntries(COLS.map((k) => [k, r[k]])) }) + "\n");
            const { data: done, error: we } = await db.from(table).update(update).eq("id", r.id).eq("clone_id", r.clone_id).eq("analysis_status", r.analysis_status).select("id");
            if (we || !done?.length) { console.log("WRITE FAIL", tag, we?.message ?? "row changed"); bump(`${c.slug} ${table} write-fail`); continue; }
            console.log("OK", tag, "->", update.analysis_status, "|", desc);
          } catch (e: any) { console.log("ERROR", tag, String(e?.message ?? e).slice(0, 160)); bump(`${c.slug} ${table} error`); }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    }
  }
  console.log("SUMMARY", JSON.stringify(sum, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
