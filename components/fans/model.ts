import { PLATFORMS, type Fan, type Handling, type Message, type Platform, type PlatformFilter, type WorkspaceState } from "./types";
export const STORAGE_KEY = "twin-fan-workspace-v1";
export const platformNames: Record<Platform, string> = { onlyfans: "OnlyFans", telegram: "Telegram", fanvue: "Fanvue", fansly: "Fansly" };
export const emptyState = (): WorkspaceState => ({ version: 1, notes: {}, messages: {}, memories: {}, modes: {}, drafts: {} });
export const channelKey = (fanId: string, platform: Platform) => `${fanId}:${platform}`;
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
const platformValue = (v: unknown): v is Platform => typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);
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
    if (Array.isArray(notes)) out.notes[fan.id] = notes.filter(n => object(n) && typeof n.id === "string" && typeof n.text === "string" && n.text.length <= 2000 && validDate(n.at)).slice(-100).map(n => ({ id:n.id, text:n.text, at:n.at }));
    const messages = object(value.messages) ? value.messages[fan.id] : null;
    if (Array.isArray(messages)) out.messages[fan.id] = messages.filter(m => object(m) && typeof m.id === "string" && m.direction === "out" && typeof m.text === "string" && m.text.length <= 4000 && validDate(m.at) && platformValue(m.platform) && fan.accounts.some(a => a.platform === m.platform)).slice(-200).map(m => ({ id:m.id, platform:m.platform, direction:"out", text:m.text, at:m.at }));
    const memories = object(value.memories) ? value.memories[fan.id] : null;
    if (object(memories)) { out.memories[fan.id] = {}; for (const memory of fan.memories) if (typeof memories[memory.id] === "string" && (memories[memory.id] as string).length <= 500) out.memories[fan.id][memory.id] = memories[memory.id] as string; }
    for (const account of fan.accounts) {
      const key = channelKey(fan.id, account.platform);
      const mode = object(value.modes) ? value.modes[key] : null;
      if (["Human", "Copilot", "Autonomous"].includes(String(mode))) out.modes[key] = mode as Handling;
      const draft = object(value.drafts) ? value.drafts[key] : null;
      if (typeof draft === "string" && draft.length <= 4000) out.drafts[key] = draft;
    }
  }
  return out;
}
