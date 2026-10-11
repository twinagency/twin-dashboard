/** Shared creator-facing intake rules. All received content remains private. */
export const CREATOR_CONTENT_INSTRUCTION = "Upload minimum of 50 combined photos and videos of both non explicit (and explicit if applicable) content.";
export const CREATOR_CONTENT_TARGET = 50;
export const CONTENT_FOLDER_KEY = "content_folder_links";
export type ContentFolder = { url: string; provider: "Google Drive" | "Dropbox"; submittedAt: string };
export function contentFolderUrl(value: unknown): { url: string; provider: ContentFolder["provider"] } | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const drive = url.hostname === "drive.google.com" && /^\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
    const dropbox = ["dropbox.com", "www.dropbox.com"].includes(url.hostname) && /^\/(?:scl\/fo|sh)\/[^/]+/.test(url.pathname);
    if (!drive && !dropbox) return null;
    url.hash = "";
    return { url: url.href, provider: drive ? "Google Drive" : "Dropbox" };
  } catch { return null; }
}
export function contentFolders(answers: Record<string, unknown>): ContentFolder[] {
  try {
    const value = JSON.parse(String(answers[CONTENT_FOLDER_KEY] || "[]"));
    return Array.isArray(value) ? value.flatMap(item => {
      const valid = contentFolderUrl(item?.url);
      return valid && typeof item?.submittedAt === "string" ? [{ ...valid, submittedAt: item.submittedAt }] : [];
    }).slice(0, 10) : [];
  } catch { return []; }
}
export function contentMediaKind(file: { type?: string; name: string }): "image" | "video" | null {
  if (/^image\/(jpeg|png|webp|gif)$/.test(file.type || "") || /\.(jpe?g|png|webp|gif)$/i.test(file.name)) return "image";
  if (/^video\/(mp4|quicktime|webm)$/.test(file.type || "") || /\.(mp4|mov|webm)$/i.test(file.name)) return "video";
  return null;
}
