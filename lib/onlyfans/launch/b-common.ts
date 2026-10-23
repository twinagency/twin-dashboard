/** Shared browser/server helpers for launch sections D (memory) and E (automation). No credentials. */
export type BReply<T> =
  | { kind: "ok"; data: T }
  | { kind: "denied" }
  | { kind: "readonly" }
  | { kind: "unavailable"; error: string }
  | { kind: "contract_pending"; contract: string }
  | { kind: "refused"; status: number; error: string }
  | { kind: "unconfirmed"; error: string }
  | { kind: "stale" };

export const B_UNCONFIRMED = "The outcome is not confirmed. Refresh before trying again.";
export const B_CONTRACT_SCHEMA = "of-launch-b.v1";

/** Source of truth for what is wired. Screens must render this; never claim more. */
export type BSourceKind = "real" | "fixture";
export type BCapabilityStatus = { id: string; label: string; source: BSourceKind; note: string };

export const B_CAPABILITIES: BCapabilityStatus[] = [
  { id: "automation.accounts", label: "Account list and handling mode", source: "real", note: "GET /api/onlyfans/accounts" },
  { id: "automation.conversations", label: "Conversation modes and takeover state", source: "real", note: "GET /api/onlyfans/accounts/{id}/conversations" },
  { id: "automation.controls", label: "Pause, resume, takeover, release, no-contact", source: "real", note: "POST /api/onlyfans-controls/accounts/{id}/conversations/{cid}" },
  { id: "automation.runtime", label: "Account runtime and delivery policy (read)", source: "real", note: "GET workspace/settings" },
  { id: "automation.account-mode-write", label: "Change account handling mode", source: "fixture", note: "No backend write contract. Read only." },
  { id: "automation.emergency-stop", label: "Emergency stop", source: "fixture", note: "No backend contract. Control is disabled." },
  { id: "automation.follow-ups", label: "Scheduled follow-ups and cancellation", source: "fixture", note: "Chat 4 contract not delivered. FIXTURE-ONLY." },
  { id: "memory.facts", label: "Fan facts and summaries", source: "fixture", note: "Chat 2 contract not delivered. FIXTURE-ONLY." },
  { id: "memory.corrections", label: "Correct supported fields", source: "fixture", note: "Chat 2 contract not delivered. FIXTURE-ONLY." },
  { id: "memory.coverage", label: "History and memory coverage", source: "fixture", note: "Chat 2 contract not delivered. FIXTURE-ONLY." },
];

type Opts = { method?: "GET" | "POST" | "PATCH"; body?: unknown; signal?: AbortSignal; timeoutMs?: number };

/** One attempt. An aborted request is "stale" and must be ignored by the caller. */
export async function bFetch(url: string, opts: Opts = {}): Promise<BReply<unknown>> {
  const { method = "GET", body, signal, timeoutMs = method === "GET" ? 12_000 : 20_000 } = opts;
  const init: RequestInit = { method, credentials: "same-origin", cache: "no-store", redirect: "error",
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeoutMs)]) };
  if (body !== undefined) { init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(body); }
  let response: Response;
  try { response = await fetch(url, init); }
  catch { return signal?.aborted ? { kind: "stale" } : method === "GET" ? { kind: "unavailable", error: "The read did not complete." } : { kind: "unconfirmed", error: B_UNCONFIRMED }; }
  if (signal?.aborted) return { kind: "stale" };
  let value: Record<string, unknown> | null = null;
  try { value = await response.json(); } catch { /* handled below */ }
  if (signal?.aborted) return { kind: "stale" };
  const text = (v: unknown, fallback: string) => typeof v === "string" && v.length > 0 && v.length <= 300 ? v : fallback;
  if (response.status === 401) return { kind: "denied" };
  if (response.status === 403) return value?.code === "agency_read_only" || /read-only/i.test(String(value?.error ?? "")) ? { kind: "readonly" } : { kind: "denied" };
  if (response.status === 501 && value?.code === "contract_pending") return { kind: "contract_pending", contract: text(value.contract, "unspecified") };
  if (response.ok && value) return { kind: "ok", data: value };
  if (method !== "GET" && (response.status === 502 || value?.outcome === "unconfirmed" || !value || response.status >= 500 && response.status !== 503))
    return { kind: "unconfirmed", error: B_UNCONFIRMED };
  if (method === "GET") return { kind: "unavailable", error: text(value?.error, "This read is unavailable right now.") };
  return { kind: "refused", status: response.status, error: text(value?.error, "The request was not accepted.") };
}

export const bTime = (value: string | null | undefined, fallback = "Not recorded") => {
  if (!value) return fallback;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : fallback;
};

export const bId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value);
