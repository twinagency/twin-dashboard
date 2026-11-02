import sharp from "sharp";
import { serviceClient } from "./supabase-service";
import { validBlur } from "./catalogue-core";
const previews = new Map<string, { at: number; bytes: Buffer }>();
const pendingPreviews = new Map<string, Promise<Buffer>>();
export async function blurPreview(input: Buffer, blur: number): Promise<Buffer> {
  if (!validBlur(blur)) throw new Error("Preview unavailable.");
  return sharp(input, { limitInputPixels: 40_000_000 })
    .rotate().resize(420, 560, { fit: "inside", withoutEnlargement: true }).blur(blur).webp({ quality: 70 }).toBuffer();
}
// Clear thumbnail. Only for a photo the fan owns (the caller checks ownership first).
export async function ownedPreview(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: 40_000_000 })
    .rotate().resize(420, 560, { fit: "inside", withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
}
export async function renderPreview(path: string, blur: number): Promise<Buffer> {
  const key = `${path}:${blur}`;
  const cached = previews.get(key);
  if (cached && Date.now() - cached.at < 300_000) return cached.bytes;
  const waiting = pendingPreviews.get(key);
  if (waiting) return waiting;
  if (pendingPreviews.size >= 8) throw new Error("Preview busy. Please try again.");
  const work = (async () => {
    const { data: blob, error } = await serviceClient().storage.from("media").download(path);
    if (error) throw new Error("Preview unavailable.");
    if (!blob || blob.size > 20 * 1024 * 1024) throw new Error("Preview unavailable.");
    // Only the transformed derivative leaves the server. No original URLs or EXIF.
    const input = Buffer.from(await blob.arrayBuffer());
    const bytes = blur === 0 ? await ownedPreview(input) : await blurPreview(input, blur);
    while (previews.size >= 80) previews.delete(previews.keys().next().value!);
    previews.set(key, { at: Date.now(), bytes });
    return bytes;
  })();
  pendingPreviews.set(key, work);
  try { return await work; } finally { pendingPreviews.delete(key); }
}

