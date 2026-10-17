import { withAdmin, ok, jsonError, logAdminWrite } from "@/lib/api-route";
import { resolveClone } from "@/lib/api-read";
import {
  postStory,
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
//   action=story          clone, file|mediaUrl, [mediaType photo|video],
//                         [caption], [activePeriod 6h|12h|24h|48h, default 24h],
//                         [linkUrl] (tappable pill near the bottom),
//                         [postToChatPage], [protectContent], [fit=false to
//                         skip the 1080x1920 crop], [dryRun]
//   action=delete_story   clone, storyId
//   action=channel_post   clone and/or channel (@name; defaults to her profile
//                         channel), [text], [file...|mediaUrl|mediaUrls],
//                         [buttons JSON [{text,url}] or rows], [pin],
//                         [starPrice 1-10000 → paid media], [silent],
//                         [protectContent], [dryRun]
//                         brand=tsocial posts to @tsocialchannel with
//                         @TSocialAppBot instead (any girl's photoId works)
//   action=delete_channel_post  clone and/or channel, messageIds (JSON array or comma list)
//
// 400 bad input, 404 unknown clone, 409 target not available right now (the
// reason says which right is missing), 502 Telegram refused.

type Action = "story" | "delete_story" | "channel_post" | "delete_channel_post";

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
          dryRun,
        });
        if (!dryRun) logAdminWrite("posting:story", cloneId, { ...result.posted });
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
        return jsonError("action must be story, delete_story, channel_post or delete_channel_post", 400);
    }
  } catch (e) {
    if (e instanceof PostingInputError) return jsonError(e.message, 400);
    if (e instanceof NotFound) return jsonError(e.message, 404);
    if (e instanceof PostingUnavailableError) return jsonError(e.message, 409);
    if (e instanceof TelegramApiError) return jsonError(`Telegram refused: ${e.message}`, 502);
    throw e;
  }
});
