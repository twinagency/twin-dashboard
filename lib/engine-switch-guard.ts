// Refuses a clones.engine switch (live <-> v2) while V2 message-credit charging is on or metered
// work is open. The switch itself is written by the V2 bot app's POST /api/girls/engine; the
// dashboard reaches it only through the /bot-v2 proxy, so the proxy runs this guard first.
//
// Contract: STAGE2A/CONTRACT.md sections 4.1 (clones.v2_credits_enabled) and 5.9
// (public.v2credit_open_work). The schema may not be applied yet: the switch is allowed exactly as
// before ONLY when the column read positively reports the columns absent AND the rpc is absent.
// If the columns are installed, any open_work failure refuses; every other failure refuses too.

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

// Positive "this schema object is absent" answers only. Anything else (network error, 5xx,
// timeout, bare 404 from a proxy) is NOT proof of absence and must refuse.
function columnAbsent(e: NonNullable<GuardErr>): boolean {
  const code = String(e.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /column .*does not exist|could not find the .* column/i.test(String(e.message ?? ""));
}
function rpcAbsent(e: NonNullable<GuardErr>): boolean {
  const code = String(e.code ?? "");
  if (code === "42883" || code === "PGRST202") return true;
  if (e.status === 404) return true;
  return /could not find the function|function .*does not exist/i.test(String(e.message ?? ""));
}

// Upstream window for the /bot-v2 proxy. The engine switch runs a verified hand-over (up to ~70 s)
// before the V2 app answers, so it gets 100 s; everything else keeps 20 s.
export const UPSTREAM_TIMEOUT_MS = 20_000;
export const ENGINE_SWITCH_TIMEOUT_MS = 100_000;
export function upstreamTimeoutMs(method: string, path: string[]): number {
  return method === "POST" && path.map((p) => p.toLowerCase()).join("/") === "api/girls/engine"
    ? ENGINE_SWITCH_TIMEOUT_MS
    : UPSTREAM_TIMEOUT_MS;
}

const refuse = (error: string, status = 409): GuardResult => ({ allow: false, status, error });

export async function guardEngineSwitch(db: GuardDb, cloneId: unknown): Promise<GuardResult> {
  if (typeof cloneId !== "string" || !cloneId.trim()) return refuse("Missing creator id.", 400);
  try {
    const row = await db.from("clones").select("v2_credits_enabled").eq("id", cloneId).maybeSingle();
    let columnsInstalled = false;
    if (row.error) {
      if (!columnAbsent(row.error)) return refuse(MSG_UNREADABLE);
      // columns positively absent: nothing can be charging
    } else {
      columnsInstalled = true;
      const r = row.data as { v2_credits_enabled?: unknown } | null;
      if (!r) return refuse("Creator not found.", 404);
      if (r.v2_credits_enabled !== false) return refuse(MSG_ENABLED); // true, null or anything odd
    }

    const work = await db.rpc("v2credit_open_work", { p_clone_id: cloneId });
    if (work.error) {
      // allow-on-missing-rpc only when the columns were positively reported absent too
      if (!columnsInstalled && rpcAbsent(work.error)) return { allow: true };
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
