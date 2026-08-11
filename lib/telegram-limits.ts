// ── Telegram's limits on a photo, as one shared source of truth ─────────────
//
// WHY THIS EXISTS. Photo 09e900dd-3b7c-4e69-a51c-670f7316fff0, priced at 2800
// stars, was accepted by this dashboard's upload path and then refused by
// Telegram on every single send:
//
//   PAID MEDIA SEND FAILED (photo 09e900dd-..., 2800 stars)
//   Bad Request: PHOTO_INVALID_DIMENSIONS
//
// Ten times on 2026-08-08 to one fan, plus a campaign step for another. The
// send fails SAFE (Telegram paid media is deliver-then-unlock, so nothing was
// delivered and nothing was charged, see sendPaidMedia in
// ../bot/src/services/telegram-messenger.ts), but a 2800-star item that can
// never be sent is unsellable and the fan just gets nothing. The upload path
// checked bytes only, so the library could hold an item with no way out.
//
// SOURCE FOR THE NUMBERS. Telegram Bot API, sendPhoto
// (https://core.telegram.org/bots/api#sendphoto), verbatim:
//
//   "The photo must be at most 10 MB in size. The photo's width and height
//    must not exceed 10000 in total. Width and height ratio must be at most 20."
//
// InputPaidMediaPhoto and sendPaidMedia publish no separate numbers, so paid
// photos are held to sendPhoto's. Both ceilings are inclusive ("must not
// exceed", "at most"), so exactly 10000 in total and exactly 20:1 are allowed
// and the checks below use > rather than >=.
//
// These are the limits that can be CONFIRMED from the published API. Telegram
// may refuse a photo for reasons it does not document; the guard cannot know
// about those, which is why the bot's send path still has to keep failing
// safe. What this removes is the case we can see coming.

/** Telegram's own ceiling is 10 MB. Stay under it, as the upload path always has. */
export const PHOTO_MAX_BYTES = 9.5 * 1024 * 1024;

/** Telegram's documented ceiling on the photo's own file size. */
export const PHOTO_TELEGRAM_MAX_MB = 10;

/** width + height must not exceed this. */
export const PHOTO_MAX_TOTAL_DIMENSION = 10000;

/** longer side / shorter side must not exceed this. */
export const PHOTO_MAX_DIMENSION_RATIO = 20;

export type PhotoDimensionVerdict =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: "unreadable" | "total" | "ratio"; message: string };

// Every rejection message is read by an operator mid-upload, so it says what
// the file is, which limit it broke, what the limit is, what happens if it
// goes out anyway, and what to do about it. No em dashes (dashboard/CLAUDE.md).
export function checkPhotoDimensions(
  width: number | undefined | null,
  height: number | undefined | null,
): PhotoDimensionVerdict {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return {
      ok: false,
      reason: "unreadable",
      message:
        "Could not read this image's width and height, so there is no way to tell whether Telegram would accept it. Re-export it as a normal JPEG or PNG and upload it again.",
    };
  }

  const total = width + height;
  if (total > PHOTO_MAX_TOTAL_DIMENSION) {
    return {
      ok: false,
      reason: "total",
      message:
        `Telegram will not send this photo. It is ${width} x ${height}, so its width plus height is ${total}, over Telegram's limit of ${PHOTO_MAX_TOTAL_DIMENSION}. ` +
        `A paid send of it fails with PHOTO_INVALID_DIMENSIONS, which means the fan receives nothing and is charged nothing, so the item is unsellable. ` +
        `Resize it so width plus height is ${PHOTO_MAX_TOTAL_DIMENSION} or less, then upload it again.`,
    };
  }

  const ratio = Math.max(width, height) / Math.min(width, height);
  if (ratio > PHOTO_MAX_DIMENSION_RATIO) {
    return {
      ok: false,
      reason: "ratio",
      message:
        `Telegram will not send this photo. It is ${width} x ${height}, a ${ratio.toFixed(1)} to 1 shape, over Telegram's limit of ${PHOTO_MAX_DIMENSION_RATIO} to 1. ` +
        `A paid send of it fails with PHOTO_INVALID_DIMENSIONS, which means the fan receives nothing and is charged nothing, so the item is unsellable. ` +
        `Crop it so the longer side is at most ${PHOTO_MAX_DIMENSION_RATIO} times the shorter side, then upload it again.`,
    };
  }

  return { ok: true, width, height };
}

/** Byte-size half of the same gate, kept here so both halves quote one number. */
export function checkPhotoBytes(byteLength: number): { ok: true } | { ok: false; message: string } {
  if (byteLength > PHOTO_MAX_BYTES) {
    return {
      ok: false,
      message: `Photo too large (${(byteLength / 1024 / 1024).toFixed(1)} MB). Telegram's limit is ${PHOTO_TELEGRAM_MAX_MB} MB, so this upload path stays under ${(PHOTO_MAX_BYTES / 1024 / 1024).toFixed(1)} MB.`,
    };
  }
  return { ok: true };
}

/** One line for the upload UI, so the operator sees the rules before picking files. */
export const PHOTO_LIMITS_HINT =
  `Telegram limits: width plus height at most ${PHOTO_MAX_TOTAL_DIMENSION}, shape at most ${PHOTO_MAX_DIMENSION_RATIO} to 1, ${PHOTO_TELEGRAM_MAX_MB} MB. Anything past those can never be sent.`;
