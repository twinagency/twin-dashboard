/** The per-account STOP hold: set when a STOP is sent, so go stays held across a remount or reload until that STOP's own reply is
 *  recorded or definitively refused, or a read that started after `since` shows the account stopped. `attempt` names the STOP that
 *  set it, so a late reply to an older STOP cannot clear a newer one's hold; `carried` marks a hold that was already set when this STOP
 *  was sent (its refusal then lifts nothing). sessionStorage, with an in-memory fallback when storage is unavailable. A malformed or
 *  legacy entry (no attempt) holds and matches no reply: over-holding is the safe direction. Never throws. */
export type StopHold = { since: number; attempt: number | null; carried: boolean };
const key = (accountId: string) => `b-stop-held:${accountId}`;
const memory = new Map<string, StopHold>();
const HOLD_ANY: StopHold = { since: 0, attempt: null, carried: true };
let last = 0;
/** Strictly increasing on this page and ordered against stamps from before a reload. */
export const stamp = () => (last = Math.max(Date.now(), last + 1));

export function readHold(accountId: string): StopHold | null {
  let raw: string | null;
  try { raw = window.sessionStorage.getItem(key(accountId)); } catch { return memory.get(accountId) ?? null; }
  if (raw === null) return memory.get(accountId) ?? null; // a write that storage refused
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v === "object" && v !== null && "accountId" in v && "since" in v && v.accountId === accountId && typeof v.since === "number")
      return "attempt" in v && typeof v.attempt === "number" ? { since: v.since, attempt: v.attempt, carried: "carried" in v && v.carried !== false }
        : { ...HOLD_ANY, since: v.since };
  } catch { /* malformed: hold */ }
  return HOLD_ANY;
}
export function writeHold(accountId: string, hold: StopHold | null) {
  if (hold === null) memory.delete(accountId);
  try {
    if (hold === null) window.sessionStorage.removeItem(key(accountId));
    else window.sessionStorage.setItem(key(accountId), JSON.stringify({ accountId, ...hold }));
  } catch {
    if (hold !== null) memory.set(accountId, hold);
  }
}
