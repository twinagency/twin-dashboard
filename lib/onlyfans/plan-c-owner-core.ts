import { createHash } from "node:crypto";
import type { NamedOwnerActor } from "./actor";

/**
 * Resolve a named active owner, not a shared password-admin session. Only the server sees service credentials.
 * A stable null only when the answer is definite: no owner-shaped session, no configuration, a 404, or a 200 that says null.
 * Anything a retry could answer differently (any other non-2xx, a malformed 200, a timeout, the network) is "unavailable",
 * so a caller refuses instead of falling back to another actor and re-keying the same intent.
 */
export async function namedOwnerActor(token: string | undefined, fetcher: typeof fetch = fetch): Promise<NamedOwnerActor | null | "unavailable"> {
  if (!token || !/^owner_[a-f0-9]{64}$/.test(token)) return null;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  try {
    const sessionHash = createHash("sha256").update(token).digest("hex");
    const response = await fetcher(`${url.replace(/\/$/, "")}/rest/v1/rpc/dashboard_plan_c_owner_identity`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_session_hash: sessionHash }), cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return null;
    if (!response.ok) return "unavailable";
    const id: unknown = await response.json();
    if (id === null) return null;
    if (typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) return "unavailable";
    return `op-session:${createHash("sha256").update(`twin-plan-c-named-owner-v1:${id}`).digest("hex")}` as NamedOwnerActor;
  } catch { return "unavailable"; }
}
