/** Shared file limits. Duration is validated independently by ffprobe. */
export const MAX_CREATOR_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_CREATOR_VIDEO_BYTES = 512 * 1024 * 1024;
export const MAX_CREATOR_VOICE_BYTES = 64 * 1024 * 1024;
export const MAX_CREATOR_REQUEST_BYTES = MAX_CREATOR_VIDEO_BYTES + 2 * 1024 * 1024;
export function creatorUploadMaxBytes(kind: string): number {
  return kind.endsWith("_image") ? MAX_CREATOR_IMAGE_BYTES : kind === "voice" ? MAX_CREATOR_VOICE_BYTES : MAX_CREATOR_VIDEO_BYTES;
}
export function creatorUploadSizeError(kind: string): string {
  return kind.endsWith("_image") ? "Images can be up to 15 MiB each."
    : kind === "voice" ? "Voice recordings can be up to 64 MiB each."
    : "Videos can be up to 512 MiB each. File size is separate from video length.";
}
