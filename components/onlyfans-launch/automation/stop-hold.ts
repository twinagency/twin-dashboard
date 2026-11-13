/** The per-account STOP hold: set when a STOP is sent, so go stays held across a remount or reload until the STOP is recorded,
 *  definitively refused, or a read that started after `since` shows the account stopped. sessionStorage, with an in-memory fallback
 *  when storage is unavailable. A malformed entry holds (since 0): over-holding is the safe direction. Never throws. */
const key = (accountId: string) => `b-stop-held:${accountId}`;
const memory = new Map<string, number>();
let last = 0;
/** Strictly increasing on this page and ordered against stamps from before a reload. */
export const stamp = () => (last = Math.max(Date.now(), last + 1));

export function readHold(accountId: string): number | null {
  let raw: string | null;
  try { raw = window.sessionStorage.getItem(key(accountId)); } catch { return memory.get(accountId) ?? null; }
  if (raw === null) return memory.get(accountId) ?? null; // a write that storage refused
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v === "object" && v !== null && "accountId" in v && "since" in v && v.accountId === accountId && typeof v.since === "number") return v.since;
  } catch { /* malformed: hold */ }
  return 0;
}
export function writeHold(accountId: string, since: number | null) {
  if (since === null) memory.delete(accountId);
  try {
    if (since === null) window.sessionStorage.removeItem(key(accountId));
    else window.sessionStorage.setItem(key(accountId), JSON.stringify({ accountId, since }));
  } catch {
    if (since !== null) memory.set(accountId, since);
  }
}
