export const CREATOR_CONTENT_REQUIREMENTS = [
  { kind: "content_sfw_image", label: "SFW images", shortLabel: "SFW images", media: "image", minimum: 20, accept: "image/jpeg,image/png,image/webp,image/gif", formatHint: "JPG, PNG, WebP or GIF · max 25 MP and 15 MB each" },
  { kind: "content_nsfw_image", label: "NSFW images", shortLabel: "NSFW images", media: "image", minimum: 30, accept: "image/jpeg,image/png,image/webp,image/gif", formatHint: "JPG, PNG, WebP or GIF · max 25 MP and 15 MB each" },
  { kind: "content_sfw_video", label: "SFW videos", shortLabel: "SFW videos", media: "video", minimum: 15, accept: "video/mp4,video/quicktime,video/webm", formatHint: "MP4, MOV or WebM · max 30 minutes" },
  { kind: "content_nsfw_video", label: "NSFW videos", shortLabel: "NSFW videos", media: "video", minimum: 30, accept: "video/mp4,video/quicktime,video/webm", formatHint: "MP4, MOV or WebM · max 30 minutes" },
] as const;

export type CreatorContentKind = (typeof CREATOR_CONTENT_REQUIREMENTS)[number]["kind"];
export type CreatorContentMedia = (typeof CREATOR_CONTENT_REQUIREMENTS)[number]["media"];

export type CreatorContentFile = {
  kind: string;
  storage_transfer_status?: string | null;
};

export function creatorContentRequirement(kind: string | null | undefined) {
  return CREATOR_CONTENT_REQUIREMENTS.find((requirement) => requirement.kind === kind) || null;
}

export function isCreatorContentKind(kind: string | null | undefined): kind is CreatorContentKind {
  return creatorContentRequirement(kind) !== null;
}

export function isAnyCreatorContentKind(kind: string | null | undefined): boolean {
  return kind === "content" || isCreatorContentKind(kind);
}

export function creatorContentCounts(files: CreatorContentFile[]): Record<CreatorContentKind, number> {
  const counts = Object.fromEntries(CREATOR_CONTENT_REQUIREMENTS.map(({ kind }) => [kind, 0])) as Record<CreatorContentKind, number>;
  for (const file of files) {
    if (file.storage_transfer_status !== "verified" || !isCreatorContentKind(file.kind)) continue;
    counts[file.kind] += 1;
  }
  return counts;
}

export function creatorContentRequirementsMet(files: CreatorContentFile[]): boolean {
  const counts = creatorContentCounts(files);
  return CREATOR_CONTENT_REQUIREMENTS.every(({ kind, minimum }) => counts[kind] >= minimum);
}

export function creatorLegacyContentCount(files: CreatorContentFile[]): number {
  return files.filter((file) => file.kind === "content" && file.storage_transfer_status === "verified").length;
}

export function creatorContentCompleted(files: CreatorContentFile[], previouslyCompleted = false): boolean {
  return creatorContentRequirementsMet(files) || (previouslyCompleted && creatorLegacyContentCount(files) > 0);
}
