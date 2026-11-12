/**
 * KNOWN RED (W4 F5, docs/review/W4/api-ai-assistant-plus2.md): write-tools.ts:52-60 resolves a clone "by exact
 * name" with `.ilike("name", input).limit(1)`, `%` and `_` unescaped, so `clone:"%"` (card: "PAUSE clone %.")
 * pauses whichever clone the database returns first, and "Lily_Rose" can hit "Lily Rose".
 * Asserted on the CAPTURED WIRE REQUEST. The fake answers a name lookup with a row only when the pattern holds an
 * unescaped wildcard (what Postgres ILIKE would match for these inputs); an escaped or exact lookup gets [] because
 * no clone is literally named "%" / "Lily_Rose".
 * Like Postgres, the harness answers `id=eq.<non-uuid>` (e.g. `id=eq.%`) with HTTP 400 code 22P02, so the by-id
 * step fails the way it does live before the name lookup runs; the control checks that fidelity directly.
 * Fix shapes accepted: escape `%`/`_`, exact (eq) name match, uuid-only executor, refuse ambiguous; the wire
 * assertion only forbids an unescaped ILIKE wildcard, the outcome assertion only forbids a PATCH.
 * Control: a clone uuid resolves by id and PATCHes that clone.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/known-red/W4-api-ai-assistant-plus2-clone-wildcard.test.ts
 * DECLARED BYPASS: Next workAsyncStorage fake store (see harness header); PostgREST faked on 127.0.0.1.
 */
import { CLONE, OTHER_CLONE, inWorkStore, startFakePostgrest, type FakePostgrest } from "./W4-api-ai-assistant-plus2-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const LILY = { id: "66666666-6666-4666-8666-666666666666", name: "Lily Rose", slug: "lily-rose" };
const UNESCAPED_WILDCARD = /(^|[^\\])[%_]/;

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  pg.respond((c) => {
    if (c.table !== "clones" || c.method !== "GET") return undefined;
    const id = c.query.get("id");
    if (id) return { body: [CLONE, OTHER_CLONE, LILY].filter((r) => id === `eq.${r.id}`) };
    const name = c.query.get("name");
    if (name?.startsWith("ilike.") && UNESCAPED_WILDCARD.test(name.slice(6))) {
      return { body: name === "ilike.%" ? [OTHER_CLONE] : [LILY] };
    }
    return { body: [] };
  });
});

async function pause(clone: string): Promise<unknown> {
  const { executeWriteTool } = await import("../../app/api/ai-assistant/write-tools");
  try {
    return await inWorkStore(() => executeWriteTool("setCloneStatus", { clone, status: "paused" }));
  } catch (e) {
    return { thrown: e instanceof Error ? e.message : String(e) };
  }
}
const nameLookups = () => pg.calls.filter((c) => c.table === "clones" && c.method === "GET" && c.query.has("name"));

test("control: a clone uuid resolves by id and PATCHes exactly that clone", async () => {
  const r = (await pause(CLONE.id)) as any;
  assert.equal(r?.ok, true, JSON.stringify(r));
  const patches = pg.writes("PATCH", "clones");
  assert.equal(patches.length, 1);
  assert.equal(patches[0].query.get("id"), `eq.${CLONE.id}`);
});

test("control: the fake answers a non-uuid id filter with 400 22P02, like Postgres", async () => {
  const res = await fetch(`${pg.url}/rest/v1/clones?select=id&id=eq.%25`);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "22P02");
});

for (const input of ["%", "Lily_Rose"]) {
  test(`F5: clone "${input}" is not sent to PostgREST as an unescaped ILIKE pattern`, async () => {
    await pause(input);
    for (const c of nameLookups()) {
      const v = c.query.get("name")!;
      assert.ok(!(v.startsWith("ilike.") && UNESCAPED_WILDCARD.test(v.slice(6))), `wildcard name lookup on the wire: ${c.url}`);
    }
  });

  test(`F5: clone "${input}" does not pause a clone the wildcard happened to match`, async () => {
    await pause(input);
    assert.deepEqual(pg.writes("PATCH", "clones").map((c) => c.query.get("id")), [], "a wildcard input PATCHed a clone");
  });
}
