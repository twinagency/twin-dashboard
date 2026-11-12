/**
 * Minimal PostgREST fake at the fetch boundary, for driving real supabase-js offline (lib/supabase.ts reads
 * SUPABASE_URL from tests/support/admin-route-env.ts). `handler` answers each request; returning undefined throws
 * "unmodelled", so a request a test did not expect fails loud instead of reaching the network.
 */
export type WireCall = { method: string; url: URL; table: string };

export const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
export const pgError = (code: string, message: string, status: number) => json({ code, message, details: null, hint: null }, status);
export const statementTimeout = () => pgError("57014", "canceling statement due to statement timeout", 500);

export function installWire(handler: (call: WireCall) => Response | undefined) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const res = handler({ method, url, table: url.pathname.replace(/^\/rest\/v1\//, "") });
    if (!res) throw new Error(`fake wire: unmodelled ${method} ${url.href}`);
    return res;
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = real; } };
}

/** PostgREST `ilike` value -> RegExp: `*` is PostgREST's alias for `%`; then Postgres LIKE with `\` as escape. */
export function ilikeRegex(pattern: string): RegExp {
  let re = "";
  const p = pattern.replace(/\*/g, "%");
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\" && i + 1 < p.length) re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "%") re += "[\\s\\S]*";
    else if (c === "_") re += "[\\s\\S]";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}
