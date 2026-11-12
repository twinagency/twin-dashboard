import "../support/admin-route-env";
/**
 * Rule (W4 lib-api-public-v2-plus6 F22, F23; promoted from tests/known-red/W4-lib-api-public-v2-plus6-resolve-clone.test.ts
 * on jaka/w7-close-20261112): lib/api-read.ts resolveClone, which every admin route with a `clone` input uses (incl.
 * the write routes clones/write, posting/write, media). Drives the real function (real supabase-js through
 * lib/supabase.ts) with PostgREST faked at the wire (tests/support/postgrest-wire.ts).
 * MODELLED: clones.id is uuid-typed, so `id=eq.<not a uuid>` answers 22P02, as Postgres does; `ilike` follows
 * PostgREST + Postgres LIKE: `*` and `%` match any run, `_` one char, `\` escapes, case-insensitive.
 * F22: `"%"`, `"Other%"`, `"Other_Clone"` must resolve no clone (each would pick a clone via the name wildcard).
 * F23: when every clones read fails (statement timeout) resolveClone must reject, not resolve null (route: 404).
 * Control: id, slug, exact name and other-case name ("other clone") resolve; unknown input is null.
 * resolveClone is a one-liner over lib/clone-name-match.ts resolveCloneRef, as are the assistant resolvers also driven
 * here: write-tools resolveCloneId (via executeWriteTool) and tools.ts resolveCloneIdLoose (via executeTool).
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/W4-resolve-clone.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { resolveClone } from "../../lib/api-read";
import { ilikeRegex, installWire as installPostgrest, json, pgError, statementTimeout } from "../support/postgrest-wire";
import { executeWriteTool } from "../../app/api/ai-assistant/write-tools";
import { executeTool } from "../../app/api/ai-assistant/tools";

const CLONE_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_CLONE_ID = "00000000-0000-4000-8000-000000000002";
const CLONES = [
  { id: CLONE_ID, slug: "fake-clone", name: "Fake Clone" },
  { id: OTHER_CLONE_ID, slug: "other-clone", name: "Other Clone" },
];
const uuidKey = (v: string) => (/^\{.*\}$/.test(v) ? v.slice(1, -1) : v).replace(/-/g, "").toLowerCase();

/** Fakes PostgREST GET /rest/v1/clones (eq on id/slug, ilike on name, limit). `fail` picks the requests that time out. */
function installWire(opts: { fail?: (filter: string) => boolean; rows?: typeof CLONES; seen?: string[] } = {}) {
  return installPostgrest(({ method, table, url }) => {
    if (method !== "GET" || table !== "clones") return undefined;
    let rows = opts.rows ?? CLONES;
    for (const [k, v] of url.searchParams) {
      if (k === "select" || k === "limit") continue;
      opts.seen?.push(`${k}=${v}`);
      if (opts.fail?.(`${k}=${v}`)) return statementTimeout();
      const m = /^(eq|ilike)\.([\s\S]*)$/.exec(v);
      if (!m || !["id", "slug", "name"].includes(k)) throw new Error(`fake wire: unmodelled filter ${k}=${v}`);
      const [, op, val] = m;
      if (k === "id" && !/^[0-9a-f]{32}$/.test(uuidKey(val))) return pgError("22P02", `invalid input syntax for type uuid: "${val}"`, 400);
      rows = rows.filter((r) => (k === "id" ? uuidKey(r.id) === uuidKey(val) : op === "eq" ? r[k as "slug"] === val : ilikeRegex(val).test(r[k as "name"])));
    }
    const limit = url.searchParams.get("limit");
    return json(limit ? rows.slice(0, Number(limit)) : rows);
  });
}
const all = () => true;

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
  const w = installWire({ fail: all });
  try {
    for (const input of ["fake-clone", CLONE_ID, "Fake Clone"]) {
      const r = await resolveClone(input).then((value) => ({ ok: true as const, value }), () => ({ ok: false as const }));
      assert.equal(r.ok, false, `a database outage reads as 'no clone matching' for ${input}: resolved ${r.ok ? JSON.stringify(r.value) : ""}`);
    }
  } finally { w.restore(); }
});

test("resolveCloneRef: uuid forms Postgres accepts; '*' never sent; two name matches is none; slug error throws", async () => {
  const seen: string[] = [];
  const w = installWire({ seen, rows: [...CLONES, { id: "00000000-0000-4000-8000-000000000003", slug: "twin-b", name: "OTHER CLONE" }] });
  try {
    for (const input of [`{${CLONE_ID}}`, CLONE_ID.replace(/-/g, ""), CLONE_ID.toUpperCase()]) {
      assert.equal((await resolveClone(input))?.slug, "fake-clone", input);
    }
    assert.equal(await resolveClone("other clone"), null, "two case-insensitive name matches is no match");
    assert.equal(await resolveClone("Clone (A), b.c:d"), null, "reserved PostgREST chars are a plain value for ilike");
    seen.length = 0;
    assert.equal(await resolveClone("Other*"), null);
    assert.deepEqual(seen, ["slug=eq.Other*"], "'*' must not reach the name step, where PostgREST reads it as %");
  } finally { w.restore(); }
  const f = installWire({ fail: (q) => q.startsWith("slug=") });
  try {
    await assert.rejects(resolveClone("other-clone"), /clone lookup failed/);
  } finally { f.restore(); }
});

test("write-tools: a wildcard clone name is refused before any write", async () => {
  const w = installWire();
  try {
    await assert.rejects(executeWriteTool("setCloneStatus", { clone: "Other%", status: "paused" }), /no clone found matching "Other%"/);
    assert.equal((await executeWriteTool("setCloneStatus", { clone: "*", status: "paused" }).catch((e: Error) => e.message)), 'no clone found matching "*"');
  } finally { w.restore(); }
});

test("write-tools: a clones read error rejects (approve route: 500), not 'no clone found'", async () => {
  const w = installWire({ fail: all });
  try {
    await assert.rejects(executeWriteTool("setCloneStatus", { clone: "fake-clone", status: "paused" }), /clone lookup failed/);
  } finally { w.restore(); }
});

test("assistant read tool: a wildcard clone name finds no clone; a read error rejects (openrouter: tool {error})", async () => {
  const w = installWire();
  try {
    assert.deepEqual(await executeTool("checkDialConflicts", { cloneIdOrSlug: "Other%" }), { error: 'no clone found matching "Other%"' });
  } finally { w.restore(); }
  const f = installWire({ fail: all });
  try {
    await assert.rejects(executeTool("checkDialConflicts", { cloneIdOrSlug: "fake-clone" }), /clone lookup failed/);
  } finally { f.restore(); }
});
