import sharp from "sharp";

export const CREATOR_IMAGE_MAX_PIXELS = 25_000_000;
export const CREATOR_IMAGE_MAX_EDGE = 12_000;
export const CREATOR_IMAGE_MAX_CHANNELS = 4;
export const CREATOR_IMAGE_PROBE_EDGE = 32;
export const CREATOR_IMAGE_DECODE_TIMEOUT_SECONDS = 5;

const imageInputOptions: sharp.SharpOptions = {
  failOn: "warning",
  limitInputPixels: CREATOR_IMAGE_MAX_PIXELS,
  sequentialRead: true,
  pages: 1,
  animated: false,
  unlimited: false,
};

const expectedFormat: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

// Uploads pass a server-owned staged path, avoiding a whole-file RAM copy.
// Pixel, channel, format and decoder-time limits still apply independently.
export async function creatorImageDecodes(input: Uint8Array | string, mime: string): Promise<boolean> {
  try {
    const metadata = await sharp(input, imageInputOptions).metadata();
    if (!metadata.width || !metadata.height || metadata.format !== expectedFormat[mime]) return false;
    if (metadata.width > CREATOR_IMAGE_MAX_EDGE || metadata.height > CREATOR_IMAGE_MAX_EDGE) return false;
    if (metadata.width * metadata.height > CREATOR_IMAGE_MAX_PIXELS) return false;
    if (!metadata.channels || metadata.channels > CREATOR_IMAGE_MAX_CHANNELS) return false;

    const { data, info } = await sharp(input, imageInputOptions)
      .rotate()
      .resize({
        width: CREATOR_IMAGE_PROBE_EDGE,
        height: CREATOR_IMAGE_PROBE_EDGE,
        fit: "inside",
        withoutEnlargement: true,
        fastShrinkOnLoad: true,
      })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .timeout({ seconds: CREATOR_IMAGE_DECODE_TIMEOUT_SECONDS })
      .toBuffer({ resolveWithObject: true });

    return info.width > 0 && info.height > 0 && info.channels > 0
      && data.length === info.width * info.height * info.channels;
  } catch {
    return false;
  }
}

