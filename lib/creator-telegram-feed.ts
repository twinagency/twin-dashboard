import "server-only";

// The same private V2 monitor powers the operator Telegram inbox. Only the
// server-verified creator slug enters these requests; the browser supplies no clone.
const origin = process.env.BOT_V2_URL ?? "http://172.31.6.134:4300";
const pageSize = 20;
const fanId = /^-?[1-9]\d{0,15}$/;
export class InvalidFeedRequest extends Error {}

type Fan = {
  chatId: string | number;
  name?: string | null;
  username?: string | null;
  lastSeen?: string | null;
  firstSeen?: string | null;
  messages?: number;
};
type Entry = { id: string; role: string; delivery: string; content: string; at: string; kind?: string };
type History = { history: Entry[]; hasMore?: boolean; nextCursor?: string | null };

async function monitor(slug: string, endpoint: "fans" | "chat-history", query: Record<string, string> = {}) {
  const url = new URL(`/api/${endpoint}`, origin);
  url.search = new URLSearchParams({ ...query, girl: slug }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("Telegram monitor unavailable");
  return response.json();
}

function visible(entry: Entry) {
  return typeof entry.id === "string" && typeof entry.content === "string" && Number.isFinite(Date.parse(entry.at))
    && ((entry.role === "user" && entry.delivery === "received") ||
        (entry.role === "assistant" && entry.delivery === "acknowledged"));
}

async function history(slug: string, fan: string, before?: string): Promise<History> {
  const result = await monitor(slug, "chat-history", {
    chatId: fan, ...(before ? { before } : {}),
  });
  if (!Array.isArray(result?.history)) throw new Error("Invalid Telegram history");
  return result;
}

type Preview = { version: string; expiry: number; task: Promise<string> };
const previews = new Map<string, Preview>();

async function preview(slug: string, fan: Fan) {
  const key = `${slug}/${fan.chatId}`, version = `${fan.lastSeen}:${fan.messages}`;
  const cached = previews.get(key);
  if (cached && cached.version === version && cached.expiry > Date.now()) return cached.task;
  const task = history(slug, String(fan.chatId)).then(page => {
    const latest = page.history.filter(visible).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    return latest?.content.slice(0, 160) || "";
  }).catch(() => "");
  previews.set(key, { version, expiry: Date.now() + 60_000, task });
  if (previews.size > 256) previews.delete(previews.keys().next().value!);
  return task;
}

const time = (fan: Fan) => Date.parse(fan.lastSeen || fan.firstSeen || "") || 0;
const rank = (a: { at: number; fan: string }, b: { at: number; fan: string }) =>
  b.at - a.at || b.fan.localeCompare(a.fan, "en");

export async function loadCreatorTelegramFeed(slug: string, fan: string | null, cursor: string | null) {
  if (fan !== null && !fanId.test(fan)) throw new InvalidFeedRequest();
  if (cursor !== null && (cursor.length > 800 || !/^[A-Za-z0-9_.:-]+$/.test(cursor))) throw new InvalidFeedRequest();
  const raw = await monitor(slug, "fans");
  if (!Array.isArray(raw)) throw new Error("Invalid Telegram participants");
  const fans: Fan[] = raw.filter(row => row && fanId.test(String(row.chatId)));

  if (fan !== null) {
    if (!fans.some(row => String(row.chatId) === fan)) return { messages: [], nextCursor: null };
    const prefix = `thread:${fan}:`;
    if (cursor !== null && (!cursor.startsWith(prefix) || !/^[A-Za-z0-9_-]+$/.test(cursor.slice(prefix.length)))) throw new InvalidFeedRequest();
    const page = await history(slug, fan, cursor?.slice(prefix.length));
    const messages = page.history.filter(visible).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map(entry => ({
      id: entry.id, text: entry.content, direction: entry.role === "user" ? "in" : "out", createdAt: entry.at,
      mediaType: entry.kind === "media" ? "attachment" : null,
    }));
    return { messages, nextCursor: page.hasMore && page.nextCursor ? prefix + page.nextCursor : null };
  }

  const match = cursor?.match(/^chats:(\d{1,14}):(-?[1-9]\d{0,15})$/);
  if (cursor !== null && !match) throw new InvalidFeedRequest();
  const anchor = match ? { at: Number(match[1]), fan: match[2] } : null;
  const ordered = fans.map(row => ({ row, at: time(row), fan: String(row.chatId) }))
    .sort(rank).filter(item => !anchor || rank(item, anchor) > 0);
  const page = ordered.slice(0, pageSize);
  // Limit concurrent preview reads on first open. Subsequent polls reuse each
  // preview until the fan's activity changes or the cached preview expires.
  const conversations = [];
  for (let offset = 0; offset < page.length; offset += 4) {
    conversations.push(...await Promise.all(page.slice(offset, offset + 4).map(async ({ row, at, fan: id }) => ({
      id, name: row.name || (row.username ? `@${row.username.replace(/^@/, "")}` : `Fan ${id}`),
      updatedAt: at ? new Date(at).toISOString() : null, preview: await preview(slug, row),
    }))));
  }
  const last = page[page.length - 1];
  return { conversations, nextCursor: ordered.length > pageSize && last ? `chats:${last.at}:${last.fan}` : null };
}
