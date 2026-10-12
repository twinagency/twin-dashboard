// Which vision model the media analysis actually runs. Pure (no server-only) so the clone config UI can show the effective
// model next to the configured one. This is the ONE place that decides it: the model chosen from the eval is set here.
//
// qwen3-vl-32b was retired by OpenRouter (2026-10-09) and used to truncate the analysis JSON; Gemini sanitises explicit
// output. Either configured model is replaced. The selected Qwen3.8 profile is photo-only; video retains the baseline.
export const VISION_ANALYSIS_DEFAULT_MODEL = "qwen/qwen3-vl-235b-a22b-instruct";
// Owner-selected photo candidate, evaluated on 15 retained photos on 12 October.
// Opt in with vision_model after release acceptance; this commit does not rewrite creator settings.
export const PHOTO_ANALYSIS_SELECTED_MODEL = "qwen/qwen3.8-27b";

export function resolveVisionAnalysisModel(configuredModel: string | null | undefined, kind: "photo" | "video" = "photo"): string {
  const m = (configuredModel || "").toLowerCase();
  // The accepted comparison covered photos only. A shared creator setting must not silently switch video analysis too.
  if (kind === "video" && m === PHOTO_ANALYSIS_SELECTED_MODEL) return VISION_ANALYSIS_DEFAULT_MODEL;
  if (m.includes("gemini") || m.includes("qwen3-vl-32b")) return VISION_ANALYSIS_DEFAULT_MODEL;
  return configuredModel || VISION_ANALYSIS_DEFAULT_MODEL;
}

export const VISION_CALL_TIMEOUT_MS = 40_000;
export const SECOND_LOOK_TIMEOUT_MS = 40_000;
export const ANALYSIS_TOTAL_BUDGET_MS = 150_000;

export type VisionProfile = {
  callTimeoutMs: number;
  secondLookTimeoutMs: number;
  totalBudgetMs: number;
  request: {
    maxTokens: number;
    provider?: { only: string[]; allow_fallbacks: false };
    reasoning?: { effort: "xhigh"; exclude: true };
    textFirst?: boolean;
  };
};

/** The exact tested transport settings, also used for corrective attempts and the existing second look. */
export function visionProfile(model: string): VisionProfile {
  if (model.toLowerCase() === PHOTO_ANALYSIS_SELECTED_MODEL) return {
    callTimeoutMs: 240_000,
    secondLookTimeoutMs: 240_000,
    // Two corrective-attempt slots plus one second look and backoff slack; retries share this ceiling.
    totalBudgetMs: 750_000,
    request: {
      maxTokens: 16_384,
      provider: { only: ["deepinfra"], allow_fallbacks: false },
      reasoning: { effort: "xhigh", exclude: true },
      textFirst: true,
    },
  };
  return {
    callTimeoutMs: VISION_CALL_TIMEOUT_MS,
    secondLookTimeoutMs: SECOND_LOOK_TIMEOUT_MS,
    totalBudgetMs: ANALYSIS_TOTAL_BUDGET_MS,
    request: { maxTokens: 1500 },
  };
}

/** Used by both existing model controls so the photo-only override is visible before saving. */
export function describeVisionAnalysisModels(configuredModel: string, photoOverride?: string | null): string {
  const photo = resolveVisionAnalysisModel(configuredVisionModel({ vision_model: configuredModel, photo_vision_model: photoOverride }, "photo"), "photo");
  const video = resolveVisionAnalysisModel(configuredModel, "video");
  if (photo === PHOTO_ANALYSIS_SELECTED_MODEL) return `photos: ${photo} (DeepInfra); videos: ${video}`;
  return photoOverride?.trim() ? `photos: ${photo}; videos: ${video}` : photo;
}


/** A photo-only creator override leaves the configured video model unchanged. */
export function configuredVisionModel(row: { vision_model?: string | null; photo_vision_model?: string | null } | null | undefined, kind: "photo" | "video"): string {
  return (kind === "photo" ? row?.photo_vision_model?.trim() : null) || row?.vision_model || VISION_ANALYSIS_DEFAULT_MODEL;
}
