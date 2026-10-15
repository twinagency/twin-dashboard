import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { orChat, orVisionDetailed, type VisionCallMeta } from "./openrouter";
import {
  ANALYSIS_VERSION, MEDIA_CLASSIFICATION_PROMPT, VIDEO_CLASSIFICATION_PROMPT, normalizeMediaClassification,
  type VisualFacts,
} from "./media-classification";
import { SEND_CAPTION_MODEL, SEND_CAPTION_SYSTEM, acceptCaption, fallbackCaption } from "./send-caption";

const execFileAsync = promisify(execFile);

export type AnalysisStatus = "ok" | "review" | "failed" | "pending";

/** Stored as photos.analysis / videos.analysis. NULL on a row = analysed before provenance existed ("legacy"). */
export type AnalysisRecord = {
  status: AnalysisStatus;
  version: number;
  model_configured: string | null;
  model_effective: string | null;     // what OpenRouter says actually answered
  provider: string | null;
  at: string;
  attempts: number;
  latency_ms: number | null;
  cost_usd: number | null;
  error: string | null;
  issues?: string[];
  caption_source?: "written" | "fallback";
  manual?: boolean;                   // an operator edited facts: automatic repair must not overwrite them
  manual_at?: string;
  price_source?: "guide" | "manual";  // where star_value came from at upload (a guide price may be re-derived after analysis)
  facts?: VisualFacts;
};

export type Caption = {
  caption: string;          // legacy first-person send caption; written text-only from the facts (never by the vision call)
  teaser_caption: string;   // legacy, new uploads store NULL
  is_nude: boolean;
  explicitness: "none" | "suggestive" | "explicit";
  nsfw: boolean;
  tags: string[];           // derived from the confirmed observations
  auto_desc: string;        // short factual label
  visual_description: string; // derived from the same observations; the text V1/V2 read as evidence
  facts?: VisualFacts;
  status?: "ok" | "review";
  issues?: string[];
};

export const EMPTY_CAPTION: Caption = {
  caption: "", teaser_caption: "", is_nude: false, explicitness: "none", nsfw: false, tags: [], auto_desc: "", visual_description: "",
};

export type Analysed = { caption: Caption; analysis: AnalysisRecord };

// ---- model resolution ---------------------------------------------------------------------------------------------
// qwen3-vl-32b truncates its JSON on this payload (and OpenRouter retired it) and Gemini sanitises explicit output, so
// either configured model is replaced. Everything else the clone has configured is used as configured.
export const VISION_ANALYSIS_DEFAULT_MODEL = "qwen/qwen2.5-vl-72b-instruct";
export function resolveVisionAnalysisModel(configuredModel: string | null | undefined): string {
  const m = (configuredModel || "").toLowerCase();
  if (m.includes("gemini") || m.includes("qwen3-vl-32b")) return VISION_ANALYSIS_DEFAULT_MODEL;
  return configuredModel || VISION_ANALYSIS_DEFAULT_MODEL;
}

/** Request settings per model, evaluated through this very path (see the model comparison report). */
export type VisionProfile = {
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  providerOrder?: string[];
  allowFallbacks?: boolean;
};
const DEFAULT_PROFILE: VisionProfile = { temperature: 0.2, maxTokens: 1500, timeoutMs: 30_000 };
export const VISION_PROFILES: Record<string, VisionProfile> = {
  "qwen/qwen2.5-vl-72b-instruct": { temperature: 0.2, maxTokens: 1500, timeoutMs: 30_000 },
  "qwen/qwen3-vl-235b-a22b-instruct": { temperature: 0.2, maxTokens: 1500, timeoutMs: 90_000, providerOrder: ["deepinfra"], allowFallbacks: false },
};
export function visionProfile(model: string): VisionProfile {
  return VISION_PROFILES[model] ?? DEFAULT_PROFILE;
}
/** How long an upload waits for the analysis before saving the file as "pending" for the automatic retry. */
export function analysisTimeoutMs(configuredModel: string | null | undefined): number {
  return visionProfile(resolveVisionAnalysisModel(configuredModel)).timeoutMs;
}

// ---- the observation call -----------------------------------------------------------------------------------------
function parseJson(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(t);
}

export type AnalyseOptions = {
  model: string;                       // the clone's configured model
  signal?: AbortSignal;
  /** test seam: replaces the network call (never used in production) */
  call?: (a: { model: string; images: string[]; prompt: string; profile: VisionProfile; signal?: AbortSignal }) => Promise<{ content: string; meta: VisionCallMeta }>;
  /** test seam for the text-only send-caption step */
  writeCaption?: (facts: VisualFacts) => Promise<string>;
};

const MAX_ATTEMPTS = 2; // bounded: one retry for an invalid, self-contradictory or unresolved answer

async function observe(images: string[], scope: "still" | "sampled_frames", opts: AnalyseOptions): Promise<Analysed> {
  const configured = opts.model || null;
  const effectiveModel = resolveVisionAnalysisModel(opts.model);
  const profile = visionProfile(effectiveModel);
  const base = scope === "sampled_frames"
    ? VIDEO_CLASSIFICATION_PROMPT.replace(/\bN frames\b/, `${images.length} frames`)
    : MEDIA_CLASSIFICATION_PROMPT;
  const call = opts.call ?? (async (a) => orVisionDetailed({
    model: a.model, dataUrls: a.images, prompt: a.prompt, json: true, signal: a.signal,
    maxTokens: a.profile.maxTokens, temperature: a.profile.temperature,
    providerOrder: a.profile.providerOrder, allowFallbacks: a.profile.allowFallbacks,
  }));

  let attempts = 0, latency = 0, cost: number | null = null, lastMeta: VisionCallMeta | null = null;
  let lastError = "analysis did not run";
  let best: ReturnType<typeof normalizeMediaClassification> | null = null;

  for (; attempts < MAX_ATTEMPTS;) {
    attempts++;
    const prompt = attempts === 1 ? base
      : `${base}\nYour previous answer was rejected: ${lastError}. Look at the image again and answer every feature with "yes", "no" or "unsure", keeping the summary, details and tags consistent with the features.`;
    try {
      const { content, meta } = await call({ model: effectiveModel, images, prompt, profile, signal: opts.signal });
      lastMeta = meta; latency += meta.latencyMs; if (meta.costUsd !== null) cost = (cost ?? 0) + meta.costUsd;
      const result = normalizeMediaClassification(parseJson(content), { scope, frames: scope === "sampled_frames" ? images.length : undefined });
      best = result;
      if (result.status === "ok") break;           // clean
      lastError = `these features were unresolved: ${result.issues.join("; ")}`; // one more look for an unresolved answer
    } catch (e) {
      lastError = String((e as Error)?.message ?? e).slice(0, 240);
      if (opts.signal?.aborted) break;
      if (/OpenRouter (401|402|403)/.test(lastError)) break; // credits/auth: a second call cannot help
    }
  }

  const at = new Date().toISOString();
  const common = {
    version: ANALYSIS_VERSION, model_configured: configured, model_effective: lastMeta?.model ?? effectiveModel,
    provider: lastMeta?.provider ?? null, at, attempts, latency_ms: latency || null, cost_usd: cost,
  };
  if (!best) {
    return { caption: { ...EMPTY_CAPTION }, analysis: { status: "failed", ...common, error: lastError } };
  }

  // The legacy send caption: text-only, from the facts, guarded against the same facts.
  let caption = "", captionSource: "written" | "fallback" = "fallback";
  try {
    const written = opts.writeCaption
      ? await opts.writeCaption(best.facts)
      : await orChat({ model: SEND_CAPTION_MODEL, system: SEND_CAPTION_SYSTEM, user: `Facts about this ${scope === "sampled_frames" ? "video" : "photo"}: ${best.visual_description}`, temperature: 0.9 });
    const ok = acceptCaption(written, best.facts);
    if (ok) { caption = ok; captionSource = "written"; }
  } catch { /* fall through to the truthful fallback */ }
  if (!caption) caption = fallbackCaption(best.facts);

  const { facts, status, issues, ...fields } = best;
  return {
    caption: { ...fields, caption, facts, status, issues },
    analysis: { status, ...common, error: null, issues, caption_source: captionSource, facts },
  };
}

// Analyse a photo: downscale to 768px, then vision.
export async function analysePhoto(bytes: Buffer, opts: AnalyseOptions): Promise<Analysed> {
  const resized = await sharp(bytes).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return observe([`data:image/jpeg;base64,${resized.toString("base64")}`], "still", opts);
}

/** A failed or still-running analysis of an upload that is kept: not confident metadata, retried automatically. */
export function unanalysed(status: "failed" | "pending", model: string | null, error: string | null): Analysed {
  return {
    caption: { ...EMPTY_CAPTION, status: undefined },
    analysis: {
      status, version: ANALYSIS_VERSION, model_configured: model, model_effective: null, provider: null,
      at: new Date().toISOString(), attempts: 0, latency_ms: null, cost_usd: null, error,
    },
  };
}

// ---- video: bounded representative sampling -----------------------------------------------------------------------
export const VIDEO_SAMPLE_FRAMES = 5;
export const VIDEO_FRAME_WIDTH = 640;

/** Evenly spaced offsets across the clip, away from the first/last instant (fades, black frames). */
export function sampleOffsets(durationSeconds: number, frames = VIDEO_SAMPLE_FRAMES): number[] {
  if (!(durationSeconds > 0)) return [0];
  const n = Math.max(1, Math.min(frames, Math.floor(durationSeconds) + 1));
  return Array.from({ length: n }, (_, i) => +(durationSeconds * (n === 1 ? 0.5 : 0.1 + (0.8 * i) / (n - 1))).toFixed(2));
}

async function probeDuration(inPath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", inPath]);
  return Number.parseFloat(stdout.trim());
}

// Analyse a video: up to VIDEO_SAMPLE_FRAMES frames in ONE vision request. The description is limited to what those
// frames show, and "absent" is never recorded for a clip (see normalizeMediaClassification scope).
export async function analyseVideo(bytes: Buffer, opts: AnalyseOptions): Promise<Analysed> {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const inPath = path.join(tmpdir(), `cap-${stamp}.mp4`);
  const outs: string[] = [];
  try {
    await writeFile(inPath, bytes);
    const duration = await probeDuration(inPath);
    const offsets = sampleOffsets(duration);
    const frames: string[] = [];
    for (const [i, t] of offsets.entries()) {
      const out = path.join(tmpdir(), `cap-${stamp}-${i}.jpg`);
      outs.push(out);
      await execFileAsync("ffmpeg", ["-y", "-ss", String(t), "-i", inPath, "-vframes", "1", "-vf", `scale=${VIDEO_FRAME_WIDTH}:-1`, out]);
      frames.push(`data:image/jpeg;base64,${(await readFile(out)).toString("base64")}`);
    }
    return await observe(frames, "sampled_frames", opts);
  } catch (e) {
    return unanalysed("failed", opts.model || null, `video frames unavailable: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
  } finally {
    await unlink(inPath).catch(() => {});
    await Promise.all(outs.map((p) => unlink(p).catch(() => {})));
  }
}

// ---- compatibility wrappers (import scripts) -----------------------------------------------------------------------
export async function captionPhoto(bytes: Buffer, model: string, signal?: AbortSignal): Promise<Caption> {
  const { caption, analysis } = await analysePhoto(bytes, { model, signal });
  if (analysis.status === "failed") throw new Error(analysis.error ?? "analysis failed");
  return caption;
}
export async function captionVideo(bytes: Buffer, model: string, signal?: AbortSignal): Promise<Caption> {
  const { caption, analysis } = await analyseVideo(bytes, { model, signal });
  if (analysis.status === "failed") throw new Error(analysis.error ?? "analysis failed");
  return caption;
}
