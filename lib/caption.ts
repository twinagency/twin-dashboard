import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { orVisionDetailed, type VisionCallMeta } from "./openrouter";
import { withRetry } from "./retry";
import {
  MEDIA_CLASSIFICATION_PROMPT, normalizeMediaClassification, videoClassificationPrompt, secondLookKeys, secondLookPrompt,
  applySecondLook, type NormalizedMedia,
} from "./media-classification";
import { VISION_ANALYSIS_DEFAULT_MODEL, resolveVisionAnalysisModel } from "./vision-model";
import { generateSendCaption } from "./send-caption";
import { ANALYSIS_VERSION, type AnalysisResult } from "./media-analysis-contract";

const execFileAsync = promisify(execFile);

export { VISION_ANALYSIS_DEFAULT_MODEL, resolveVisionAnalysisModel };

// Timeouts. Each vision call gets its own deadline; the whole analysis (calls, retries, backoff) gets a hard ceiling. The
// old code let one 12s timer cover the call AND its retry, so the retry never had time to run.
export const VISION_CALL_TIMEOUT_MS = 40_000;
// Budget: 2 first-pass attempts (40s each) + the video second look (40s) with a little backoff slack.
export const SECOND_LOOK_TIMEOUT_MS = 40_000;
export const ANALYSIS_TOTAL_BUDGET_MS = 150_000;
const MAX_ATTEMPTS = 2; // one extra look for a malformed or self-contradictory answer
const MAX_TOKENS = 1500;

export type VisionCall = (a: { model: string; dataUrl: string; prompt: string; signal: AbortSignal }) => Promise<{ content: string; meta: VisionCallMeta }>;
/** Test seams only; production passes nothing. */
export type AnalysisDeps = {
  call?: VisionCall;
  writeCaption?: (user: string) => Promise<string>;
};

const realCall: VisionCall = (a) =>
  orVisionDetailed({ model: a.model, dataUrl: a.dataUrl, prompt: a.prompt, json: true, signal: a.signal, maxTokens: MAX_TOKENS, temperature: 0 });

function parseJson(raw: string): unknown {
  return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}

function failed(model: string, error: string, latencyMs = 0, costUsd: number | null = null, provider: string | null = null): AnalysisResult {
  return { status: "failed", model, provider, latencyMs, costUsd, error: error.slice(0, 300), version: ANALYSIS_VERSION };
}

async function observe(
  dataUrl: string,
  basePrompt: string,
  kind: "photo" | "video",
  frames: number | undefined,
  configuredModel: string | null | undefined,
  signal: AbortSignal | undefined,
  deps: AnalysisDeps,
): Promise<AnalysisResult> {
  const model = resolveVisionAnalysisModel(configuredModel);
  const call = deps.call ?? realCall;
  const total = AbortSignal.timeout(ANALYSIS_TOTAL_BUDGET_MS);
  const overall = signal ? AbortSignal.any([signal, total]) : total;

  let latencyMs = 0, costUsd: number | null = null, provider: string | null = null;
  let lastError = "analysis did not run";
  let normalized: NormalizedMedia | null = null;
  let parsed: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !overall.aborted; attempt++) {
    const prompt = attempt === 1 ? basePrompt
      : `${basePrompt}\nYour previous answer was rejected: ${lastError}. Look again and answer every evidence key with "yes", "no" or "unclear", and make identifying, details, short_label, visible and tags agree with the evidence.`;
    try {
      const { content, meta } = await withRetry(
        () => call({ model, dataUrl, prompt, signal: AbortSignal.any([overall, AbortSignal.timeout(VISION_CALL_TIMEOUT_MS)]) }),
        2, { baseMs: 1000, signal: overall },
      );
      latencyMs += meta.latencyMs;
      if (meta.costUsd !== null) costUsd = (costUsd ?? 0) + meta.costUsd;
      provider = meta.provider ?? provider;
      parsed = parseJson(content);
      normalized = normalizeMediaClassification(parsed, { frames });
      if (!normalized.contradictions.length) break;
      lastError = `the text claimed things the evidence does not support (${normalized.contradictions[0]})`;
    } catch (e) {
      normalized = null;
      lastError = String((e as Error)?.message ?? e).slice(0, 240);
      if (overall.aborted) { lastError = "analysis timed out"; break; }
      if (/OpenRouter (400|401|402|403|404)/.test(lastError)) break; // credits, auth or a dead model: a second call cannot help
    }
  }
  if (!normalized) return failed(model, lastError, latencyMs, costUsd, provider);

  // Video only: one bounded second look at the high-stakes keys. Anything not re-confirmed becomes "unclear" (needs_review).
  let secondLookNote: string | null = null;
  const lookKeys = kind === "video" && frames !== undefined ? secondLookKeys(normalized.fields.visual_facts.evidence) : [];
  if (lookKeys.length && !overall.aborted) {
    let answer: unknown = null, why = "second look did not run";
    try {
      const { content, meta } = await call({
        model, dataUrl, prompt: secondLookPrompt(frames!, lookKeys),
        signal: AbortSignal.any([overall, AbortSignal.timeout(SECOND_LOOK_TIMEOUT_MS)]),
      });
      latencyMs += meta.latencyMs;
      if (meta.costUsd !== null) costUsd = (costUsd ?? 0) + meta.costUsd;
      provider = meta.provider ?? provider;
      answer = parseJson(content); why = "";
    } catch (e) { why = `second look failed: ${String((e as Error)?.message ?? e).slice(0, 100)}`; }
    const { value, downgraded } = applySecondLook(parsed, lookKeys, answer);
    if (downgraded.length) {
      normalized = normalizeMediaClassification(value, { frames });
      secondLookNote = `second look did not confirm ${downgraded.join(", ")}${why ? ` (${why})` : ""}`;
    }
  }
  if (!normalized) return failed(model, lastError, latencyMs, costUsd, provider);
  const fields = { ...normalized.fields };
  const status = secondLookNote ? "needs_review" : normalized.status;
  // The legacy send caption only for rows that analysed cleanly. needs_review rows never get one (null = V1 uses auto_desc).
  const caption = status === "analysed" ? await generateSendCaption(fields, kind, deps.writeCaption) : null;
  const error = status === "needs_review"
    ? (secondLookNote ?? normalized.contradictions[0] ?? normalized.issues[0] ?? "needs review")
    : undefined;
  return {
    status, fields: { ...fields, caption }, model, provider, latencyMs, costUsd,
    ...(error ? { error: error.slice(0, 300) } : {}), version: ANALYSIS_VERSION,
  };
}

/** Analyse a photo: downscale to 768px, one vision call (plus at most one corrective retry).
 * To force a model (eval), pass it as `configuredModel`; resolveVisionAnalysisModel is the only place that may rewrite it. */
export async function analysePhoto(bytes: Buffer, configuredModel: string | null | undefined, signal?: AbortSignal, deps: AnalysisDeps = {}): Promise<AnalysisResult> {
  const model = resolveVisionAnalysisModel(configuredModel);
  try {
    const resized = await sharp(bytes).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    return await observe(`data:image/jpeg;base64,${resized.toString("base64")}`, MEDIA_CLASSIFICATION_PROMPT, "photo", undefined, configuredModel, signal, deps);
  } catch (e) {
    return failed(model, `photo unreadable: ${String((e as Error)?.message ?? e)}`);
  }
}

// ---- video: bounded representative sampling ------------------------------------------------------------------------------
export const VIDEO_SAMPLE_FRAMES = 5;
const SHEET_COLUMNS = 3;
const SHEET_CELL = 448;

/** Evenly spaced offsets across the clip, away from the first/last instant (fades, black frames). */
export function sampleOffsets(durationSeconds: number, frames = VIDEO_SAMPLE_FRAMES): number[] {
  if (!(durationSeconds > 0)) return [0];
  const n = Math.max(1, Math.min(frames, Math.floor(durationSeconds) + 1));
  return Array.from({ length: n }, (_, i) => +(durationSeconds * (n === 1 ? 0.5 : 0.1 + (0.8 * i) / (n - 1))).toFixed(2));
}

/** Tile frames left to right, top to bottom into ONE jpeg contact sheet (one vision call sees separate frames). */
export async function contactSheet(frames: Buffer[]): Promise<Buffer> {
  const cols = Math.min(SHEET_COLUMNS, frames.length);
  const rows = Math.ceil(frames.length / SHEET_COLUMNS);
  const cells = await Promise.all(frames.map((f) =>
    sharp(f).resize(SHEET_CELL, SHEET_CELL, { fit: "contain", background: "#000" }).jpeg({ quality: 80 }).toBuffer()));
  return sharp({ create: { width: cols * SHEET_CELL, height: rows * SHEET_CELL, channels: 3, background: "#000" } })
    .composite(cells.map((input, i) => ({ input, left: (i % SHEET_COLUMNS) * SHEET_CELL, top: Math.floor(i / SHEET_COLUMNS) * SHEET_CELL })))
    .jpeg({ quality: 80 }).toBuffer();
}

async function probeDuration(inPath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", inPath]);
  return Number.parseFloat(stdout.trim());
}

/** Analyse a video from 5 evenly spaced frames tiled in ONE contact sheet and ONE call. The facts are about those frames only. */
export async function analyseVideo(bytes: Buffer, configuredModel: string | null | undefined, signal?: AbortSignal, deps: AnalysisDeps = {}): Promise<AnalysisResult> {
  const model = resolveVisionAnalysisModel(configuredModel);
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const inPath = path.join(tmpdir(), `cap-${stamp}.mp4`);
  const outs: string[] = [];
  let sheet: Buffer, count: number;
  try {
    await writeFile(inPath, bytes);
    const offsets = sampleOffsets(await probeDuration(inPath));
    const frames: Buffer[] = [];
    for (const [i, t] of offsets.entries()) {
      const out = path.join(tmpdir(), `cap-${stamp}-${i}.jpg`);
      outs.push(out);
      await execFileAsync("ffmpeg", ["-y", "-ss", String(t), "-i", inPath, "-vframes", "1", "-vf", "scale=640:-1", out]);
      frames.push(await readFile(out));
    }
    count = frames.length;
    sheet = await contactSheet(frames);
  } catch (e) {
    return failed(model, `video frames unavailable: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  } finally {
    await Promise.all([inPath, ...outs].map((p) => unlink(p).catch(() => {})));
  }
  return observe(`data:image/jpeg;base64,${sheet.toString("base64")}`, videoClassificationPrompt(count), "video", count, configuredModel, signal, deps);
}
