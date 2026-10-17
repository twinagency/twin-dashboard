// Pure input parsing for the posting API (app/api/admin/v1/posting/*).
//
// No database, no network, no Telegram. Everything here is a function of its
// arguments so scripts/check-posting.ts can prove each rule offline. The
// server half (lib/posting.ts) calls these before it touches Telegram, so a
// bad request is a 400 with a clear reason, never a half-sent post.

export type MediaKind = "photo" | "video";

export class PostingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostingInputError";
  }
}

// ── story lifetime ───────────────────────────────────────────────────────────
// Telegram accepts exactly these four. Callers may say "24", "24h" or "86400".
export const STORY_PERIODS_SECONDS = [21600, 43200, 86400, 172800] as const;
export const DEFAULT_STORY_PERIOD = 86400;

export function parseActivePeriod(raw: unknown): number {
  if (raw === undefined || raw === null || String(raw).trim() === "") return DEFAULT_STORY_PERIOD;
  const s = String(raw).trim().toLowerCase().replace(/h$/, "");
  const n = Number(s);
  if (!Number.isInteger(n)) throw new PostingInputError("activePeriod must be 6h, 12h, 24h or 48h");
  const seconds = n <= 48 ? n * 3600 : n;
  if (!(STORY_PERIODS_SECONDS as readonly number[]).includes(seconds)) {
    throw new PostingInputError("activePeriod must be 6h, 12h, 24h or 48h");
  }
  return seconds;
}

// ── captions and text ────────────────────────────────────────────────────────
// Fan-facing text never carries an em or en dash (house rule). Stripped here
// in code, not just asked for in a prompt, because agents write these.
export const LIMITS = { storyCaption: 2048, mediaCaption: 1024, text: 4096 } as const;

export function cleanText(raw: unknown, max: number, field: string): string {
  const s = String(raw ?? "")
    .replace(/\s*[—–]\s*/g, ", ")
    .trim();
  if (s.length > max) throw new PostingInputError(`${field} is ${s.length} characters, the limit is ${max}`);
  return s;
}

// ── links ────────────────────────────────────────────────────────────────────
export function checkUrl(raw: unknown, field: string): string {
  const s = String(raw ?? "").trim();
  if (!/^(https:\/\/|tg:\/\/)/i.test(s)) throw new PostingInputError(`${field} must start with https:// or tg://`);
  if (s.length > 2048) throw new PostingInputError(`${field} is too long`);
  return s;
}

// The tappable pill used on every story since 2026-10-08: centred, near the
// bottom, wide and rounded. One fixed shape so agents do not have to know the
// StoryArea geometry.
export function storyLinkArea(url: string) {
  return {
    position: {
      x_percentage: 50,
      y_percentage: 90,
      width_percentage: 70,
      height_percentage: 8,
      rotation_angle: 0,
      corner_radius_percentage: 50,
    },
    type: { type: "link", url },
  };
}

// ── buttons ──────────────────────────────────────────────────────────────────
// Accepts [{text,url}] (one button per row) or [[{text,url},...],...] (rows).
// URL buttons only: a channel post has no bot conversation to send a callback
// to, so a callback button would be a dead tap.
export type UrlButton = { text: string; url: string };

export function parseButtons(raw: unknown): UrlButton[][] | null {
  if (raw === undefined || raw === null || raw === "") return null;
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      throw new PostingInputError('buttons must be JSON, e.g. [{"text":"Chat with me","url":"https://t.me/..."}]');
    }
  }
  if (!Array.isArray(v) || v.length === 0) throw new PostingInputError("buttons must be a non-empty array");
  const rows = v.map((r) => (Array.isArray(r) ? r : [r]));
  if (rows.length > 8) throw new PostingInputError("at most 8 rows of buttons");
  return rows.map((row) => {
    if (row.length === 0 || row.length > 4) throw new PostingInputError("each button row holds 1 to 4 buttons");
    return row.map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      const text = cleanText(o.text, 64, "button text");
      if (!text) throw new PostingInputError("every button needs text");
      return { text, url: checkUrl(o.url, "button url") };
    });
  });
}

// ── media ────────────────────────────────────────────────────────────────────
export function mediaKindFor(mime: string, filename: string, explicit?: unknown): MediaKind {
  const e = String(explicit ?? "").toLowerCase();
  if (e === "photo" || e === "video") return e;
  if (e) throw new PostingInputError('mediaType must be "photo" or "video"');
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(filename)) return "video";
  if (mime.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(filename)) return "photo";
  throw new PostingInputError(`cannot tell if ${filename || "the file"} is a photo or a video, pass mediaType`);
}

export const MAX_BYTES: Record<MediaKind, number> = { photo: 10 * 1024 * 1024, video: 50 * 1024 * 1024 };
export const STORY_MAX_VIDEO_BYTES = 30 * 1024 * 1024;

// ── paid media price ─────────────────────────────────────────────────────────
export function parseStarPrice(raw: unknown): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw new PostingInputError("starPrice must be a whole number from 1 to 10000");
  return n;
}

export function parseBool(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === "1" || raw === 1;
}

// ── channel reference ────────────────────────────────────────────────────────
// "@name", "name", "https://t.me/name" or a numeric -100... id.
export function normalizeChannelRef(raw: unknown): string | number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^-100\d{5,}$/.test(s)) return Number(s);
  const m = s.match(/^(?:https?:\/\/)?(?:t\.me\/)?@?([A-Za-z][A-Za-z0-9_]{3,31})$/);
  if (!m) throw new PostingInputError(`"${s}" is not a channel username or id`);
  return `@${m[1]}`;
}

// ── which Bot API call a channel post becomes ────────────────────────────────
export type ChannelPlan =
  | { method: "sendMessage" }
  | { method: "sendPhoto" | "sendVideo" }
  | { method: "sendMediaGroup" }
  | { method: "sendPaidMedia"; starCount: number };

export function planChannelPost(p: {
  text: string;
  mediaKinds: MediaKind[];
  hasButtons: boolean;
  starPrice: number | null;
}): ChannelPlan {
  const n = p.mediaKinds.length;
  if (n > 10) throw new PostingInputError("at most 10 media items per post");
  if (p.starPrice !== null) {
    if (n === 0) throw new PostingInputError("starPrice needs at least one photo or video");
    if (p.text.length > LIMITS.mediaCaption) throw new PostingInputError(`caption is over ${LIMITS.mediaCaption} characters`);
    return { method: "sendPaidMedia", starCount: p.starPrice };
  }
  if (n === 0) {
    if (!p.text) throw new PostingInputError("send text, media, or both");
    return { method: "sendMessage" };
  }
  if (p.text.length > LIMITS.mediaCaption) throw new PostingInputError(`caption is over ${LIMITS.mediaCaption} characters`);
  if (n === 1) return { method: p.mediaKinds[0] === "video" ? "sendVideo" : "sendPhoto" };
  // Telegram does not allow an inline keyboard on an album. Refuse instead of
  // silently dropping the buttons the caller asked for.
  if (p.hasButtons) throw new PostingInputError("an album (2+ media) cannot carry buttons, send one item or drop the buttons");
  return { method: "sendMediaGroup" };
}
