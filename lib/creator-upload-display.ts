export type CreatorUpload = {
  id: string;
  kind: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_transfer_status: string | null;
};

export type UploadMedia = "photo" | "video" | "audio" | "file";

export function uploadMedia(file: CreatorUpload): UploadMedia {
  if (file.mime_type?.startsWith("image/")) return "photo";
  if (file.mime_type?.startsWith("video/")) return "video";
  if (file.mime_type?.startsWith("audio/")) return "audio";
  if (file.kind.endsWith("_image")) return "photo";
  if (file.kind.endsWith("_video")) return "video";
  if (file.kind === "voice") return "audio";
  return "file";
}

export function uploadLabel(file: CreatorUpload): string {
  const kind = uploadMedia(file);
  return file.original_name || ({ photo: "Photo", video: "Video", audio: "Voice sample", file: "File" })[kind];
}

export function uploadSize(bytes: number | null): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function creatorUploadUrl(accountId: string, fileId: string, download = false): string {
  const query = new URLSearchParams({ account: accountId, file: fileId });
  if (download) query.set("download", "1");
  return `/agency/creators/file?${query}`;
}
