/**
 * Video sequence render worker.
 *
 * Drains public.video_sequence_jobs (migration 148). One job is one revision:
 * download the approved source recording, cut it at the human-approved
 * timestamps, validate every clip, upload them, then publish the whole manifest
 * in a single step.
 *
 * WHY THIS IS A WORKER AND NOT A SERVER ACTION: brief section 3. Cutting a
 * source recording is minutes of ffmpeg on a file that can be hundreds of
 * megabytes. It must never happen inside an inbound chat request, and the
 * dashboard's server actions already buffer whole files into memory.
 *
 * THE TWO PROPERTIES THIS FILE EXISTS TO HOLD:
 *   * All or nothing. Six parts approved and five rendered does not publish.
 *     A published revision is immutable (migration 147) and a fan may already
 *     have bought from it, so there is no repairing it afterwards.
 *   * Idempotent. The worker may die mid-render and be restarted. A job that
 *     already succeeded publishes nothing on a second run.
 *
 * Automatic boundary detection is deliberately NOT here. Only human-approved
 * timestamps enter this pipeline; the job row carries the approver's name.
 *
 * Run:
 *   node --env-file=.env ../twin-bot/node_modules/.bin/tsx \
 *     --tsconfig scripts/tsconfig.json scripts/render-sequence.ts \
 *     [--job <uuid>] [--worker <name>] [--once] [--dry-run]
 */
import { readFile, writeFile, stat, unlink, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase";
import { COMPRESSION_LADDER, scaleFilter, VIDEO_MAX_BYTES } from "@/lib/video-import";
import {
  validateCutList,
  durationWithinTolerance,
  decidePublish,
  clipStoragePath,
  partRow,
  type CutPoint,
  type RenderedClip,
} from "@/lib/sequence-render";

const execFileAsync = promisify(execFile);

const MEDIA_BUCKET = "media";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

interface JobRow {
  id: string;
  clone_id: string;
  revision_id: string;
  source_storage_path: string;
  source_duration_seconds: number | null;
  cut_points: unknown;
  approved_by: string;
  approved_at: string;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  max_attempts: number;
}

// ── ffprobe / ffmpeg ────────────────────────────────────────────────────────

async function probeDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ]);
  const seconds = Number(String(stdout).trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`could not read a duration from ${path.basename(file)}`);
  return seconds;
}

async function hasVideoStream(file: string): Promise<boolean> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type",
    "-of", "default=nw=1:nk=1", file,
  ]);
  return String(stdout).trim() === "video";
}

/**
 * Cut one range and bring it under the send cap.
 *
 * Re-encodes rather than stream-copies: a stream copy lands on the nearest
 * keyframe, so the clip would not start where the operator put the boundary and
 * its caption would describe footage it does not contain.
 */
async function renderClip(srcPath: string, cut: CutPoint, workDir: string): Promise<{ file: string; note: string }> {
  const duration = cut.endSeconds - cut.startSeconds;
  const base = path.join(workDir, `part-${String(cut.position).padStart(2, "0")}`);

  for (const [i, step] of COMPRESSION_LADDER.entries()) {
    const out = `${base}-${i}.mp4`;
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss", cut.startSeconds.toFixed(3),
      "-i", srcPath,
      "-t", duration.toFixed(3),
      "-vf", scaleFilter(step.scale),
      "-c:v", "libx264", "-preset", "medium", "-crf", String(step.crf),
      "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-c:a", "aac", "-b:a", "128k",
      out,
    ], { maxBuffer: 1024 * 1024 * 32 });

    const size = (await stat(out)).size;
    if (size <= VIDEO_MAX_BYTES) {
      const mb = (size / 1024 / 1024).toFixed(1);
      return { file: out, note: `${mb}MB (crf ${step.crf}${step.scale ? `, ${step.scale}p` : ""})` };
    }
    await unlink(out).catch(() => {});
  }
  throw new Error(`part ${cut.position} could not be brought under ${VIDEO_MAX_BYTES / 1024 / 1024}MB`);
}

// ── job lifecycle ───────────────────────────────────────────────────────────

/** Optimistic claim. The UPDATE is conditional on the row still being queued,
 *  so two workers racing for the same job produce exactly one winner. */
async function claimJob(jobId: string | undefined, workerName: string): Promise<JobRow | null> {
  let candidate: JobRow | null = null;

  if (jobId) {
    const { data } = await supabaseAdmin.from("video_sequence_jobs").select("*").eq("id", jobId).maybeSingle();
    candidate = (data as JobRow | null) ?? null;
    if (!candidate) throw new Error(`no render job with id ${jobId}`);
    // Idempotency: a finished job is never re-run, however it is invoked.
    if (candidate.status === "succeeded") return candidate;
    if (candidate.status !== "queued") throw new Error(`job ${jobId} is ${candidate.status}, not queued`);
  } else {
    const { data } = await supabaseAdmin
      .from("video_sequence_jobs")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1);
    candidate = ((data as JobRow[] | null) ?? [])[0] ?? null;
    if (!candidate) return null;
  }

  if (candidate.attempts >= candidate.max_attempts) {
    await failJob(candidate.id, `exhausted ${candidate.max_attempts} attempts`);
    return null;
  }

  const { data: claimed } = await supabaseAdmin
    .from("video_sequence_jobs")
    .update({
      status: "running",
      claimed_by: workerName,
      claimed_at: new Date().toISOString(),
      attempts: candidate.attempts + 1,
    })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  // No row back means another worker claimed it first. Not an error.
  return (claimed as JobRow | null) ?? null;
}

async function failJob(jobId: string, reason: string): Promise<void> {
  await supabaseAdmin
    .from("video_sequence_jobs")
    .update({ status: "failed", error: reason.slice(0, 2000), finished_at: new Date().toISOString() })
    .eq("id", jobId);
}

function parseCutPoints(raw: unknown): CutPoint[] {
  const list = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(list)) throw new Error("cut_points is not an array");
  return list.map((c: Record<string, unknown>) => ({
    position: Number(c.position),
    isPreview: Boolean(c.is_preview ?? c.isPreview),
    startSeconds: Number(c.start_seconds ?? c.startSeconds),
    endSeconds: Number(c.end_seconds ?? c.endSeconds),
    priceStars: c.price_stars === null || c.price_stars === undefined
      ? (c.priceStars === null || c.priceStars === undefined ? null : Number(c.priceStars))
      : Number(c.price_stars),
    caption: (c.caption as string | null) ?? null,
    requiresPosition: c.requires_position === null || c.requires_position === undefined
      ? (c.requiresPosition === null || c.requiresPosition === undefined ? null : Number(c.requiresPosition))
      : Number(c.requires_position),
    standaloneSaleAllowed: Boolean(c.standalone_sale_allowed ?? c.standaloneSaleAllowed ?? false),
  }));
}

/**
 * The single publish step.
 *
 * Parts are rewritten wholesale before the revision flips, so a retry of a job
 * that died after uploading some clips cannot leave a stale manifest behind.
 * The order matters: nothing selects an unpublished revision, so parts existing
 * without a published revision is invisible, while a published revision with
 * missing parts would be a product that cannot be delivered.
 */
async function publish(job: JobRow, cuts: CutPoint[], rendered: RenderedClip[]): Promise<void> {
  const byPosition = new Map(rendered.map((r) => [r.position, r]));

  const { error: clearErr } = await supabaseAdmin
    .from("video_sequence_parts")
    .delete()
    .eq("revision_id", job.revision_id);
  if (clearErr) throw new Error(`could not clear previous parts: ${clearErr.message}`);

  const rows = cuts.map((cut) => partRow(cut, byPosition.get(cut.position)!, job.revision_id));
  const { error: insertErr } = await supabaseAdmin.from("video_sequence_parts").insert(rows);
  if (insertErr) throw new Error(`could not write the manifest: ${insertErr.message}`);

  const { error: pubErr } = await supabaseAdmin
    .from("video_sequence_revisions")
    .update({
      state: "published",
      approved_by: job.approved_by,
      approved_at: job.approved_at,
      published_at: new Date().toISOString(),
    })
    .eq("id", job.revision_id);
  if (pubErr) throw new Error(`could not publish the revision: ${pubErr.message}`);
}

async function runJob(job: JobRow, dryRun: boolean): Promise<void> {
  const workDir = await mkdtemp(path.join(tmpdir(), "seqrender-"));
  const uploaded: string[] = [];
  try {
    const cuts = parseCutPoints(job.cut_points);

    // Download the source. Explicit storage path, not a videos lookup: the
    // source may have been withdrawn from the catalogue mid-render.
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .download(job.source_storage_path);
    if (dlErr || !blob) throw new Error(`could not download the source: ${dlErr?.message ?? "no data"}`);
    const srcPath = path.join(workDir, "source.mp4");
    await writeFile(srcPath, Buffer.from(await blob.arrayBuffer()));

    // Measure the real file. Cut points are validated against this, never
    // against a duration anyone typed.
    const sourceDuration = await probeDuration(srcPath);

    // Re-validate at render time. A job can sit queued while the revision
    // changes underneath it.
    const errors = validateCutList(cuts, { sourceDurationSeconds: sourceDuration });
    if (errors.length) {
      throw new Error(`cut list rejected: ${errors.map((e) => `[${e.code}] ${e.message}`).join(" ")}`);
    }

    console.log(`job ${job.id}: ${cuts.length} part(s) from a ${sourceDuration.toFixed(1)}s source`);

    const rendered: RenderedClip[] = [];
    for (const cut of cuts) {
      const { file, note } = await renderClip(srcPath, cut, workDir);

      const actual = await probeDuration(file);
      if (!durationWithinTolerance(actual, cut)) {
        throw new Error(
          `part ${cut.position} rendered ${actual.toFixed(2)}s but ${(cut.endSeconds - cut.startSeconds).toFixed(2)}s was approved`,
        );
      }
      if (!(await hasVideoStream(file))) throw new Error(`part ${cut.position} has no video stream`);

      const storagePath = clipStoragePath(job.clone_id, job.revision_id, cut.position);
      if (dryRun) {
        console.log(`  WOULD RENDER part ${cut.position}: ${actual.toFixed(1)}s, ${note}`);
      } else {
        const bytes = await readFile(file);
        const { error: upErr } = await supabaseAdmin.storage
          .from(MEDIA_BUCKET)
          .upload(storagePath, bytes, { contentType: "video/mp4", upsert: true });
        if (upErr) throw new Error(`part ${cut.position} upload failed: ${upErr.message}`);
        uploaded.push(storagePath);
        console.log(`  part ${cut.position}: ${actual.toFixed(1)}s, ${note}`);
      }
      rendered.push({ position: cut.position, storagePath, durationSeconds: actual });
      await unlink(file).catch(() => {});
    }

    const decision = decidePublish(cuts, rendered, job.status);
    if (!decision.publish) {
      if (decision.reason === "already_published") {
        console.log(`job ${job.id}: already published, nothing to do`);
        return;
      }
      throw new Error(`refusing to publish: parts ${decision.missing.join(", ")} did not render`);
    }

    if (dryRun) {
      console.log(`DRY RUN: would publish ${decision.parts} part(s) and mark the revision published`);
      return;
    }

    await publish(job, cuts, rendered);
    await supabaseAdmin
      .from("video_sequence_jobs")
      .update({ status: "succeeded", error: null, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    console.log(`job ${job.id}: published ${decision.parts} part(s)`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Nothing partial may remain visible. The revision was never flipped, and
    // any clips already uploaded are removed so a later attempt starts clean.
    if (uploaded.length) {
      await supabaseAdmin.storage.from(MEDIA_BUCKET).remove(uploaded).catch(() => {});
    }
    if (!dryRun) await failJob(job.id, reason);
    console.error(`job ${job.id} failed: ${reason}`);
    process.exitCode = 1;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main(): Promise<void> {
  const jobId = arg("job");
  const workerName = arg("worker") ?? `render-${process.pid}`;
  const dryRun = process.argv.includes("--dry-run");
  const once = process.argv.includes("--once") || Boolean(jobId);

  do {
    const job = await claimJob(jobId, workerName);
    if (!job) {
      console.log("no queued render jobs");
      return;
    }
    if (job.status === "succeeded") {
      console.log(`job ${job.id}: already succeeded, nothing to do`);
      return;
    }
    await runJob(job, dryRun);
  } while (!once);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
