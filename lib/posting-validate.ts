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
// `style` is the Bot API 9.4+ InlineKeyboardButton.style field: Telegram draws
// the button blue (primary), green (success) or red (danger). Those three are
// ALL Telegram offers: there are no custom colours on a channel button, and
// clients that predate 9.4 simply show the default look.
export const BUTTON_STYLES = ["primary", "success", "danger"] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export type UrlButton = { text: string; url: string; style?: ButtonStyle };

const STYLE_ALIASES: Record<string, ButtonStyle> = { blue: "primary", green: "success", red: "danger" };

export function parseButtonStyle(raw: unknown): ButtonStyle | undefined {
  if (raw === undefined || raw === null || String(raw).trim() === "") return undefined;
  const k = String(raw).trim().toLowerCase();
  const v = (STYLE_ALIASES[k] ?? k) as ButtonStyle;
  if (!(BUTTON_STYLES as readonly string[]).includes(v)) {
    throw new PostingInputError(
      `button style must be primary (blue), success (green) or danger (red), got "${String(raw).slice(0, 30)}". Telegram offers no other button colours`,
    );
  }
  return v;
}

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
      const style = parseButtonStyle(o.style);
      return { text, url: checkUrl(o.url, "button url"), ...(style ? { style } : {}) };
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

// ── story overlay (text, button and scrim burned into the photo) ─────────────
// The Bot API cannot draw a link sticker or any text on a story (postStory
// only takes the media plus invisible clickable areas), so the visible part is
// burned into the 1080x1920 pixels (lib/story-overlay.ts) and the tappable
// area is shrunk to sit exactly over the drawn button.
//
// Everything below is pure: parsing, validation and the geometry-to-Telegram
// conversion. No sharp, no fonts, so scripts/check-posting.ts proves it offline.

export const STORY_W = 1080;
export const STORY_H = 1920;

export type OverlaySlot = "top" | "middle" | "bottom";
export type ButtonShape = "pill" | "rounded" | "square";
export type ScrimPosition = "bottom" | "top";

export type OverlayCaption = {
  text: string;
  position: OverlaySlot;
  size: number; // font px on the 1080 wide canvas
  color: string; // #RRGGBB
  strokeColor: string;
  strokeWidth: number; // px, 0 = no outline
  shadow: boolean;
};
export type OverlayButton = {
  label: string;
  position: OverlaySlot;
  size: number;
  background: string;
  textColor: string;
  shape: ButtonShape;
  arrow: boolean; // draws the "›" after the label, like the finished look
};
export type OverlayScrim = { position: ScrimPosition; heightPct: number; color: string; opacity: number };
export type OverlaySpec = { caption: OverlayCaption | null; button: OverlayButton | null; scrim: OverlayScrim | null };

export const OVERLAY_LIMITS = {
  label: 24,
  caption: 120,
  captionSize: [24, 120],
  buttonSize: [24, 90],
  strokeWidth: [0, 12],
  scrimHeightPct: [10, 80],
  scrimOpacity: [0.05, 0.95],
} as const;

const OVERLAY_DEFAULTS = {
  captionSize: 62,
  buttonSize: 50,
  white: "#FFFFFF",
  black: "#000000",
  ink: "#111111",
};

const SLOTS: readonly OverlaySlot[] = ["top", "middle", "bottom"];
const SHAPES: readonly ButtonShape[] = ["pill", "rounded", "square"];

export function parseHexColor(raw: unknown, field: string): string {
  const s = String(raw ?? "").trim();
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) throw new PostingInputError(`${field} must be a hex colour like #FFFFFF or #fff, got "${s.slice(0, 20)}"`);
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${h.toUpperCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Characters the bundled font draws. Latin text, digits, punctuation and the
// curly quotes; no emoji or symbols (sharp text has no colour font, they would
// come out as empty boxes).
const DRAWABLE = /^[\x20-\x7E\u00A1-\u00FF\u2018\u2019\u201C\u201D\u2026]+$/;
// A label that looks like a link is refused: the button already carries the
// link, and a typed URL on the picture is a spam signal and a phishing tell.
const LINKISH = /(https?:|tg:|www\.|t\.me|@\w|\b[a-z0-9-]+\.(com|me|net|org|io|app|co|link|ly|xyz|gg|to)\b)/i;

function overlayText(raw: unknown, max: number, field: string): string {
  if (typeof raw !== "string") throw new PostingInputError(`${field} must be text`);
  // cleanText turns em and en dashes into ", " (house rule, same as every other fan-facing text).
  const s = cleanText(raw.replace(/\s+/g, " "), max * 4, field).replace(/,\s*,/g, ",");
  if (!s) throw new PostingInputError(`${field} cannot be empty`);
  if (s.length > max) throw new PostingInputError(`${field} is ${s.length} characters, the limit is ${max}`);
  if (!DRAWABLE.test(s)) {
    throw new PostingInputError(`${field} has a character the story font cannot draw (emoji and symbols are not supported)`);
  }
  if (LINKISH.test(s)) throw new PostingInputError(`${field} must not contain a link or @username, put the link in linkUrl`);
  return s;
}

function pick<T extends string>(raw: unknown, allowed: readonly T[], def: T, field: string): T {
  if (raw === undefined || raw === null || raw === "") return def;
  const v = String(raw).trim().toLowerCase() as T;
  if (!allowed.includes(v)) throw new PostingInputError(`${field} must be one of ${allowed.join(", ")}`);
  return v;
}

function num(raw: unknown, range: readonly number[], def: number, field: string, int = true): number {
  if (raw === undefined || raw === null || raw === "") return def;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || (int && !Number.isInteger(n)) || n < range[0] || n > range[1]) {
    throw new PostingInputError(`${field} must be ${int ? "a whole number " : "a number "}from ${range[0]} to ${range[1]}`);
  }
  return n;
}

function flag(raw: unknown, def: boolean, field: string): boolean {
  if (raw === undefined || raw === null || raw === "") return def;
  if (raw === true || raw === "true" || raw === "1" || raw === 1) return true;
  if (raw === false || raw === "false" || raw === "0" || raw === 0) return false;
  throw new PostingInputError(`${field} must be true or false`);
}

function strictObject(raw: unknown, allowed: readonly string[], field: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new PostingInputError(`${field} must be an object`);
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) throw new PostingInputError(`${field} has an unknown key "${k}", allowed: ${allowed.join(", ")}`);
  }
  return o;
}

// overlay = {
//   caption: "text" | { text, position top|middle|bottom, size, color, strokeColor, strokeWidth, shadow },
//   button:  "LABEL" | { label, position, size, background, textColor, shape pill|rounded|square, arrow },
//   scrim:   true | { position bottom|top, heightPct, color, opacity }
// }
// Accepts an object, or a JSON string (multipart form field). Returns null for
// "no overlay". Strict: an unknown key or bad value is a 400, never ignored.
export function parseOverlay(raw: unknown): OverlaySpec | null {
  if (raw === undefined || raw === null || raw === "") return null;
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      throw new PostingInputError('overlay must be JSON, e.g. {"caption":"new clips","button":"OPEN MY APP"}');
    }
  }
  const o = strictObject(v, ["caption", "button", "scrim"], "overlay");

  let caption: OverlayCaption | null = null;
  if (o.caption !== undefined && o.caption !== null) {
    const c = typeof o.caption === "string" ? { text: o.caption } : strictObject(o.caption, ["text", "position", "size", "color", "strokeColor", "strokeWidth", "shadow"], "overlay.caption");
    caption = {
      text: overlayText(c.text, OVERLAY_LIMITS.caption, "overlay.caption text"),
      position: pick(c.position, SLOTS, "bottom", "overlay.caption position"),
      size: num(c.size, OVERLAY_LIMITS.captionSize, OVERLAY_DEFAULTS.captionSize, "overlay.caption size"),
      color: c.color === undefined ? OVERLAY_DEFAULTS.white : parseHexColor(c.color, "overlay.caption color"),
      strokeColor: c.strokeColor === undefined ? OVERLAY_DEFAULTS.black : parseHexColor(c.strokeColor, "overlay.caption strokeColor"),
      strokeWidth: num(c.strokeWidth, OVERLAY_LIMITS.strokeWidth, 2, "overlay.caption strokeWidth"),
      shadow: flag(c.shadow, true, "overlay.caption shadow"),
    };
  }

  let button: OverlayButton | null = null;
  if (o.button !== undefined && o.button !== null) {
    const b = typeof o.button === "string" ? { label: o.button } : strictObject(o.button, ["label", "position", "size", "background", "textColor", "shape", "arrow"], "overlay.button");
    button = {
      label: overlayText(b.label, OVERLAY_LIMITS.label, "overlay.button label"),
      position: pick(b.position, SLOTS, "bottom", "overlay.button position"),
      size: num(b.size, OVERLAY_LIMITS.buttonSize, OVERLAY_DEFAULTS.buttonSize, "overlay.button size"),
      background: b.background === undefined ? OVERLAY_DEFAULTS.white : parseHexColor(b.background, "overlay.button background"),
      textColor: b.textColor === undefined ? OVERLAY_DEFAULTS.ink : parseHexColor(b.textColor, "overlay.button textColor"),
      shape: pick(b.shape, SHAPES, "pill", "overlay.button shape"),
      arrow: flag(b.arrow, true, "overlay.button arrow"),
    };
    const ratio = contrastRatio(button.background, button.textColor);
    if (ratio < 2) {
      throw new PostingInputError(`overlay.button text ${button.textColor} on ${button.background} is unreadable (contrast ${ratio.toFixed(1)}:1, need at least 2:1)`);
    }
  }

  let scrim: OverlayScrim | null = null;
  if (o.scrim !== undefined && o.scrim !== null && o.scrim !== false) {
    const sc = o.scrim === true ? {} : strictObject(o.scrim, ["position", "heightPct", "color", "opacity"], "overlay.scrim");
    scrim = {
      position: pick(sc.position, ["bottom", "top"] as const, "bottom", "overlay.scrim position"),
      heightPct: num(sc.heightPct, OVERLAY_LIMITS.scrimHeightPct, 38, "overlay.scrim heightPct"),
      color: sc.color === undefined ? OVERLAY_DEFAULTS.black : parseHexColor(sc.color, "overlay.scrim color"),
      opacity: num(sc.opacity, OVERLAY_LIMITS.scrimOpacity, 0.6, "overlay.scrim opacity", false),
    };
  }

  if (!caption && !button && !scrim) throw new PostingInputError("overlay needs a caption, a button or a scrim");
  return { caption, button, scrim };
}

// A button on the picture with no link behind it is a lie, so a button needs
// linkUrl; a video story cannot take an overlay at all (no frame burn-in).
export function checkOverlayUse(spec: OverlaySpec | null, o: { kind: MediaKind; linkUrl: string | null }): void {
  if (!spec) return;
  if (o.kind === "video") {
    throw new PostingInputError("overlay is for photos only: a video story cannot carry a burned-in caption or button (no re-encode step)");
  }
  if (spec.button && !o.linkUrl) throw new PostingInputError("overlay.button needs linkUrl, a button with no link behind it would be a dead tap");
}

export type PxRect = { x: number; y: number; w: number; h: number };

// The tappable area over the drawn button: its exact rectangle, so a tap
// outside the button does nothing. x/y in the Bot API are the CENTRE, all in %
// of the media. Rounded outward at 3 decimals (0.01 px) so the area never ends
// a hair short of the pixels.
export function overlayLinkArea(rect: PxRect, radiusPx: number, url: string) {
  const out = (v: number, total: number, dir: "down" | "up") => {
    const p = (v / total) * 100;
    return dir === "down" ? Math.floor(p * 1000) / 1000 : Math.ceil(p * 1000) / 1000;
  };
  const left = out(rect.x, STORY_W, "down");
  const right = out(rect.x + rect.w, STORY_W, "up");
  const top = out(rect.y, STORY_H, "down");
  const bottom = out(rect.y + rect.h, STORY_H, "up");
  const r = Math.min(radiusPx, rect.w / 2, rect.h / 2);
  return {
    position: {
      x_percentage: Math.round(((left + right) / 2) * 1000) / 1000,
      y_percentage: Math.round(((top + bottom) / 2) * 1000) / 1000,
      // +0.002% (0.02px) absorbs the 3-decimal rounding of the centre so the
      // area can never end a hair inside the drawn button.
      width_percentage: Math.round((right - left + 0.002) * 1000) / 1000,
      height_percentage: Math.round((bottom - top + 0.002) * 1000) / 1000,
      rotation_angle: 0,
      // Bot API: corner radius as a percentage of the media WIDTH.
      corner_radius_percentage: Math.round((r / STORY_W) * 100 * 1000) / 1000,
    },
    type: { type: "link", url },
  };
}

// previewImage: how a dry run (or story_preview) hands back the rendered image.
// base64 = previewBase64 in the JSON, file = written under the OS temp dir and
// previewPath returned (handy on the same machine), both = both.
export type PreviewMode = "none" | "base64" | "file" | "both";

export function parsePreviewMode(raw: unknown, def: PreviewMode = "none"): PreviewMode {
  if (raw === undefined || raw === null || raw === "") return def;
  if (raw === true || raw === "true" || raw === "1" || raw === 1) return "base64";
  if (raw === false || raw === "false" || raw === "0" || raw === 0) return "none";
  const v = String(raw).trim().toLowerCase();
  if (v === "base64" || v === "file" || v === "both" || v === "none") return v;
  throw new PostingInputError("previewImage must be true, base64, file or both");
}
