import { withAdmin, ok, jsonError, logAdminWrite } from "@/lib/api-route";
import { resolveClone } from "@/lib/api-read";
import {
  postStory,
  previewStory,
  deleteStory,
  postToChannel,
  deleteChannelPost,
  mediaFromUrl,
  mediaFromCatalogue,
  PostingUnavailableError,
  TelegramApiError,
  type MediaInput,
} from "@/lib/posting";
import {
  PostingInputError,
  checkUrl,
  normalizeChannelRef,
  parseActivePeriod,
  parseBool,
  parseButtons,
  parseOverlay,
  parsePreviewMode,
  parseStarPrice,
} from "@/lib/posting-validate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── The write half of the posting API ────────────────────────────────────────
//
// Named actions, each one Telegram call through the girl's OWN clone bot. No
// database writes at all: nothing here changes a row, it only posts. Every
// action that reaches Telegram is audited via logAdminWrite (system_logs).
// Every action takes dryRun=true, which runs every check (live rights, media
// size, story crop, caption rules) and returns what would be sent.
//
// Body: multipart/form-data (to upload files as `file`, repeatable) or JSON
// (media by `mediaUrl` / `mediaUrls`, https only).
//
//   Any action that takes media also takes photoId / videoId (and photoIds /
//   videoIds) from her own content bucket, see GET /posting/media.
//
//   action=story         clone, file|mediaUrl, [mediaType photo|video],
//                         [caption], [activePeriod 6h|12h|24h|48h, default 24h],
//                         [linkUrl], [overlay], [previewImage],
//                         [postToChatPage], [protectContent], [fit=false to
//                         skip the 1080x1920 crop], [dryRun]
//
//     caption   Telegram's own story caption text (plain, max 2048). It is NOT
//               drawn on the picture: Telegram shows it small at the bottom.
//     linkUrl   https:// or tg:// link. The Bot API has no visible link button
//               for a story, so on its own this is an INVISIBLE tappable area
//               (70% x 8% near the bottom). With overlay.button the area is
//               shrunk to the exact rectangle of the drawn button.
//     overlay   (photos only) text and a button burned into the 1080x1920
//               pixels with sharp, so the story shows a real visible button:
//                 {
//                   "caption": "new clips on my app"            or an object:
//                     { text (1-120), position top|middle|bottom (default
//                       bottom), size 24-120 (default 62), color #hex (white),
//                       strokeColor #hex (black), strokeWidth 0-12 (2),
//                       shadow true|false (true) },
//                   "button": "OPEN MY APP"                      or an object:
//                     { label (1-24), position top|middle|bottom (bottom),
//                       size 24-90 (50), background #hex (white), textColor
//                       #hex (#111111), shape pill|rounded|square (pill),
//                       arrow true|false (true: draws " >" after the label) },
//                   "scrim": true                                or an object:
//                     { position bottom|top, heightPct 10-80 (38), color #hex
//                       (black), opacity 0.05-0.95 (0.6) }
//                 }
//               overlay is JSON (a string in multipart). A button needs
//               linkUrl. A caption and a button in the same slot stack
//               (caption above the button). Colours are #RGB or #RRGGBB.
//               Em and en dashes in text become ", ". Labels may not contain
//               links, @names, emoji or symbols. Button text must have at
//               least 2:1 contrast on its background. Long text shrinks to
//               fit (down to 32px for buttons, 28px for captions), then 400.
//               Unknown keys and bad values are 400, never ignored. A video
//               story with an overlay is 400. With fit=false the image must
//               already be exactly 1080x1920.
//     previewImage  true|base64|file|both, with dryRun=true: the response gets
//               previewBase64 (JPEG, base64) and/or previewPath (a file under
//               the server's temp dir) so the look can be seen before posting.
//               The response's wouldPost.overlay lists the pixel rectangles and
//               the exact linkArea (Bot API percentages) that would be sent.
//   action=story_preview  render only: file|mediaUrl (or photoId + clone),
//                         overlay, [linkUrl, needed for a button], [fit],
//                         [previewImage, default base64]. No Telegram call, no
//                         clone bot or story right needed, nothing posted or
//                         audited. Use it to iterate on a look quickly.
//   action=delete_story   clone, storyId
//   action=channel_post   clone and/or channel (@name; defaults to her profile
//                         channel), [text], [file...|mediaUrl|mediaUrls],
//                         [buttons JSON [{text,url,style?}] or rows], [pin],
//                         [starPrice 1-10000 → paid media], [silent],
//                         [protectContent], [dryRun]
//                         brand=tsocial posts to @tsocialchannel with
//                         @TSocialAppBot instead (any girl's photoId works)
//   action=delete_channel_post  clone and/or channel, messageIds (JSON array or comma list)
//
// What Telegram allows on a channel post button (Bot API 10.3, checked
// 2026-10-26): url buttons only here, up to 8 rows of 1-4, text up to 64. The
// only styling is InlineKeyboardButton.style = primary (blue), success (green)
// or danger (red); there is NO custom colour, gradient or shape on a channel
// button, so a hex colour is refused rather than faked. Older Telegram apps
// ignore style. An album (2+ media) cannot carry buttons at all. For a custom
// coloured button, burn it into a photo (story overlay or the photo itself).
//
// 400 bad input, 404 unknown clone, 409 target not available right now (the
// reason says which right is missing), 502 Telegram refused.

type Action = "story" | "story_preview" | "delete_story" | "channel_post" | "delete_channel_post";

type Body = { get(k: string): unknown; getAll(k: string): unknown[] };

async function readBody(req: Request): Promise<Body> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    return { get: (k) => form.get(k) ?? undefined, getAll: (k) => form.getAll(k) };
  }
  const json = (await req.json()) as Record<string, unknown>;
  return {
    get: (k) => json[k],
    getAll: (k) => (Array.isArray(json[k]) ? (json[k] as unknown[]) : json[k] === undefined ? [] : [json[k]]),
  };
}

async function readMedia(b: Body, cloneId: string | null): Promise<MediaInput[]> {
  const files = b.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const out: MediaInput[] = [];
  for (const f of files) out.push({ bytes: Buffer.from(await f.arrayBuffer()), mime: f.type, filename: f.name });
  const urls = [...b.getAll("mediaUrl"), ...b.getAll("mediaUrls").flat()].map(String).filter(Boolean);
  for (const u of urls) out.push(await mediaFromUrl(u));
  // From her own content bucket (GET /posting/media lists the ids).
  const ids = [
    ...[...b.getAll("photoId"), ...b.getAll("photoIds").flat()].map((id) => ["photo", String(id)] as const),
    ...[...b.getAll("videoId"), ...b.getAll("videoIds").flat()].map((id) => ["video", String(id)] as const),
  ].filter(([, id]) => id);
  if (ids.length && !cloneId) throw new PostingInputError("photoId / videoId need clone");
  for (const [kind, id] of ids) out.push(await mediaFromCatalogue(cloneId as string, kind, id));
  return out;
}

async function cloneIdOf(b: Body, required: boolean): Promise<string | null> {
  const key = String(b.get("clone") ?? "").trim();
  if (!key) {
    if (required) throw new PostingInputError("clone is required (uuid, slug or name)");
    return null;
  }
  const c = await resolveClone(key);
  if (!c) throw new NotFound(`no clone matching "${key}"`);
  return c.id;
}

class NotFound extends Error {}

function numberList(raw: unknown, field: string): number[] {
  let v: unknown = raw;
  if (typeof raw === "string") v = raw.trim().startsWith("[") ? JSON.parse(raw) : raw.split(",");
  const list = (Array.isArray(v) ? v : [v]).map((x) => Number(String(x).trim()));
  if (!list.length || list.some((n) => !Number.isInteger(n) || n <= 0)) throw new PostingInputError(`${field} must be message ids`);
  return list;
}

export const POST = withAdmin(async (req) => {
  let b: Body;
  try {
    b = await readBody(req);
  } catch {
    return jsonError("body must be JSON or multipart/form-data", 400);
  }
  const action = String(b.get("action") ?? "") as Action;
  const dryRun = parseBool(b.get("dryRun"));

  try {
    switch (action) {
      case "story": {
        const cloneId = (await cloneIdOf(b, true)) as string;
        const media = await readMedia(b, cloneId);
        if (media.length !== 1) return jsonError("a story takes exactly one file or mediaUrl", 400);
        const linkRaw = b.get("linkUrl");
        const result = await postStory({
          cloneId,
          media: media[0],
          mediaType: b.get("mediaType"),
          caption: String(b.get("caption") ?? ""),
          activePeriod: parseActivePeriod(b.get("activePeriod")),
          linkUrl: linkRaw ? checkUrl(linkRaw, "linkUrl") : null,
          postToChatPage: parseBool(b.get("postToChatPage")),
          protectContent: parseBool(b.get("protectContent")),
          fit: b.get("fit") === undefined ? true : parseBool(b.get("fit")),
          overlay: parseOverlay(b.get("overlay")),
          preview: parsePreviewMode(b.get("previewImage")),
          dryRun,
        });
        if (!dryRun) logAdminWrite("posting:story", cloneId, { ...result.posted });
        return ok({ action, ...result });
      }

      case "story_preview": {
        // Render only. No Telegram call, no clone bot needed (clone is only
        // required to use photoId/videoId), nothing posted, nothing audited.
        const cloneId = await cloneIdOf(b, false);
        const media = await readMedia(b, cloneId);
        if (media.length !== 1) return jsonError("a story preview takes exactly one file or mediaUrl", 400);
        const linkRaw = b.get("linkUrl");
        const result = await previewStory({
          media: media[0],
          mediaType: b.get("mediaType"),
          linkUrl: linkRaw ? checkUrl(linkRaw, "linkUrl") : null,
          fit: b.get("fit") === undefined ? true : parseBool(b.get("fit")),
          overlay: parseOverlay(b.get("overlay")),
          preview: parsePreviewMode(b.get("previewImage")),
        });
        return ok({ action, ...result });
      }

      case "delete_story": {
        const cloneId = (await cloneIdOf(b, true)) as string;
        const storyId = Number(b.get("storyId"));
        if (!Number.isInteger(storyId) || storyId <= 0) return jsonError("storyId is required", 400);
        const result = await deleteStory(cloneId, storyId);
        logAdminWrite("posting:delete_story", cloneId, result);
        return ok({ action, ...result });
      }

      case "channel_post": {
        const cloneId = await cloneIdOf(b, false);
        const result = await postToChannel({
          cloneId,
          channel: normalizeChannelRef(b.get("channel")),
          brand: b.get("brand") ? String(b.get("brand")) : null,
          text: String(b.get("text") ?? b.get("caption") ?? ""),
          media: await readMedia(b, cloneId),
          mediaType: b.get("mediaType"),
          buttons: parseButtons(b.get("buttons")),
          pin: parseBool(b.get("pin")),
          starPrice: parseStarPrice(b.get("starPrice")),
          silent: parseBool(b.get("silent")),
          protectContent: parseBool(b.get("protectContent")),
          dryRun,
        });
        if (!result.dryRun) logAdminWrite("posting:channel_post", cloneId, { ...result.posted, warnings: result.warnings });
        return ok({ action, ...result });
      }

      case "delete_channel_post": {
        const cloneId = await cloneIdOf(b, false);
        const result = await deleteChannelPost(
          cloneId,
          normalizeChannelRef(b.get("channel")),
          numberList(b.get("messageIds"), "messageIds"),
          b.get("brand") ? String(b.get("brand")) : null,
        );
        logAdminWrite("posting:delete_channel_post", cloneId, result);
        return ok({ action, ...result });
      }

      default:
        return jsonError("action must be story, story_preview, delete_story, channel_post or delete_channel_post", 400);
    }
  } catch (e) {
    if (e instanceof PostingInputError) return jsonError(e.message, 400);
    if (e instanceof NotFound) return jsonError(e.message, 404);
    if (e instanceof PostingUnavailableError) return jsonError(e.message, 409);
    if (e instanceof TelegramApiError) return jsonError(`Telegram refused: ${e.message}`, 502);
    throw e;
  }
});
