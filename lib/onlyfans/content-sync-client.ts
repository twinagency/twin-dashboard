/** Browser helper for the same-origin content sync route. Safe to import from client components. */
import { FAILURE_MESSAGES, SYNC_FAILURE_CODES, type SyncFailureCode } from "./content-sync";

export type SyncReply<T = unknown> =
  | { kind: "ok"; data: T }
  | { kind: "denied" }
  | { kind: "refused"; status: number; code: SyncFailureCode; error: string }
  | { kind: "unconfirmed"; error: string }
  | { kind: "stale" };

export const syncBase = (accountId: string) => `/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/sync`;
const UNCONFIRMED = FAILURE_MESSAGES.outcome_unconfirmed;

/** One attempt. A missing, late or unreadable reply is "unconfirmed", never "failed", so callers keep the exact request. */
export async function syncCall<T = unknown>(accountId: string, path: string, options: { method?: "GET" | "POST"; body?: unknown; bytes?: ArrayBuffer; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<SyncReply<T>> {
  const { method = "GET", body, bytes, signal, timeoutMs = method === "GET" ? 12_000 : bytes ? 60_000 : 20_000 } = options;
  const init: RequestInit = { method, credentials: "same-origin", cache: "no-store", redirect: "error",
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeoutMs)]) };
  if (bytes) { init.headers = { "Content-Type": "application/octet-stream" }; init.body = bytes; }
  else if (body !== undefined) { init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(body); }
  let response: Response;
  try { response = await fetch(syncBase(accountId) + path, init); }
  catch { return signal?.aborted ? { kind: "stale" } : { kind: "unconfirmed", error: UNCONFIRMED }; }
  if (signal?.aborted) return { kind: "stale" };
  if ([401, 403].includes(response.status)) return { kind: "denied" };
  let value: { ok?: unknown; data?: unknown; code?: unknown; outcome?: unknown; error?: unknown } | null = null;
  try { value = await response.json(); } catch { /* handled below */ }
  if (signal?.aborted) return { kind: "stale" };
  if (response.ok && value?.ok === true && "data" in value) return { kind: "ok", data: value.data as T };
  if (response.status === 502 || value?.outcome === "unconfirmed" || !value || response.status >= 500 && response.status !== 503) return { kind: "unconfirmed", error: UNCONFIRMED };
  const code = (SYNC_FAILURE_CODES as readonly unknown[]).includes(value.code) ? value.code as SyncFailureCode : "invalid_sync_request";
  // Known refusals get the fixed plain-word message; only input errors keep the route's own text.
  const own = code === "invalid_sync_request" && typeof value.error === "string" && value.error.length <= 300 ? value.error : null;
  return { kind: "refused", status: response.status, code, error: own ?? FAILURE_MESSAGES[code] };
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
}
export const syncTime = (value: string | null, fallback = "Not recorded") => value ? new Date(value).toLocaleString() : fallback;
export const connectionHref = (accountId: string) => `/onlyfans/accounts?account=${encodeURIComponent(accountId)}`;
