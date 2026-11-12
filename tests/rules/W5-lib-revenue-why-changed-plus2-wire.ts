// Shared fake PostgREST for the W5 lib-revenue-why-changed-plus2 tests (known-red + tests/rules). Fakes ONLY the
// wire: globalThis.fetch answers the supabase-js HTTP calls; every line of lib/ code runs for real. A helper, not a
// test (no `.test.` in the name), so `tests/rules/*.test.*` and any known-red glob skip it.
// The host is `.invalid` (RFC 2606): a request that outlives withWire fails to resolve instead of reaching Supabase.
Object.assign(process.env, { SUPABASE_URL: "https://w5-revenue-fake.invalid", SUPABASE_SERVICE_KEY: "offline-service-key" });

export type WireRequest = { method: string; path: string; url: URL; body: Record<string, unknown> | undefined };
export type WireResponse = { status: number; json: unknown; headers?: Record<string, string> };
export type Handler = (req: WireRequest) => WireResponse | undefined;
export type Row = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TIMEOUT: WireResponse = { status: 500, json: { code: "57014", message: "canceling statement due to statement timeout" } };

/** Postgres rejects a non-uuid inside `col=in.(...)` on a uuid column with 22P02; mirror that. */
export function uuidInFilterError(url: URL, col: string): WireResponse | undefined {
  const f = url.searchParams.get(col);
  if (!f?.startsWith("in.(")) return undefined;
  const bad = inList(f).find((v) => !UUID.test(v));
  return bad ? { status: 400, json: { code: "22P02", message: `invalid input syntax for type uuid: "${bad}"` } } : undefined;
}

const inList = (f: string) => f.slice(4, -1).split(",").filter(Boolean).map((v) => v.replace(/^"|"$/g, ""));
// `or`/`and` are NOT reserved: they reach matches() and throw, so a query this fake cannot evaluate fails loudly.
const RESERVED = new Set(["select", "order", "limit", "offset"]);
const NUMERIC = /^-?\d+(\.\d+)?$/;
const ISO = /^\d{4}-\d{2}-\d{2}T/;
/** Numbers as numbers, ISO timestamps as instants, everything else as text; null sorts last (Postgres ASC default). */
function compare(a: unknown, b: unknown): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  const [x, y] = [String(a), String(b)];
  if (NUMERIC.test(x) && NUMERIC.test(y)) return Number(x) - Number(y);
  if (ISO.test(x) && ISO.test(y)) return Date.parse(x) - Date.parse(y);
  return x.localeCompare(y);
}

function matches(value: unknown, filter: string): boolean {
  const [op, ...rest] = filter.split(".");
  const arg = rest.join(".");
  const v = value == null ? null : String(value);
  switch (op) {
    case "eq": return v === arg;
    case "neq": return v !== arg;
    case "is": return arg === "null" ? v === null : v === arg;
    case "not": return !matches(value, arg);
    case "in": return v !== null && inList(filter).includes(v);
    case "gte": case "gt": case "lte": case "lt": {
      if (v === null) return false;
      const c = compare(v, arg);
      return op === "gte" ? c >= 0 : op === "gt" ? c > 0 : op === "lte" ? c <= 0 : c < 0;
    }
    default: throw new Error(`fake PostgREST: unsupported filter ${filter}`);
  }
}

/** What PostgREST returns for a table GET: column filters, `order`, `offset`/`limit` (supabase-js `.range`/`.limit`), `select` projection. */
export function query(rows: Row[], url: URL): Row[] {
  let out = rows.filter((r) => [...url.searchParams].every(([k, f]) => RESERVED.has(k) || matches(r[k], f)));
  const order = url.searchParams.get("order");
  if (order) {
    const keys = order.split(",").map((o) => o.split("."));
    out = [...out].sort((x, y) => {
      for (const [col, dir] of keys) {
        const c = compare(x[col], y[col]);
        if (c) return dir === "desc" ? -c : c;
      }
      return 0;
    });
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? out.length);
  const cols = (url.searchParams.get("select") ?? "*").split(",");
  return out.slice(offset, offset + limit).map((r) => (cols.includes("*") ? r : Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]]))));
}

export async function withWire<T>(handler: Handler, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const path = url.pathname.replace(/^\/rest\/v1\//, "");
    const out = handler({ method, path, url, body }) ?? { status: 404, json: { code: "PGRST205", message: `fake has no ${method} ${path}` } };
    return new Response(out.json === null ? null : JSON.stringify(out.json), {
      status: out.status,
      headers: { "content-type": "application/json", ...(out.headers ?? {}) },
    });
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}
