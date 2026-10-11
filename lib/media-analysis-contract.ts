// Shared shape of the factual media analysis. The V2 bot (twin-sexbot src/media.ts) and the repair batch read
// `visual_facts` in exactly this shape, so change it only together with them.

export const ANALYSIS_VERSION = 2;

export const FACT_KEYS = [
  "nipples", "genitals", "anus", "bare_buttocks", "full_nudity", "sexual_activity",
  "sex_toy", "swimwear", "lingerie", "mirror_reflection", "suggestive_pose",
] as const;
export type FactKey = (typeof FACT_KEYS)[number];
export type Tri = "yes" | "no" | "unclear";

/** Stored in photos/videos.visual_facts. Only "yes" is evidence; "no" and "unclear" never make a tag, flag or match. */
export type VisualFacts = {
  v: typeof ANALYSIS_VERSION;
  evidence: Record<FactKey, Tri>;
  visible: string[]; // short confirmed phrases: garments with colours, setting, objects, pose
  frames?: number; // videos: how many sampled frames the facts come from
};

export type AnalysisStatus = "legacy" | "pending" | "analysed" | "needs_review" | "failed";

export type AnalysisFields = {
  auto_desc: string;
  tags: string[];
  visual_description: string;
  visual_facts: VisualFacts;
  explicitness: "none" | "suggestive" | "explicit";
  is_nude: boolean;
  nsfw: boolean;
  caption?: string | null; // legacy send caption written FROM the facts; never evidence
};

export type AnalysisResult = {
  status: Exclude<AnalysisStatus, "legacy" | "pending">;
  fields?: AnalysisFields; // absent when status is "failed"
  model: string; // effective model actually requested
  provider: string | null; // provider OpenRouter reported
  latencyMs: number;
  costUsd: number | null;
  error?: string;
  version: typeof ANALYSIS_VERSION;
};

/** Columns added by twin-bot db/migrations/20261012000000_media_analysis_state.sql on photos and videos. */
export const ANALYSIS_COLUMNS = [
  "analysis_status", "analysis_version", "analysis_model", "analysis_provider",
  "analysis_error", "analysed_at", "visual_facts", "metadata_edited_at",
] as const;

/** Fields a person can correct by hand; a change to any of them sets metadata_edited_at and protects the row from batch repair. */
export const FACT_FIELDS = ["caption", "tags", "auto_desc", "visual_description", "explicitness", "is_nude", "nsfw"] as const;

// Entry points (implemented in lib/caption.ts):
//   analysePhoto(bytes: Buffer, configuredModel: string | null, signal?: AbortSignal): Promise<AnalysisResult>
//   analyseVideo(bytes: Buffer, configuredModel: string | null, signal?: AbortSignal): Promise<AnalysisResult>
