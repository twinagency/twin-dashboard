import { type Fan, type Handling, type Message, type Platform, type PlatformFilter, type ProfileTab, type WorkspaceState } from "./types";
export const STORAGE_KEY = "twin-fan-workspace-v1";
export const platformNames: Record<Platform, string> = { onlyfans: "OnlyFans", telegram: "Telegram" };
// Older browser records are folded into the remaining USD channel once on restore.
// These legacy identifiers are never offered as visible platform choices.
export function normalizePlatform(value: unknown): Platform | undefined {
  if (value === "telegram") return "telegram";
  if (value === "onlyfans" || value === "fansly" || value === "fanvue") return "onlyfans";
}
export function normalizePlatformText(text: string): string {
  return text.replace(/OnlyFans, Telegram, Fansly and Fanvue/g, "OnlyFans and Telegram")
    .replace(/\b(?:Fansly|Fanvue)\b/gi, "OnlyFans")
    .replace(/\ball four (accounts|platforms|channels)\b/gi, "both linked $1")
    .replace(/\bfour linked accounts\b/gi, "two linked accounts")
    .replace(/\b4 linked accounts\b/g, "2 linked accounts")
    .replace(/Telegram, OnlyFans or OnlyFans/g, "Telegram");
}
export const compatibleChannelKeys = (fanId: string, platform: Platform) =>
  platform === "onlyfans" ? [`${fanId}:onlyfans`, `${fanId}:fansly`, `${fanId}:fanvue`] : [`${fanId}:telegram`];
export const emptyState = (): WorkspaceState => ({ version: 1, notes: {}, messages: {}, memories: {}, modes: {}, drafts: {} });
export const channelKey = (fanId: string, platform: Platform) => `${fanId}:${platform}`;
export function conversationPlatform(fan: Fan, preferred?: string | null): Platform {
  return fan.accounts.find(account => account.platform === normalizePlatform(preferred))?.platform
    ?? fan.accounts.find(account => account.platform === "telegram")?.platform
    ?? fan.accounts[0].platform;
}
export function conversationHref(fan: Fan, preferred?: string | null, sourceId?: string): string {
  const source = fan.messages.find(message => message.id === sourceId);
  const params = new URLSearchParams({ relationship: fan.id, creator: fan.creatorId, platform: source?.platform ?? conversationPlatform(fan, preferred) });
  if (source) params.set("source", source.id);
  return `/users?${params}`;
}
export function profileHref(fan: Fan, view: ProfileTab = "summary"): string {
  return `/fans?${new URLSearchParams({ creator: fan.creatorId, fan: fan.id, platform: "all", view })}`;
}
export function visibleFans(fans: Fan[], creatorId: string, query: string, platform: PlatformFilter = "all"): Fan[] {
  const term = query.trim().toLocaleLowerCase();
  return fans.filter(fan => (creatorId === "all" || fan.creatorId === creatorId) && (platform === "all" || fan.accounts.some(a => a.platform === platform)) && (!term || [fan.name, ...fan.accounts.map(a => a.username)].some(s => s.toLocaleLowerCase().includes(term))));
}
export function messagesFor(fan: Fan, state: WorkspaceState, platform: PlatformFilter): Message[] {
  return [...fan.messages, ...(state.messages[fan.id] || [])].filter(m => platform === "all" || m.platform === platform).sort((a, b) => a.at.localeCompare(b.at));
}
export function totalsFor(fan: Fan, platform: PlatformFilter) {
  const purchases = fan.purchases.filter(p => platform === "all" || p.platform === platform);
  return { purchases, usd: purchases.filter(p => p.currency === "USD").reduce((s,p) => s+p.amount,0), stars: purchases.filter(p => p.currency === "Stars").reduce((s,p) => s+p.amount,0) };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const validDate = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
// localStorage is untrusted and optional. Keep only recognized relationship,
// channel and memory keys; reject malformed entries without breaking the page.
export function restoreState(raw: string | null, fans: Fan[]): WorkspaceState {
  const out = emptyState();
  if (!raw || raw.length > 2_000_000) return out;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return out; }
  if (!object(value) || value.version !== 1) return out;
  for (const fan of fans) {
    const notes = object(value.notes) ? value.notes[fan.id] : null;
    if (Array.isArray(notes)) out.notes[fan.id] = notes.filter(n => object(n) && typeof n.id === "string" && typeof n.text === "string" && n.text.length <= 2000 && validDate(n.at)).slice(-100).map(n => ({ id:n.id, text:normalizePlatformText(n.text), at:n.at }));
    const messages = object(value.messages) ? value.messages[fan.id] : null;
    if (Array.isArray(messages)) out.messages[fan.id] = messages.flatMap((m: unknown): Message[] => {
      if (!object(m) || typeof m.id !== "string" || m.direction !== "out" || typeof m.text !== "string" || m.text.length > 4000 || !validDate(m.at)) return [];
      const platform = normalizePlatform(m.platform);
      return platform && fan.accounts.some(a => a.platform === platform) ? [{ id:m.id, platform, direction:"out", text:normalizePlatformText(m.text), at:m.at }] : [];
    }).slice(-200);
    const memories = object(value.memories) ? value.memories[fan.id] : null;
    if (object(memories)) { out.memories[fan.id] = {}; for (const memory of fan.memories) if (typeof memories[memory.id] === "string" && (memories[memory.id] as string).length <= 500) out.memories[fan.id][memory.id] = normalizePlatformText(memories[memory.id] as string); }
    for (const account of fan.accounts) {
      const key = channelKey(fan.id, account.platform);
      const aliases = compatibleChannelKeys(fan.id, account.platform);
      const modes = object(value.modes) ? value.modes : null;
      const mode = modes ? aliases.map(alias => modes[alias]).find(mode => ["Human", "Copilot", "Autonomous"].includes(String(mode))) : null;
      if (["Human", "Copilot", "Autonomous"].includes(String(mode))) out.modes[key] = mode as Handling;
      const drafts = object(value.drafts) ? value.drafts : null;
      const draft = drafts ? aliases.map(alias => drafts[alias]).find(draft => typeof draft === "string" && draft.length <= 4000) : null;
      if (typeof draft === "string" && draft.length <= 4000) out.drafts[key] = normalizePlatformText(draft);
    }
  }
  return out;
}
