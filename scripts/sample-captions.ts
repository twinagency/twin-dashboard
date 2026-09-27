/**
 * Generate 10 sample captions (5 photos + 5 videos) with the new caption
 * prompt, from real explicit media across different creators, for the owner
 * to review. READ-ONLY: nothing is written back to the DB.
 *
 * Run:
 *   node --env-file=.env ../bot/node_modules/.bin/tsx --tsconfig scripts/tsconfig.json scripts/sample-captions.ts
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { supabaseAdmin } from "../lib/supabase";
import { captionPhoto, captionVideo } from "../lib/caption";

const execFileAsync = promisify(execFile);

// qwen2.5-vl-72b-instruct is what app/media/actions.ts already falls back to
// when a clone has no vision_model set. Testing against the hardest real
// photo in this sample set (explicit toy use) showed qwen3-vl-32b-instruct
// (several clones' current per-clone setting) deterministically truncates
// its JSON response mid-caption on that image across repeated attempts, and
// google/gemini-2.5-flash (another clone's setting) writes a visibly softer,
// less explicit caption than the prompt asks for. qwen2.5-vl-72b-instruct
// completed every sample cleanly and matched the requested voice, so all 10
// samples below use it uniformly rather than each clone's own vision_model,
// to show the new prompt's ceiling rather than get confounded by a
// per-clone model problem. See report for the vision_model recommendation.
const SAMPLE_MODEL = "qwen/qwen2.5-vl-72b-instruct";

const NSFW_HINTS = ["topless", "ass", "pussy", "shower", "dildo", "nude", "naked", "tits", "anal", "vagina"];
const OUT_DIR = "/home/ronan/twin/caption-samples";

type Row = {
  id: string;
  clone_id: string;
  storage_path: string;
  auto_desc: string | null;
  tags: string[] | null;
  caption: string | null;
};

function hay(r: Row): string {
  return `${r.auto_desc ?? ""} ${r.caption ?? ""} ${(r.tags ?? []).join(" ")}`.toLowerCase();
}

async function pickCandidates(table: "photos" | "videos", count: number): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, clone_id, storage_path, auto_desc, tags, caption")
    .eq("nsfw", true)
    .not("storage_path", "is", null)
    .limit(1000);
  if (error) throw error;

  const hinted = (data ?? []).filter((r) => NSFW_HINTS.some((h) => hay(r).includes(h)));

  const seenClone = new Set<string>();
  const picked: Row[] = [];
  for (const r of hinted) {
    if (seenClone.has(r.clone_id)) continue;
    picked.push(r);
    seenClone.add(r.clone_id);
    if (picked.length >= count + 4) break; // a few backups in case a download/caption call fails
  }
  return picked;
}

async function extractVideoFrame(bytes: Buffer): Promise<Buffer> {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const inPath = path.join(tmpdir(), `sample-${stamp}.mp4`);
  const outPath = path.join(tmpdir(), `sample-${stamp}.jpg`);
  try {
    await writeFile(inPath, bytes);
    await execFileAsync("ffmpeg", ["-y", "-ss", "00:00:02", "-i", inPath, "-vframes", "1", "-vf", "scale=768:-1", outPath]);
    return await readFile(outPath);
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const photoCandidates = await pickCandidates("photos", 5);
  const videoCandidates = await pickCandidates("videos", 5);

  const cloneIds = [...new Set([...photoCandidates, ...videoCandidates].map((c) => c.clone_id))];
  const { data: clones, error: cloneErr } = await supabaseAdmin.from("clones").select("id, name, vision_model").in("id", cloneIds);
  if (cloneErr) throw cloneErr;
  const cloneById = new Map((clones ?? []).map((c) => [c.id, c]));

  const results: string[] = [];
  let n = 0;

  async function processOne(row: Row, kind: "photo" | "video"): Promise<boolean> {
    const clone = cloneById.get(row.clone_id);
    const creatorName = (clone?.name ?? row.clone_id).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    console.log(`\n[${kind}] ${clone?.name ?? row.clone_id} — ${row.storage_path}`);

    const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("media").download(row.storage_path);
    if (dlErr || !blob) {
      console.log(`  DOWNLOAD FAILED: ${dlErr?.message ?? "no blob"}`);
      return false;
    }
    const bytes = Buffer.from(await blob.arrayBuffer());

    let seenImage: Buffer;
    let cap;
    try {
      if (kind === "photo") {
        seenImage = await sharp(bytes).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
        cap = await captionPhoto(bytes, SAMPLE_MODEL);
      } else {
        seenImage = await extractVideoFrame(bytes);
        cap = await captionVideo(bytes, SAMPLE_MODEL);
      }
    } catch (e) {
      console.log(`  CAPTION FAILED: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    if (!cap.caption) {
      console.log(`  CAPTION EMPTY (best-effort fallback triggered)`);
      return false;
    }

    n++;
    const fileName = `${String(n).padStart(2, "0")}-${kind}-${creatorName}.jpg`;
    await writeFile(path.join(OUT_DIR, fileName), await sharp(seenImage).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer());

    const entry = [
      `#${n}  ${fileName}`,
      `Creator     : ${clone?.name ?? row.clone_id}`,
      `Type        : ${kind}`,
      `Item id     : ${row.id}`,
      `Storage path: ${row.storage_path}`,
      `Model used  : ${SAMPLE_MODEL}${clone?.vision_model && clone.vision_model !== SAMPLE_MODEL ? ` (creator's configured vision_model is "${clone.vision_model}")` : ""}`,
      `Description : ${cap.description || "(none)"}`,
      `Caption     : ${cap.caption}`,
      `Uncertainty : ${cap.uncertainty || "(none)"}`,
      "",
    ].join("\n");
    results.push(entry);
    console.log(`  OK -> ${fileName}`);
    return true;
  }

  let photoOk = 0;
  for (const row of photoCandidates) {
    if (photoOk >= 5) break;
    if (await processOne(row, "photo")) photoOk++;
  }
  let videoOk = 0;
  for (const row of videoCandidates) {
    if (videoOk >= 5) break;
    if (await processOne(row, "video")) videoOk++;
  }

  const header = `Caption sample review — generated ${new Date().toISOString()}\nNew prompt: lib/media-classification.ts MEDIA_CLASSIFICATION_PROMPT. Nothing written to the DB.\nPhoto samples: ${photoOk}/5. Video samples: ${videoOk}/5.\n${"=".repeat(80)}\n\n`;
  await writeFile(path.join(OUT_DIR, "results.txt"), header + results.join("\n"), "utf8");
  console.log(`\nSaved ${photoOk} photo + ${videoOk} video samples to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
