import { createHash } from "node:crypto";

/** Resolve a named active owner, not a shared password-admin session. Only the server sees service credentials. */
export async function planCOwnerActor(token: string | undefined, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!token || !/^owner_[a-f0-9]{64}$/.test(token)) return null;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  try {
    const sessionHash = createHash("sha256").update(token).digest("hex");
    const response = await fetcher(`${url.replace(/\/$/, "")}/rest/v1/rpc/dashboard_plan_c_owner_identity`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_session_hash: sessionHash }), cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const id: unknown = await response.json();
    if (typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) return null;
    return `op-session:${createHash("sha256").update(`twin-plan-c-named-owner-v1:${id}`).digest("hex")}`;
  } catch { return null; }
}
