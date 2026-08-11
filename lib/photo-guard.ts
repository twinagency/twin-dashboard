// ── THE UPLOAD GATE for photos that will be sold through sendPaidMedia ──────
//
// The library must never be able to hold a photo that Telegram will refuse,
// because a refused paid item is unsellable and the fan silently gets nothing.
// See lib/telegram-limits.ts for the incident and the source of the numbers.
//
// This is the SERVER side, and it is the real gate. The browser check in
// app/media/MediaManager.tsx exists only so the operator finds out before the
// upload starts; a client check is advice, not a gate, since the server action
// is callable without it.
//
// It runs on the exact bytes that get stored, which are the exact bytes the
// bot later hands to Telegram (flows/media.ts reads the stored object back and
// sends it as an InputFile the first time), so there is nothing between this
// measurement and the send that can change the dimensions.

import sharp from "sharp";
import { checkPhotoBytes, checkPhotoDimensions } from "./telegram-limits";

/**
 * Throw unless Telegram would accept these bytes as a photo. Returns the
 * measured dimensions so callers can log or store them.
 *
 * Call it BEFORE the storage upload and the row insert, never after: the point
 * is that the rejected item never reaches the library at all.
 */
export async function assertPhotoSendable(bytes: Buffer): Promise<{ width: number; height: number }> {
  const size = checkPhotoBytes(bytes.byteLength);
  if (!size.ok) throw new Error(size.message);

  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(bytes).metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    // Unreadable by sharp is handled by checkPhotoDimensions' "unreadable"
    // branch below, with a message an operator can act on, rather than by
    // letting a decoder error escape as a stack trace.
  }

  const verdict = checkPhotoDimensions(width, height);
  if (!verdict.ok) throw new Error(verdict.message);
  return { width: verdict.width, height: verdict.height };
}
