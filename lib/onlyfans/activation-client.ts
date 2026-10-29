/** Browser-side calls for the activation panel. Idempotent batches; an unconfirmed outcome is retried identically, never guessed. */
import { parseActivationStatus, type ActivationStatus } from "./activation-status";

export type CommandReply = { ok: true; command: Record<string, unknown> } | { ok: false; status: number; code: string; error: string; blockers: string[] };
type Fetch = typeof fetch;
const base = (accountId: string) => `/api/onlyfans-launch/activation/accounts/${encodeURIComponent(accountId)}`;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export async function readActivation(accountId: string, fetchImpl: Fetch = fetch): Promise<{ ok: true; status: ActivationStatus; canManage: boolean } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl(base(accountId), { credentials: "same-origin", cache: "no-store", redirect: "error" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !object(body) || body.ok !== true) return { ok: false, error: object(body) && typeof body.error === "string" ? body.error : "The AI chatting status could not be read." };
    const status = parseActivationStatus(body.activation, accountId);
    return status ? { ok: true, status, canManage: body.canManage === true } : { ok: false, error: "The AI chatting status could not be verified." };
  } catch { return { ok: false, error: "The AI chatting status could not be read." }; }
}

export async function postActivation(accountId: string, operation: string, body: Record<string, unknown>, fetchImpl: Fetch = fetch): Promise<CommandReply> {
  try {
    const response = await fetchImpl(`${base(accountId)}/${operation}`, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json: unknown = await response.json().catch(() => null);
    if (response.ok && object(json) && json.ok === true && object(json.command)) return { ok: true, command: json.command };
    const blockers = object(json) && Array.isArray(json.blockers) ? json.blockers.filter((b): b is string => typeof b === "string") : [];
    return { ok: false, status: response.status, code: object(json) && typeof json.code === "string" ? json.code : response.status >= 500 ? "outcome_unconfirmed" : "refused",
      error: object(json) && typeof json.error === "string" ? json.error : "The change was not accepted.", blockers };
  } catch { return { ok: false, status: 502, code: "outcome_unconfirmed", error: "The outcome is not confirmed. Refresh the status before repeating.", blockers: [] }; }
}

export type EnableProgress = { checked: number; enabled: number; skipped: Record<string, number>; batches: number };
export const newRunId = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");

/** Enable every eligible existing chat in resumable batches. The same run id makes a repeated batch a no-op. */
export async function enableExistingChats(options: { accountId: string; fingerprint: string; fetchImpl?: Fetch; runId?: string;
  progress?: (value: EnableProgress) => void; cancelled?: () => boolean }): Promise<EnableProgress & { done: boolean }> {
  const { accountId, fingerprint, fetchImpl = fetch, runId = newRunId(), progress, cancelled } = options;
  const total: EnableProgress = { checked: 0, enabled: 0, skipped: {}, batches: 0 };
  let after = "0";
  for (let guard = 0; guard < 2000; guard++) {
    if (cancelled?.()) throw Error("Stopped. Chats already enabled stay enabled; start again to continue.");
    let reply: CommandReply = { ok: false, status: 502, code: "outcome_unconfirmed", error: "", blockers: [] };
    for (let attempt = 0; attempt < 3 && !reply.ok && reply.code === "outcome_unconfirmed"; attempt++)
      reply = await postActivation(accountId, "enable-existing", { expectedFingerprint: fingerprint, runId, afterFan: after }, fetchImpl);
    if (!reply.ok) throw Object.assign(Error(reply.error), { code: reply.code, blockers: reply.blockers });
    const c = reply.command;
    if (typeof c.enabled !== "number" || typeof c.checked !== "number" || typeof c.done !== "boolean" || !object(c.skipped)) throw Error("A batch result could not be verified. Refresh before continuing.");
    total.checked += c.checked; total.enabled += c.enabled; total.batches++;
    for (const [reason, n] of Object.entries(c.skipped)) if (typeof n === "number") total.skipped[reason] = (total.skipped[reason] ?? 0) + n;
    progress?.({ ...total, skipped: { ...total.skipped } });
    if (c.done) return { ...total, done: true };
    const next = c.nextAfterFan;
    if (typeof next !== "string" || !/^[1-9][0-9]{0,17}$/.test(next) || BigInt(next) <= BigInt(after)) throw Error("The batch cursor did not advance. Refresh before continuing.");
    after = next;
  }
  throw Error("Too many batches. Refresh before continuing.");
}
