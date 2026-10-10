// Refuses a clones.engine switch (live <-> v2) while V2 message-credit charging is on or metered
// work is open. The switch itself is written by the V2 bot app's POST /api/girls/engine; the
// dashboard reaches it only through the /bot-v2 proxy, so the proxy runs this guard first.
//
// Contract: STAGE2A/CONTRACT.md sections 4.1 (clones.v2_credits_enabled) and 5.9
// (public.v2credit_open_work). The schema may not be applied yet: a "does not exist" answer from
// PostgREST means the feature is not installed and the switch is allowed exactly as before.
// Every other failure refuses (fail closed).

export type GuardDb = {
  from(table: string): {
    select(cols: string): { eq(col: string, val: string): { maybeSingle(): PromiseLike<{ data: unknown; error: GuardErr | null }> } };
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: GuardErr | null }>;
};
type GuardErr = { code?: string; message?: string; status?: number } | null;

export type GuardResult = { allow: true } | { allow: false; status: number; error: string };

export const MSG_ENABLED =
  "Message credits are enabled for this creator. Disable them in the V2 monitor and let open replies finish before switching engines.";
export const MSG_UNREADABLE =
  "Could not check whether message credits are active for this creator, so the engine was not switched. Try again in a minute.";
const msgOpen = (n: number) =>
  `${n} metered ${n === 1 ? "reply is" : "replies are"} still unresolved; wait for them to finish or expire, then try again.`;

function notInstalled(e: NonNullable<GuardErr>): boolean {
  const code = String(e.code ?? "");
  if (code === "42703" || code === "42883" || code === "PGRST202" || code === "PGRST204") return true;
  if (e.status === 404) return true;
  return /column .*does not exist|could not find the function|function .*does not exist/i.test(String(e.message ?? ""));
}

const refuse = (error: string, status = 409): GuardResult => ({ allow: false, status, error });

export async function guardEngineSwitch(db: GuardDb, cloneId: unknown): Promise<GuardResult> {
  if (typeof cloneId !== "string" || !cloneId.trim()) return refuse("Missing creator id.", 400);
  try {
    const row = await db.from("clones").select("v2_credits_enabled").eq("id", cloneId).maybeSingle();
    if (row.error) {
      if (!notInstalled(row.error)) return refuse(MSG_UNREADABLE);
      // columns not applied: nothing can be charging
    } else {
      const r = row.data as { v2_credits_enabled?: unknown } | null;
      if (!r) return refuse("Creator not found.", 404);
      if (r.v2_credits_enabled !== false) return refuse(MSG_ENABLED); // true, null or anything odd
    }

    const work = await db.rpc("v2credit_open_work", { p_clone_id: cloneId });
    if (work.error) {
      if (notInstalled(work.error)) return { allow: true };
      return refuse(MSG_UNREADABLE);
    }
    const w = work.data as { ok?: unknown; reserved_turns?: unknown } | null;
    if (!w || w.ok !== true) return refuse(MSG_UNREADABLE);
    const n = w.reserved_turns;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return refuse(MSG_UNREADABLE);
    if (n > 0) return refuse(msgOpen(n));
    return { allow: true };
  } catch {
    return refuse(MSG_UNREADABLE);
  }
}

// Used by the /bot-v2 proxy. Returns a Response to send back when the request is a refused engine
// switch, or null to forward it unchanged.
export async function engineSwitchGate(
  method: string,
  path: string[],
  body: string,
  db: () => GuardDb,
): Promise<Response | null> {
  if (method !== "POST" || path.map((p) => p.toLowerCase()).join("/") !== "api/girls/engine") return null;
  let id: unknown;
  try { id = (JSON.parse(body || "{}") as { id?: unknown }).id; } catch { id = undefined; }
  let res: GuardResult;
  try { res = await guardEngineSwitch(db(), id); } catch { res = refuse(MSG_UNREADABLE); }
  if (res.allow) return null;
  return new Response(JSON.stringify({ ok: false, error: res.error }), {
    status: res.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
