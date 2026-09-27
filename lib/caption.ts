import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { orVision } from "./openrouter";
import { MEDIA_CLASSIFICATION_PROMPT, normalizeMediaClassification } from "./media-classification";

const execFileAsync = promisify(execFile);

export type Caption = {
  caption: string;          // factual description for AI matching
  teaser_caption: string;   // flirty message shown to the fan (varied emoji)
  is_nude: boolean;
  explicitness: "none" | "suggestive" | "explicit";
  // AI auto-tags — drive both live media matching and category pricing.
  nsfw: boolean;            // is it sexually explicit?
  tags: string[];          // subset of MEDIA_TAGS describing what's shown
  auto_desc: string;       // very short description, e.g. "bikini pool"
  // Factual, explicit, 3-6 sentence visual description saved to its own DB
  // column (photos.visual_description / videos.visual_description). Never
  // read by the bot's `caption` matching path; see media-classification.ts
  // for the exact prompt contract.
  visual_description: string;
};

const FALLBACK: Caption = {
  caption: "",
  teaser_caption: "",
  is_nude: false,
  explicitness: "none",
  nsfw: false,
  tags: [],
  auto_desc: "",
  visual_description: "",
};

// qwen3-vl-32b truncates its JSON response mid-string on the longer payload
// this analysis now produces (caption + tags + evidence + visual_description),
// and Gemini sanitises explicit output; qwen2.5-vl-72b-instruct handled full
// NSFW output cleanly in testing. Force it whenever the clone's configured
// vision model is one of those two, regardless of the operator's per-clone
// dial; otherwise use the clone's configured model (falling back to the same
// default when none is set).
export const VISION_ANALYSIS_DEFAULT_MODEL = "qwen/qwen2.5-vl-72b-instruct";
export function resolveVisionAnalysisModel(configuredModel: string | null | undefined): string {
  const m = (configuredModel || "").toLowerCase();
  if (m.includes("gemini") || m.includes("qwen3-vl-32b")) return VISION_ANALYSIS_DEFAULT_MODEL;
  return configuredModel || VISION_ANALYSIS_DEFAULT_MODEL;
}

async function visionCaption(jpegBytes: Buffer, model: string, signal?: AbortSignal): Promise<Caption> {
  const dataUrl = `data:image/jpeg;base64,${jpegBytes.toString("base64")}`;
  // Applied here, not by each caller, so every entry point (upload, the
  // bulk importer, the backfill script) gets the same forced substitution
  // whenever the clone's configured model is one of the two known to
  // truncate/sanitise this payload. See resolveVisionAnalysisModel above.
  const effectiveModel = resolveVisionAnalysisModel(model);
  // Retry contradictory metadata once, under the upload's existing abort
  // deadline. Never save an unsupported topless/nude claim from either attempt.
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = MEDIA_CLASSIFICATION_PROMPT + (attempt
      ? "\nThe previous answer was invalid or internally contradictory. Re-examine the image and make every description and evidence field agree."
      : "");
    // The added visual_description field lengthens the JSON payload, so give
    // it more headroom than orVision's own 1000-token default.
    const raw = await orVision({ model: effectiveModel, dataUrl, prompt, json: true, signal, maxTokens: 1500 });
    try {
      return normalizeMediaClassification(JSON.parse(raw));
    } catch (error) {
      if (attempt === 1 || signal?.aborted) throw error;
    }
  }
  throw new Error("Unable to validate visual metadata");
}

// Caption a photo: downscale to 768px, then vision.
export async function captionPhoto(bytes: Buffer, model: string, signal?: AbortSignal): Promise<Caption> {
  const resized = await sharp(bytes).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return visionCaption(resized, model, signal);
}

// Caption a video: pull one frame ~1s in via ffmpeg, then vision on that frame.
export async function captionVideo(bytes: Buffer, model: string, signal?: AbortSignal): Promise<Caption> {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const inPath = path.join(tmpdir(), `cap-${stamp}.mp4`);
  const outPath = path.join(tmpdir(), `cap-${stamp}.jpg`);
  try {
    await writeFile(inPath, bytes);
    await execFileAsync("ffmpeg", ["-y", "-ss", "00:00:01", "-i", inPath, "-vframes", "1", "-vf", "scale=768:-1", outPath]);
    const frame = await readFile(outPath);
    return await visionCaption(frame, model, signal);
  } catch {
    return FALLBACK;
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}
