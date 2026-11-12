import "../support/admin-route-env";
/**
 * Rule (W4 lib-api-public-v2-plus6 F22, F23; promoted from tests/known-red/W4-lib-api-public-v2-plus6-resolve-clone.test.ts
 * on jaka/w7-close-20261112): lib/api-read.ts resolveClone, which every admin route with a `clone` input uses (incl.
 * the write routes clones/write, posting/write, media). Drives the real function (real supabase-js through
 * lib/supabase.ts) with PostgREST faked at the wire by a minimal inline fetch (the review branch's
 * tests/support/admin-wire.ts is not on this base).
 * MODELLED: clones.id is uuid-typed, so `id=eq.<not a uuid>` answers 22P02, as Postgres does; `ilike` follows
 * PostgREST + Postgres LIKE: `*` and `%` match any run, `_` one char, `\` escapes, case-insensitive.
 * F22: `"%"`, `"Other%"`, `"Other_Clone"` must resolve no clone (each would pick a clone via the name wildcard).
 * F23: when every clones read fails (statement timeout) resolveClone must reject, not resolve null (route: 404).
 * Control: id, slug, exact name and other-case name ("other clone") resolve; unknown input is null.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/W4-resolve-clone.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { resolveClone } from "../../lib/api-read";

const CLONE_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_CLONE_ID = "00000000-0000-4000-8000-000000000002";
const CLONES = [
  { id: CLONE_ID, slug: "fake-clone", name: "Fake Clone" },
  { id: OTHER_CLONE_ID, slug: "other-clone", name: "Other Clone" },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const pgError = (code: string, message: string, status: number) => json({ code, message, details: null, hint: null }, status);

/** PostgREST `ilike` value -> RegExp: `*` is PostgREST's alias for `%`; then Postgres LIKE with `\` as escape. */
function ilikeRegex(pattern: string): RegExp {
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

/** Fakes PostgREST GET /rest/v1/clones (eq on id/slug, ilike on name, limit). Anything else fails loud. */
function installWire(opts: { fail?: boolean } = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" || url.pathname !== "/rest/v1/clones") throw new Error(`fake wire: unmodelled ${method} ${url.href}`);
    if (opts.fail) return pgError("57014", "canceling statement due to statement timeout", 500);
    let rows = CLONES;
    for (const [k, v] of url.searchParams) {
      if (k === "select" || k === "limit") continue;
      const m = /^(eq|ilike)\.([\s\S]*)$/.exec(v);
      if (!m || !["id", "slug", "name"].includes(k)) throw new Error(`fake wire: unmodelled filter ${k}=${v}`);
      const [, op, val] = m;
      if (k === "id" && !UUID.test(val)) return pgError("22P02", `invalid input syntax for type uuid: "${val}"`, 400);
      rows = rows.filter((r) => (op === "eq" ? r[k as "id"] === val : ilikeRegex(val).test(r[k as "id"])));
    }
    const limit = url.searchParams.get("limit");
    return json(limit ? rows.slice(0, Number(limit)) : rows);
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = real; } };
}

test("control: resolves by id, by slug and by name (exact or other case); unknown input is null", async () => {
  const w = installWire();
  try {
    assert.equal((await resolveClone(OTHER_CLONE_ID))?.slug, "other-clone");
    assert.equal((await resolveClone("other-clone"))?.id, OTHER_CLONE_ID);
    assert.equal((await resolveClone("Other Clone"))?.id, OTHER_CLONE_ID);
    assert.equal((await resolveClone("other clone"))?.id, OTHER_CLONE_ID);
    assert.equal(await resolveClone("no-such-clone"), null);
  } finally { w.restore(); }
});

test("F22: a wildcard name (%, *) resolves no clone", async () => {
  const w = installWire();
  try {
    for (const input of ["%", "*"]) {
      const r = await resolveClone(input);
      assert.equal(r, null, `${JSON.stringify(input)} resolved clone ${JSON.stringify(r)}`);
    }
  } finally { w.restore(); }
});

test("F22: a wildcard name matching exactly one clone (Other%, Other_Clone, Other*) resolves no clone", async () => {
  const w = installWire();
  try {
    for (const input of ["Other%", "Other_Clone", "Other*"]) {
      const r = await resolveClone(input);
      assert.equal(r, null, `${JSON.stringify(input)} resolved clone ${JSON.stringify(r)}`);
    }
  } finally { w.restore(); }
});

test("F23: when every clones read fails, resolveClone rejects instead of reporting no clone", async () => {
  const w = installWire({ fail: true });
  try {
    for (const input of ["fake-clone", CLONE_ID, "Fake Clone"]) {
      const r = await resolveClone(input).then((value) => ({ ok: true as const, value }), () => ({ ok: false as const }));
      assert.equal(r.ok, false, `a database outage reads as 'no clone matching' for ${input}: resolved ${r.ok ? JSON.stringify(r.value) : ""}`);
    }
  } finally { w.restore(); }
});
