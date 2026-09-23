import sharp from "sharp";
import { assertPhotoSendable } from "./photo-guard";

const TELEGRAM_MAX_DIMENSION_SUM = 10_000;
const SAFE_DIMENSION_SUM = 9_900;
const JPEG_QUALITIES = [88, 78, 68, 58, 48] as const;

/**
 * Convert a browser upload into bytes Telegram can actually send.
 *
 * Modern phone photos can exceed Telegram's width+height limit or its byte
 * ceiling even when the browser can preview them. Rather than rejecting a
 * perfectly usable photo, auto-orient it, scale it just below the dimension
 * ceiling and progressively compress it. Extreme panorama shapes still fail
 * with the existing actionable guard message because resizing cannot change
 * their aspect ratio.
 */
export async function preparePhotoForTelegram(raw: Buffer): Promise<Buffer> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(raw).metadata();
  } catch {
    throw new Error("This image could not be read. Export it as a standard JPG or PNG and try again.");
  }

  const sourceWidth = metadata.width;
  const sourceHeight = metadata.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("This image has no readable dimensions. Export it as a standard JPG or PNG and try again.");
  }

  const longSide = Math.max(sourceWidth, sourceHeight);
  const shortSide = Math.min(sourceWidth, sourceHeight);
  if (longSide / shortSide > 20) {
    throw new Error("This image is too panoramic for Telegram. Crop it to a less extreme shape and try again.");
  }

  const initialScale =
    sourceWidth + sourceHeight >= TELEGRAM_MAX_DIMENSION_SUM
      ? SAFE_DIMENSION_SUM / (sourceWidth + sourceHeight)
      : 1;
  let width = Math.max(1, Math.floor(sourceWidth * initialScale));
  let height = Math.max(1, Math.floor(sourceHeight * initialScale));

  for (const quality of JPEG_QUALITIES) {
    const jpeg = await sharp(raw)
      .rotate()
      .resize({ width, height, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    try {
      await assertPhotoSendable(jpeg);
      return jpeg;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.toLowerCase().includes("large")) throw error;
      width = Math.max(1, Math.floor(width * 0.88));
      height = Math.max(1, Math.floor(height * 0.88));
    }
  }

  throw new Error("This image is still too large after compression. Export a smaller JPG and try again.");
}
