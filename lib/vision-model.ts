// Which vision model the media analysis actually runs. Pure (no server-only) so the clone config UI can show the effective
// model next to the configured one. This is the ONE place that decides it: the model chosen from the eval is set here.
//
// qwen3-vl-32b was retired by OpenRouter (2026-10-09) and used to truncate the analysis JSON; Gemini sanitises explicit
// output. Either configured model is replaced; anything else is used as configured.
export const VISION_ANALYSIS_DEFAULT_MODEL = "qwen/qwen2.5-vl-72b-instruct";

export function resolveVisionAnalysisModel(configuredModel: string | null | undefined): string {
  const m = (configuredModel || "").toLowerCase();
  if (m.includes("gemini") || m.includes("qwen3-vl-32b")) return VISION_ANALYSIS_DEFAULT_MODEL;
  return configuredModel || VISION_ANALYSIS_DEFAULT_MODEL;
}
