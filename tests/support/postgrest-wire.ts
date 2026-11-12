/**
 * Minimal PostgREST fake at the fetch boundary, for driving real supabase-js offline (lib/supabase.ts reads
 * SUPABASE_URL from tests/support/admin-route-env.ts). `handler` answers each request; returning undefined throws
 * "unmodelled", so a request a test did not expect fails loud instead of reaching the network.
 */
import { createHash, randomBytes } from "node:crypto";
import { after, beforeEach } from "node:test";

export type WireCall = { method: string; url: URL; table: string; body?: unknown };

export const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
export const pgError = (code: string, message: string, status: number) => json({ code, message, details: null, hint: null }, status);
export const statementTimeout = () => pgError("57014", "canceling statement due to statement timeout", 500);

export function installWire(handler: (call: WireCall) => Response | undefined) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const res = handler({ method, url, table: url.pathname.replace(/^\/rest\/v1\//, ""), body });
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

/** Lets fire-and-forget writes (`void supabaseAdmin...then()`) reach the fake before a test counts them. */
export const settle = (ms = 25) => new Promise<void>((r) => setTimeout(r, ms));

type Route = (call: WireCall) => Response;
/**
 * installWire for a whole test file, routed by "<METHOD> <path>" (e.g. "GET /rest/v1/api_keys"). Before each test the
 * routes and the call log are cleared and `serve` registers them again; `calls(route)` lists what reached one route.
 */
export function useWire(serve: (w: { on(route: string, reply: Route): void }) => void) {
  const routes = new Map<string, Route>();
  const seen: WireCall[] = [];
  const route = (c: WireCall) => `${c.method} ${c.url.pathname}`;
  const w = installWire((c) => { seen.push(c); return routes.get(route(c))?.(c); });
  beforeEach(() => { routes.clear(); seen.length = 0; serve({ on: (r, h) => void routes.set(r, h) }); });
  after(async () => { await settle(); w.restore(); });
  return { calls: (r: string) => seen.filter((c) => route(c) === r) };
}

// ── public API keys (lib/api-tenant.ts, lib/api-public-route.ts) ─────────────
export const newModelKey = () => randomBytes(32).toString("base64url");

/** An api_keys row as migrations 103/127 shape it, hashed independently of lib/api-tenant.ts. */
export function modelKeyRow(key: string, scope: "clone" | "fleet", id = `key-${scope}`): Record<string, unknown> {
  const clone_id = scope === "clone" ? "00000000-0000-4000-8000-000000000001" : null;
  return { id, clone_id, scope, label: scope, key_hash: createHash("sha256").update(key, "utf8").digest("hex"), revoked_at: null };
}

/** api_keys lookup by key_hash, the last_used_at PATCH, and the system_logs insert. */
export function serveModelKeys(w: Parameters<Parameters<typeof useWire>[0]>[0], rows: readonly Record<string, unknown>[]): void {
  w.on("GET /rest/v1/api_keys", (c) => json(rows.filter((r) => c.url.searchParams.get("key_hash") === `eq.${r.key_hash}`)));
  w.on("PATCH /rest/v1/api_keys", () => new Response(null, { status: 204 }));
  w.on("POST /rest/v1/system_logs", () => new Response(null, { status: 201 }));
}

/** One request to a withModelKey route with `Authorization: Bearer <key>`. */
export function bearerCall<R>(route: (req: Request) => Promise<R>, key: string, qs = "", path = "/api/v1/x"): Promise<R> {
  return route(new Request(`http://localhost${path}${qs}`, { headers: { authorization: `Bearer ${key}` } }));
}
