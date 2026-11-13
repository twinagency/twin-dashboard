import { useEffect, useReducer } from "react";

/** The per-account STOP hold: set when a STOP is sent, so go stays held across a remount or reload until that STOP's own reply is
 *  recorded or definitively refused, or a read that started after `since` shows the account stopped. `attempt` names the STOP that
 *  set it, so a late reply to an older STOP cannot clear a newer one's hold; `carried` marks a hold that was already set when this STOP
 *  was sent (its refusal then lifts nothing). localStorage, so every tab of this browser sees it (and re-renders on the storage event); a
 *  page whose localStorage is unavailable keeps it in memory, for that page only. It never expires: an unknown STOP holds until settled.
 *  A malformed or legacy entry (no attempt, or one left in sessionStorage before G07d r1) holds and matches no reply: over-holding is the
 *  safe direction. Never throws. */
export type StopHold = { since: number; attempt: number | null; carried: boolean };
const PREFIX = "b-stop-held:", CHANGED = "b-stop-hold-changed";
const key = (accountId: string) => `${PREFIX}${accountId}`;
const legacy = (name: string) => { try { return window.sessionStorage.getItem(name); } catch { return null; } };
const memory = new Map<string, StopHold>();
const HOLD_ANY: StopHold = { since: 0, attempt: null, carried: true };
let last = 0;
/** Strictly increasing on this page and ordered against stamps from before a reload. */
export const stamp = () => (last = Math.max(Date.now(), last + 1));

export function readHold(accountId: string): StopHold | null {
  let raw: string | null;
  try { raw = window.localStorage.getItem(key(accountId)) ?? legacy(key(accountId)); } catch { return memory.get(accountId) ?? null; }
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
    if (hold === null) { window.localStorage.removeItem(key(accountId)); window.sessionStorage.removeItem(key(accountId)); }
    else window.localStorage.setItem(key(accountId), JSON.stringify({ accountId, ...hold }));
  } catch {
    if (hold !== null) memory.set(accountId, hold);
  }
  try { window.dispatchEvent(new Event(CHANGED)); } catch { /* no window */ }
}
/** Re-renders the caller when any account's hold changes: in this document (writeHold) or in another tab (the storage event). */
export function useStopHolds() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const on = (event: Event) => { if (!("key" in event) || event.key === null || String(event.key).startsWith(PREFIX)) bump(); };
    window.addEventListener("storage", on); window.addEventListener(CHANGED, on);
    return () => { window.removeEventListener("storage", on); window.removeEventListener(CHANGED, on); };
  }, []);
}
export const STOP_HELD_TEXT = "Held until the emergency stop is confirmed.";
/** The one check every go of an account consults (launch panel, inbox hand back and resume, bulk Enable AI, campaign create and Resume, Plan C approve and hand back): why go is held
 *  there by an unconfirmed STOP, or null. Brakes and a manual 1:1 send under takeover never read it. Read at submit too, not only at render;
 *  a view that reads it at render calls useStopHolds so another tab's STOP reaches it. */
export const stopHoldReason = (accountId: string) => (readHold(accountId) ? STOP_HELD_TEXT : null);
