import "server-only";
import { randomBytes } from "node:crypto";
/** Holds an OnlyFans capture server-side under a random handle, so a save can send `captureRef` instead of the session itself.
 * Storage only. In-process (prod is one Next process); globalThis because Next may load this module once per route. */
const CAPTURE_TTL_MS = 15 * 60_000, CAPTURE_CAP = 64;
export type StoredCapture = { capture: Record<string, unknown>; xHash: string; ownerId: number };
type Scope = { accountId: string; actor: string; jobId?: string | null };
type Entry = StoredCapture & Scope & { at: number };
const KEY = Symbol.for("twin.onlyfans.captureStore");
const store = () => ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map<string, Entry>()) as Map<string, Entry>;
const live = (entry: Entry) => Date.now() - entry.at < CAPTURE_TTL_MS;
/** Stores a capture for this account + operator session (+ Browserbase job: re-polling a done job returns the same handle). */
export function putCapture(scope: Scope, data: StoredCapture): string {
  const map = store();
  for (const [handle, entry] of map) if (!live(entry)) map.delete(handle);
  if (scope.jobId) for (const [handle, e] of map) if (e.jobId === scope.jobId && e.accountId === scope.accountId && e.actor === scope.actor) return handle;
  while (map.size >= CAPTURE_CAP) map.delete(map.keys().next().value!);
  const handle = randomBytes(24).toString("base64url");
  map.set(handle, { capture: data.capture, xHash: data.xHash, ownerId: data.ownerId, accountId: scope.accountId, actor: scope.actor, jobId: scope.jobId ?? null, at: Date.now() });
  return handle;
}
/** The stored capture, only for the account and actor it was captured for. Does not consume it: delete once the save is acked. */
export function peekCapture(handle: string, scope: Scope): StoredCapture | null {
  const entry = store().get(handle);
  if (!entry || !live(entry) || entry.accountId !== scope.accountId || entry.actor !== scope.actor) return null;
  return { capture: entry.capture, xHash: entry.xHash, ownerId: entry.ownerId };
}
export const deleteCapture = (handle: string) => { store().delete(handle); };
