// Server half of the posting API (app/api/admin/v1/posting/*): stories on a
// girl's own profile and posts in her Telegram channel, through her own clone
// bot.
//
// WHAT "AVAILABLE" MEANS, AND WHY IT IS ALWAYS CHECKED LIVE
// A story needs an ENABLED business connection whose rights include
// can_manage_stories. A channel post needs the clone bot to be an admin of the
// channel with can_post_messages. Both are switched by the girl from her own
// phone at any moment, so neither is ever trusted from a cache when actually
// posting: every send re-checks its one target first and refuses with the
// reason. listTargets() caches for 60s only because it probes the whole fleet.
//
// WHERE CHANNELS COME FROM
// No registry table. A girl's channel is the "personal channel" she shows on
// her own profile (getChat(user).personal_chat), read live through her bot.
// A channel she has not put on her profile can still be posted to by naming
// it, as long as her bot is an admin there; the live check is the same.
//
// The bot token is read here and never returned or logged.

import dns from "node:dns";
import net from "node:net";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { supabaseAdmin } from "./supabase";
import { TelegramApiError } from "./telegram-raw";
import {
  LIMITS,
  MAX_BYTES,
  STORY_MAX_VIDEO_BYTES,
  PostingInputError,
  checkOverlayUse,
  cleanText,
  mediaKindFor,
  planChannelPost,
  storyLinkArea,
  type MediaKind,
  type OverlaySpec,
  type PreviewMode,
  type UrlButton,
} from "./posting-validate";

import { renderStoryOverlay, type OverlayGeometry } from "./story-overlay";

export { TelegramApiError };

// A target exists but cannot take this post right now (no connection, right
// switched off, bot not admin). 409, with the reason in plain words.
export class PostingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostingUnavailableError";
  }
}

// ── Telegram transport ───────────────────────────────────────────────────────
let ipv4 = false;
function ensureIpv4First(): void {
  if (ipv4) return;
  ipv4 = true;
  dns.setDefaultResultOrder("ipv4first");
  net.setDefaultAutoSelectFamily(false);
}

type Upload = { field: string; bytes: Buffer; filename: string; mime: string };

async function tg(token: string, method: string, fields: Record<string, unknown>, files: Upload[] = []): Promise<any> {
  ensureIpv4First();
  let init: RequestInit;
  if (files.length) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    for (const f of files) form.set(f.field, new Blob([new Uint8Array(f.bytes)], { type: f.mime }), f.filename);
    init = { method: "POST", body: form };
  } else {
    init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) };
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { ...init, signal: AbortSignal.timeout(120_000) });
  const j = await res.json().catch(() => ({ ok: false, description: `Telegram ${method} returned ${res.status}` }));
  if (!j.ok) throw new TelegramApiError(j.description ?? `Telegram ${method} failed (${res.status})`, j.error_code);
  return j.result;
}

async function tgSoft(token: string, method: string, fields: Record<string, unknown>): Promise<{ ok: true; result: any } | { ok: false; error: string }> {
  try {
    return { ok: true, result: await tg(token, method, fields) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── clones and their bots ────────────────────────────────────────────────────
type CloneBot = { id: string; slug: string; name: string; status: string; token: string; botId: number };

function botIdFromToken(token: string): number {
  return Number(token.split(":")[0]);
}

async function cloneBots(): Promise<CloneBot[]> {
  const { data, error } = await supabaseAdmin.from("clones").select("id,slug,name,status,bot_token").order("slug");
  if (error) throw new Error(`could not read clones: ${error.message}`);
  return ((data ?? []) as { id: string; slug: string; name: string; status: string; bot_token: string | null }[])
    .filter((c) => c.bot_token)
    .map((c) => ({ id: c.id, slug: c.slug, name: c.name, status: c.status, token: c.bot_token as string, botId: botIdFromToken(c.bot_token as string) }));
}

async function cloneBot(cloneId: string): Promise<CloneBot> {
  const { data } = await supabaseAdmin.from("clones").select("id,slug,name,status,bot_token").eq("id", cloneId).maybeSingle();
  const c = data as { id: string; slug: string; name: string; status: string; bot_token: string | null } | null;
  if (!c) throw new PostingUnavailableError("clone not found");
  if (!c.bot_token) throw new PostingUnavailableError(`${c.slug} has no bot token`);
  return { id: c.id, slug: c.slug, name: c.name, status: c.status, token: c.bot_token, botId: botIdFromToken(c.bot_token) };
}

// The business connection id lives on fan rows. A girl who reconnected has old,
// disabled ids on older fans, so the most recent few are tried until one is
// enabled. The newest row alone is not enough, that is what made the
// 2026-10-12 script loop the same way.
type LiveConnection = { bcid: string; canStories: boolean; userId: number };

async function liveConnection(c: CloneBot): Promise<LiveConnection | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("business_connection_id")
    .eq("clone_id", c.id)
    .not("business_connection_id", "is", null)
    .order("last_message_received", { ascending: false, nullsFirst: false })
    .limit(300);
  // A girl who started on V2 has no fan rows in `users`; V2 archives every
  // business chat with the connection id as `route`, so fall back to those.
  const { data: v2 } = await supabaseAdmin
    .from("v2arch_messages")
    .select("route")
    .eq("creator_id", c.id)
    .order("occurred_at", { ascending: false })
    .limit(300);
  const ids = [...new Set([
    ...((data ?? []) as { business_connection_id: string }[]).map((r) => r.business_connection_id),
    ...((v2 ?? []) as { route: string | null }[]).map((r) => r.route).filter((r): r is string => !!r),
  ])].slice(0, 15);
  for (const bcid of ids) {
    const r = await tgSoft(c.token, "getBusinessConnection", { business_connection_id: bcid });
    if (r.ok && r.result?.is_enabled) {
      return { bcid, canStories: Boolean(r.result.rights?.can_manage_stories), userId: Number(r.result.user?.id) };
    }
  }
  return null;
}

type ChannelInfo = { chatId: number; username: string | null; title: string };
type ChannelRights = { canPost: boolean; canPin: boolean; reason: string | null };

async function personalChannel(c: CloneBot, userId: number): Promise<ChannelInfo | null> {
  const r = await tgSoft(c.token, "getChat", { chat_id: userId });
  const pc = r.ok ? r.result?.personal_chat : null;
  if (!pc) return null;
  return { chatId: Number(pc.id), username: pc.username ?? null, title: String(pc.title ?? "") };
}

async function channelRights(c: CloneBot, chat: string | number): Promise<ChannelRights> {
  const r = await tgSoft(c.token, "getChatMember", { chat_id: chat, user_id: c.botId });
  if (!r.ok) {
    // "member list is inaccessible" is what Telegram says when the bot is not in the channel at all.
    return { canPost: false, canPin: false, reason: `bot is not an admin of this channel (${r.error})` };
  }
  const m = r.result;
  if (m.status === "creator") return { canPost: true, canPin: true, reason: null };
  if (m.status !== "administrator") return { canPost: false, canPin: false, reason: `bot is ${m.status} here, it must be an admin` };
  if (!m.can_post_messages) return { canPost: false, canPin: false, reason: "bot is an admin but the Post Messages right is off" };
  return { canPost: true, canPin: Boolean(m.can_edit_messages), reason: null };
}

async function resolveChat(c: CloneBot, chat: string | number): Promise<ChannelInfo> {
  const r = await tgSoft(c.token, "getChat", { chat_id: chat });
  if (!r.ok) throw new PostingUnavailableError(`${c.slug}'s bot cannot see ${chat} (${r.error})`);
  if (r.result.type !== "channel") throw new PostingUnavailableError(`${chat} is a ${r.result.type}, not a channel`);
  return { chatId: Number(r.result.id), username: r.result.username ?? null, title: String(r.result.title ?? "") };
}

// ── targets: what can be posted where, right now ─────────────────────────────
export type StoryTarget = { clone: string; name: string; available: boolean; reason: string | null };
export type ChannelTarget = {
  clone: string;
  name: string;
  channel: string | null;
  chatId: number | null;
  title: string | null;
  available: boolean;
  canPin: boolean;
  reason: string | null;
};
export type BrandTarget = {
  key: string;
  label: string;
  channel: string;
  available: boolean;
  canPin: boolean;
  reason: string | null;
};
export type Targets = {
  checkedAt: string;
  stories: { available: StoryTarget[]; unavailable: StoryTarget[] };
  channels: { available: ChannelTarget[]; unavailable: ChannelTarget[] };
  brands: BrandTarget[];
};

// ── brand channels ───────────────────────────────────────────────────────────
// Fleet channels that are not any one girl's, posted by their own bot. The
// token lives in app_settings (like the other service keys, excluded from
// every allowlist) so no server env change is needed; the env var is a
// fallback. Any girl's content can be posted here.
export const BRAND_CHANNELS = [
  { key: "tsocial", label: "T-Social channel", channel: "@tsocialchannel", setting: "tsocial_bot_token", env: "TSOCIAL_BOT_TOKEN" },
] as const;

async function brandBot(key: string): Promise<{ bot: CloneBot; channel: string; label: string }> {
  const def = BRAND_CHANNELS.find((b) => b.key === key);
  if (!def) throw new PostingInputError(`unknown brand channel "${key}"`);
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", def.setting).maybeSingle();
  const raw = (data as { value: unknown } | null)?.value;
  const token = (typeof raw === "string" && raw.trim()) || process.env[def.env] || "";
  if (!token) throw new PostingUnavailableError(`${def.label}: bot token is not set (app_settings.${def.setting})`);
  return {
    bot: { id: "", slug: def.key, name: def.label, status: "active", token, botId: botIdFromToken(token) },
    channel: def.channel,
    label: def.label,
  };
}

async function probeBrand(def: (typeof BRAND_CHANNELS)[number]): Promise<BrandTarget> {
  const base = { key: def.key, label: def.label, channel: def.channel };
  try {
    const { bot } = await brandBot(def.key);
    const rights = await channelRights(bot, def.channel);
    return { ...base, available: rights.canPost, canPin: rights.canPin, reason: rights.reason };
  } catch (e) {
    return { ...base, available: false, canPin: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function probeClone(c: CloneBot): Promise<{ story: StoryTarget; channel: ChannelTarget }> {
  const base = { clone: c.slug, name: c.name };
  const noChan = (reason: string): ChannelTarget => ({ ...base, channel: null, chatId: null, title: null, available: false, canPin: false, reason });
  if (c.status !== "active") {
    const reason = `clone status is ${c.status}`;
    return { story: { ...base, available: false, reason }, channel: noChan(reason) };
  }
  const conn = await liveConnection(c);
  if (!conn) {
    const reason = "no enabled business connection";
    return { story: { ...base, available: false, reason }, channel: noChan(reason) };
  }
  const story: StoryTarget = conn.canStories
    ? { ...base, available: true, reason: null }
    : { ...base, available: false, reason: "story right is off (Telegram Business > Chatbots > manage stories)" };
  const ch = await personalChannel(c, conn.userId);
  if (!ch) return { story, channel: noChan("no channel on her profile") };
  const rights = await channelRights(c, ch.chatId);
  return {
    story,
    channel: {
      ...base,
      channel: ch.username ? `@${ch.username}` : null,
      chatId: ch.chatId,
      title: ch.title,
      available: rights.canPost,
      canPin: rights.canPin,
      reason: rights.reason,
    },
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

let cache: { at: number; value: Targets } | null = null;
const CACHE_MS = 60_000;

export async function listTargets(opts: { fresh?: boolean } = {}): Promise<Targets> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const bots = await cloneBots();
  const [probes, brands] = await Promise.all([mapLimit(bots, 6, probeClone), Promise.all(BRAND_CHANNELS.map(probeBrand))]);
  const value: Targets = {
    checkedAt: new Date().toISOString(),
    stories: {
      available: probes.map((p) => p.story).filter((s) => s.available),
      unavailable: probes.map((p) => p.story).filter((s) => !s.available),
    },
    channels: {
      available: probes.map((p) => p.channel).filter((s) => s.available),
      unavailable: probes.map((p) => p.channel).filter((s) => !s.available),
    },
    brands,
  };
  cache = { at: Date.now(), value };
  return value;
}

// ── media ────────────────────────────────────────────────────────────────────
export type MediaInput = { bytes: Buffer; mime: string; filename: string; kind?: MediaKind };

export async function mediaFromUrl(url: string): Promise<MediaInput> {
  if (!/^https:\/\//i.test(url)) throw new PostingInputError("mediaUrl must be https://");
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new PostingInputError(`mediaUrl returned ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES.video) throw new PostingInputError("mediaUrl file is over 50MB");
  const bytes = Buffer.from(await res.arrayBuffer());
  const filename = decodeURIComponent(new URL(url).pathname.split("/").pop() || "media");
  return { bytes, mime: res.headers.get("content-type")?.split(";")[0] ?? "", filename };
}

function checkSize(m: MediaInput, kind: MediaKind, max = MAX_BYTES[kind]): void {
  if (m.bytes.length === 0) throw new PostingInputError(`${m.filename} is empty`);
  if (m.bytes.length > max) throw new PostingInputError(`${m.filename} is ${(m.bytes.length / 1048576).toFixed(1)}MB, the limit is ${max / 1048576}MB`);
}

// Telegram wants story photos at 1080x1920. Cover-crop with sharp's attention
// strategy keeps the subject in frame rather than the dead centre.
async function storyPhoto(m: MediaInput, fit: boolean): Promise<Buffer> {
  if (!fit) return m.bytes;
  return sharp(m.bytes).rotate().resize(1080, 1920, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 90 }).toBuffer();
}

// ── stories ──────────────────────────────────────────────────────────────────
export type StoryRequest = {
  cloneId: string;
  media: MediaInput;
  mediaType?: unknown;
  caption: string;
  activePeriod: number;
  linkUrl: string | null;
  postToChatPage: boolean;
  protectContent: boolean;
  fit: boolean;
  // Visible caption/button/scrim burned into a photo (lib/story-overlay.ts).
  overlay?: OverlaySpec | null;
  // Dry runs only: hand back the rendered image.
  preview?: PreviewMode;
  dryRun: boolean;
};

// Crop (and overlay) a story photo; shared by postStory and previewStory.
async function storyImage(r: Pick<StoryRequest, "media" | "fit" | "overlay" | "linkUrl">): Promise<{ bytes: Buffer; geometry: OverlayGeometry | null }> {
  if (!r.overlay) return { bytes: await storyPhoto(r.media, r.fit), geometry: null };
  const out = await renderStoryOverlay(r.media.bytes, r.overlay, { fit: r.fit, linkUrl: r.linkUrl });
  return { bytes: out.bytes, geometry: out.geometry };
}

function previewOut(bytes: Buffer, mode: PreviewMode): { previewBase64?: string; previewMime?: string; previewPath?: string } {
  const out: { previewBase64?: string; previewMime?: string; previewPath?: string } = {};
  if (mode === "base64" || mode === "both") {
    out.previewBase64 = bytes.toString("base64");
    out.previewMime = "image/jpeg";
  }
  if (mode === "file" || mode === "both") {
    const f = path.join(os.tmpdir(), `twin-story-preview-${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}.jpg`);
    writeFileSync(f, bytes);
    out.previewPath = f;
  }
  return out;
}

// Render only: every input check and the real crop/overlay, but no Telegram
// call at all (no clone bot, no business connection), so the owner can iterate
// on a look in a second. Nothing is posted or written.
export async function previewStory(r: Pick<StoryRequest, "media" | "mediaType" | "fit" | "overlay" | "linkUrl" | "preview">) {
  const kind = mediaKindFor(r.media.mime, r.media.filename, r.mediaType ?? r.media.kind);
  if (!r.overlay) throw new PostingInputError("story_preview needs an overlay");
  checkOverlayUse(r.overlay, { kind, linkUrl: r.linkUrl });
  checkSize(r.media, kind, MAX_BYTES.photo);
  const { bytes, geometry } = await storyImage(r);
  return {
    dryRun: true as const,
    previewOnly: true,
    wouldPost: { mediaType: kind, bytes: bytes.length, linkUrl: r.linkUrl, overlay: geometry },
    ...previewOut(bytes, r.preview && r.preview !== "none" ? r.preview : "base64"),
  };
}

export async function postStory(r: StoryRequest) {
  // Pure input rules first: a bad overlay is a 400 before any Telegram call.
  const kind = mediaKindFor(r.media.mime, r.media.filename, r.mediaType ?? r.media.kind);
  checkOverlayUse(r.overlay ?? null, { kind, linkUrl: r.linkUrl });
  const c = await cloneBot(r.cloneId);
  const conn = await liveConnection(c);
  if (!conn) throw new PostingUnavailableError(`${c.slug} has no enabled business connection`);
  if (!conn.canStories) throw new PostingUnavailableError(`${c.slug}'s story right is off`);

  checkSize(r.media, kind, kind === "video" ? STORY_MAX_VIDEO_BYTES : MAX_BYTES.photo);
  const img = kind === "photo" ? await storyImage(r) : { bytes: r.media.bytes, geometry: null };
  const bytes = img.bytes;
  const caption = cleanText(r.caption, LIMITS.storyCaption, "caption");

  const fields: Record<string, unknown> = {
    business_connection_id: conn.bcid,
    content: kind === "photo" ? { type: "photo", photo: "attach://story_file" } : { type: "video", video: "attach://story_file" },
    active_period: r.activePeriod,
    caption: caption || undefined,
    // With a burned-in button the tappable area is the button's own rectangle.
    areas: r.linkUrl ? [img.geometry?.linkArea ?? storyLinkArea(r.linkUrl)] : undefined,
    post_to_chat_page: r.postToChatPage,
    protect_content: r.protectContent,
  };
  const summary = { clone: c.slug, mediaType: kind, file: r.media.filename || null, bytes: bytes.length, caption, activePeriod: r.activePeriod, linkUrl: r.linkUrl, overlay: img.geometry };
  if (r.dryRun) return { dryRun: true as const, wouldPost: summary, ...previewOut(bytes, r.preview ?? "none") };

  const story = await tg(c.token, "postStory", fields, [
    { field: "story_file", bytes, filename: kind === "photo" ? "story.jpg" : "story.mp4", mime: kind === "photo" ? "image/jpeg" : r.media.mime || "video/mp4" },
  ]);
  return { dryRun: false as const, posted: { ...summary, storyId: story?.id ?? null } };
}

export async function deleteStory(cloneId: string, storyId: number) {
  const c = await cloneBot(cloneId);
  const conn = await liveConnection(c);
  if (!conn) throw new PostingUnavailableError(`${c.slug} has no enabled business connection`);
  await tg(c.token, "deleteStory", { business_connection_id: conn.bcid, story_id: storyId });
  return { clone: c.slug, deletedStoryId: storyId };
}

// ── channel posts ────────────────────────────────────────────────────────────
// Which bot posts and where: her own bot, into her profile channel unless a
// channel is named. A channel named without a clone is matched against the
// fleet's discovered channels, so "@mrscallace" alone is enough.
async function channelTarget(
  cloneId: string | null,
  channel: string | number | null,
  brand: string | null = null,
): Promise<{ c: CloneBot; ch: ChannelInfo }> {
  if (brand) {
    const b = await brandBot(brand);
    return { c: b.bot, ch: await resolveChat(b.bot, b.channel) };
  }
  if (cloneId) {
    const c = await cloneBot(cloneId);
    if (channel !== null) return { c, ch: await resolveChat(c, channel) };
    const conn = await liveConnection(c);
    if (!conn) throw new PostingUnavailableError(`${c.slug} has no enabled business connection, so her channel cannot be found; name the channel`);
    const ch = await personalChannel(c, conn.userId);
    if (!ch) throw new PostingUnavailableError(`${c.slug} has no channel on her profile; name the channel`);
    return { c, ch };
  }
  if (channel === null) throw new PostingInputError("clone or channel is required");
  const t = await listTargets();
  const want = String(channel).toLowerCase();
  const hit = [...t.channels.available, ...t.channels.unavailable].find(
    (x) => (x.channel ?? "").toLowerCase() === want || String(x.chatId) === want,
  );
  if (!hit) throw new PostingUnavailableError(`${channel} is not any girl's profile channel; pass clone too`);
  const { data } = await supabaseAdmin.from("clones").select("id").eq("slug", hit.clone).maybeSingle();
  const c = await cloneBot((data as { id: string }).id);
  return { c, ch: await resolveChat(c, channel) };
}

export type ChannelRequest = {
  cloneId: string | null;
  channel: string | number | null;
  // A BRAND_CHANNELS key: post there with that bot instead of a girl's own.
  brand?: string | null;
  text: string;
  media: MediaInput[];
  mediaType?: unknown;
  buttons: UrlButton[][] | null;
  pin: boolean;
  starPrice: number | null;
  silent: boolean;
  protectContent: boolean;
  dryRun: boolean;
};

function postLink(ch: ChannelInfo, messageId: number): string | null {
  return ch.username ? `https://t.me/${ch.username}/${messageId}` : null;
}

export async function postToChannel(r: ChannelRequest) {
  const { c, ch } = await channelTarget(r.cloneId, r.channel, r.brand ?? null);
  const rights = await channelRights(c, ch.chatId);
  if (!rights.canPost) throw new PostingUnavailableError(`${ch.username ? "@" + ch.username : ch.chatId}: ${rights.reason}`);

  const text = cleanText(r.text, LIMITS.text, "text");
  const kinds = r.media.map((m) => mediaKindFor(m.mime, m.filename, r.mediaType ?? m.kind));
  r.media.forEach((m, i) => checkSize(m, kinds[i]));
  const plan = planChannelPost({ text, mediaKinds: kinds, hasButtons: Boolean(r.buttons), starPrice: r.starPrice });

  const warnings: string[] = [];
  if (r.pin && !rights.canPin) warnings.push("not pinned: the bot lacks the Edit Messages right in this channel");
  if (r.buttons?.flat().some((b) => b.style)) warnings.push("button style is Telegram's own blue/green/red; apps older than Bot API 9.4 show the default look");
  if (plan.method === "sendPaidMedia") warnings.push("paid media Stars go to the channel's balance, not the bot's");

  const summary = {
    clone: c.slug,
    brand: r.brand ?? null,
    channel: ch.username ? `@${ch.username}` : null,
    chatId: ch.chatId,
    method: plan.method,
    media: kinds,
    files: r.media.map((m) => m.filename || null),
    text,
    buttons: r.buttons,
    starPrice: r.starPrice,
    pin: r.pin && rights.canPin,
  };
  if (r.dryRun) return { dryRun: true, wouldPost: summary, warnings };

  const markup = r.buttons ? { inline_keyboard: r.buttons } : undefined;
  const common = { chat_id: ch.chatId, disable_notification: r.silent, protect_content: r.protectContent };
  const files: Upload[] = r.media.map((m, i) => ({
    field: `f${i}`,
    bytes: m.bytes,
    filename: m.filename || (kinds[i] === "photo" ? `f${i}.jpg` : `f${i}.mp4`),
    mime: m.mime || (kinds[i] === "photo" ? "image/jpeg" : "video/mp4"),
  }));
  const items = kinds.map((k, i) => ({ type: k, media: `attach://f${i}` }));

  let messageIds: number[] = [];
  switch (plan.method) {
    case "sendMessage": {
      const m = await tg(c.token, "sendMessage", { ...common, text, reply_markup: markup });
      messageIds = [m.message_id];
      break;
    }
    case "sendPhoto":
    case "sendVideo": {
      const field = plan.method === "sendPhoto" ? "photo" : "video";
      const m = await tg(c.token, plan.method, { ...common, [field]: "attach://f0", caption: text || undefined, reply_markup: markup }, files);
      messageIds = [m.message_id];
      break;
    }
    case "sendMediaGroup": {
      const media = items.map((it, i) => (i === 0 && text ? { ...it, caption: text } : it));
      const ms = await tg(c.token, "sendMediaGroup", { ...common, media }, files);
      messageIds = (ms as { message_id: number }[]).map((m) => m.message_id);
      break;
    }
    case "sendPaidMedia": {
      const m = await tg(
        c.token,
        "sendPaidMedia",
        { ...common, star_count: plan.starCount, media: items, caption: text || undefined, reply_markup: markup },
        files,
      );
      messageIds = [m.message_id];
      break;
    }
  }

  let pinned = false;
  if (r.pin && rights.canPin) {
    const p = await tgSoft(c.token, "pinChatMessage", { chat_id: ch.chatId, message_id: messageIds[0], disable_notification: true });
    pinned = p.ok;
    if (!p.ok) warnings.push(`posted but pin failed: ${p.error}`);
  }
  return { dryRun: false, posted: { ...summary, messageIds, pinned, link: postLink(ch, messageIds[0]) }, warnings };
}

export async function deleteChannelPost(cloneId: string | null, channel: string | number | null, messageIds: number[], brand: string | null = null) {
  const { c, ch } = await channelTarget(cloneId, channel, brand);
  await tg(c.token, "deleteMessages", { chat_id: ch.chatId, message_ids: messageIds });
  return { clone: c.slug, brand, channel: ch.username ? `@${ch.username}` : ch.chatId, deletedMessageIds: messageIds };
}

// ── what was posted recently ─────────────────────────────────────────────────
// Telegram gives a bot no way to list a girl's stories or read a channel's
// history, so "recent" is our own audit trail: every real send through this
// API (logAdminWrite, source admin-api) plus stories from the dashboard's own
// story button (source business-account). system_logs keeps 30 days.
// A later delete marks the matching post deleted instead of hiding it.
// Posts made by the old one-off stories-* scripts are not in here.
export type RecentPost = {
  at: string;
  kind: "story" | "channel_post";
  via: "api" | "dashboard";
  clone: string | null;
  brand: string | null;
  channel: string | null;
  storyId: number | null;
  messageIds: number[] | null;
  link: string | null;
  mediaType: string | null;
  files: (string | null)[] | null;
  text: string | null;
  starPrice: number | null;
  expiresAt: string | null;
  live: boolean | null;
  deleted: boolean;
};

export async function listRecentPosts(opts: { cloneId?: string | null; days: number; limit: number }): Promise<RecentPost[]> {
  const since = new Date(Date.now() - opts.days * 86400_000).toISOString();
  const bots = await cloneBots().catch(() => [] as CloneBot[]);
  const slugOf = new Map(bots.map((b) => [b.id, b.slug]));

  let q = supabaseAdmin
    .from("system_logs")
    .select("ts,source,clone_id,message,detail")
    .gte("ts", since)
    .or("and(source.eq.admin-api,message.like.admin API write: posting:*),and(source.eq.business-account,detail->>action.eq.story)")
    .order("ts", { ascending: false })
    .limit(2000);
  if (opts.cloneId) q = q.eq("clone_id", opts.cloneId);
  const { data, error } = await q;
  if (error) throw new Error(`could not read posting log: ${error.message}`);
  type Row = { ts: string; source: string; clone_id: string | null; message: string; detail: any };
  const rows = (data ?? []) as Row[];

  const deletedStories = new Set<string>();
  const deletedMsgs = new Set<string>();
  for (const r of rows) {
    const d = r.detail ?? {};
    if (r.message.endsWith("posting:delete_story")) deletedStories.add(`${d.clone}:${d.deletedStoryId}`);
    if (r.message.endsWith("posting:delete_channel_post")) for (const id of d.deletedMessageIds ?? []) deletedMsgs.add(`${d.channel}:${id}`);
  }

  const now = Date.now();
  const out: RecentPost[] = [];
  for (const r of rows) {
    const d = r.detail ?? {};
    if (r.source === "business-account") {
      const clone = slugOf.get(r.clone_id ?? "") ?? null;
      const storyId = Number(d.result?.id) || null;
      out.push({
        at: r.ts, kind: "story", via: "dashboard", clone, brand: null, channel: null, storyId, messageIds: null, link: null,
        // The dashboard button logs no lifetime; 48h is the longest Telegram allows.
        mediaType: null, files: null, text: null, starPrice: null, expiresAt: null,
        live: now - Date.parse(r.ts) > 172800_000 ? false : null,
        deleted: deletedStories.has(`${clone}:${storyId}`),
      });
    } else if (r.message.endsWith("posting:story")) {
      const exp = d.activePeriod ? new Date(Date.parse(r.ts) + d.activePeriod * 1000) : null;
      const deleted = deletedStories.has(`${d.clone}:${d.storyId}`);
      out.push({
        at: r.ts, kind: "story", via: d.via === "dashboard" ? "dashboard" : "api", clone: d.clone ?? null, brand: null, channel: null, storyId: d.storyId ?? null,
        messageIds: null, link: d.linkUrl ?? null, mediaType: d.mediaType ?? null, files: d.file ? [d.file] : null,
        text: d.caption || null, starPrice: null, expiresAt: exp?.toISOString() ?? null,
        live: exp ? !deleted && exp.getTime() > now : null, deleted,
      });
    } else if (r.message.endsWith("posting:channel_post")) {
      const ids: number[] = d.messageIds ?? [];
      out.push({
        at: r.ts, kind: "channel_post", via: d.via === "dashboard" ? "dashboard" : "api", clone: d.clone ?? null, brand: d.brand ?? null, channel: d.channel ?? null, storyId: null,
        messageIds: ids, link: d.link ?? null, mediaType: (d.media ?? []).join(",") || "text", files: d.files ?? null,
        text: d.text || null, starPrice: d.starPrice ?? null, expiresAt: null, live: null,
        deleted: ids.length > 0 && ids.every((id) => deletedMsgs.has(`${d.channel}:${id}`)),
      });
    }
    if (out.length >= opts.limit) break;
  }
  return out;
}

// ── her content bucket ───────────────────────────────────────────────────────
// Browse a girl's catalogue (photos / videos rows + the `media` storage
// bucket) and post straight from it, so nobody has to download and re-upload.
// The nudity flags on these rows are unreliable (many "none" rows are nude):
// they are shown for reference only, a human must look before posting public.
export type CatalogueItem = {
  id: string;
  kind: MediaKind;
  caption: string | null;
  name: string | null;
  tags: string[];
  explicitness: string | null;
  isFree: boolean;
  starValue: number | null;
  createdAt: string;
  url: string | null;
};

export async function listCatalogue(opts: { cloneId: string; kind: MediaKind; q?: string; offset: number; limit: number }): Promise<{ items: CatalogueItem[]; total: number }> {
  const table = opts.kind === "photo" ? "photos" : "videos";
  const cols = opts.kind === "photo"
    ? "id,storage_path,caption,image_name,auto_desc,tags,explicitness,is_free,star_value,created_at"
    : "id,storage_path,caption,auto_desc,tags,explicitness,is_free,star_value,created_at";
  let q = supabaseAdmin.from(table).select(cols, { count: "exact" }).eq("clone_id", opts.cloneId).not("storage_path", "is", null);
  const term = (opts.q ?? "").trim().replace(/[%,()]/g, " ");
  if (term) q = q.or(`caption.ilike.%${term}%,auto_desc.ilike.%${term}%`);
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(opts.offset, opts.offset + opts.limit - 1);
  if (error) throw new Error(`could not read ${table}: ${error.message}`);
  const rows = (data ?? []) as any[];
  const signed = rows.length
    ? await supabaseAdmin.storage.from("media").createSignedUrls(rows.map((r) => r.storage_path), 3600)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlFor = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    total: count ?? rows.length,
    items: rows.map((r) => ({
      id: r.id,
      kind: opts.kind,
      caption: r.caption ?? null,
      name: r.image_name ?? r.auto_desc ?? null,
      tags: Array.isArray(r.tags) ? r.tags : [],
      explicitness: r.explicitness ?? null,
      isFree: Boolean(r.is_free),
      starValue: r.star_value === null || r.star_value === undefined ? null : Number(r.star_value),
      createdAt: r.created_at,
      url: urlFor.get(r.storage_path) ?? null,
    })),
  };
}

// One catalogue item as upload bytes. The row must belong to this clone, so
// one girl's post can never carry another girl's file.
export async function mediaFromCatalogue(cloneId: string, kind: MediaKind, id: string): Promise<MediaInput> {
  const table = kind === "photo" ? "photos" : "videos";
  const { data } = await supabaseAdmin.from(table).select("id,clone_id,storage_path").eq("id", id).maybeSingle();
  const row = data as { id: string; clone_id: string; storage_path: string | null } | null;
  if (!row) throw new PostingInputError(`no ${kind} with id ${id}`);
  if (row.clone_id !== cloneId) throw new PostingInputError(`that ${kind} belongs to a different girl`);
  if (!row.storage_path) throw new PostingInputError(`that ${kind} has no stored file`);
  const dl = await supabaseAdmin.storage.from("media").download(row.storage_path);
  if (dl.error || !dl.data) throw new PostingInputError(`could not load the ${kind} from storage: ${dl.error?.message ?? "empty"}`);
  const bytes = Buffer.from(await dl.data.arrayBuffer());
  const mime = dl.data.type && dl.data.type !== "application/octet-stream" ? dl.data.type : kind === "photo" ? "image/jpeg" : "video/mp4";
  return { bytes, mime, filename: `${kind}-${id}${kind === "photo" ? ".jpg" : ".mp4"}`, kind };
}
