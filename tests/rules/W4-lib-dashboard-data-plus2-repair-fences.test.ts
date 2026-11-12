// RULE (W4 lib-dashboard-data-plus2 C1, C2; holds today, mutation-proven in tests/rules/mutations/W4-lib-dashboard-data-plus2/):
// lib/media-repair.ts's two write fences.
// C1: readOnlyFetch (inventory + preview transport) throws on any method but GET/HEAD and never reaches the base fetch.
// C2: assertWritable refuses every NEVER_WRITE column (price, free flag, storage path, clone, file id, ...), even when a
//     caller's allow-list names it.
// Pure calls; the base fetch is a recorder, nothing reaches a network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ITEM_FIELDS, NEVER_WRITE, WRITABLE_FIELDS, assertWritable, readOnlyFetch } from "../../lib/media-repair";

const URL_ = "http://fake-supabase.test/rest/v1/photos?id=eq.1";
function recorder() {
  const calls: { input: unknown; method: string | undefined }[] = [];
  const base = (async (input: unknown, init?: RequestInit) => { calls.push({ input, method: init?.method }); return new Response("[]"); }) as typeof fetch;
  return { calls, f: readOnlyFetch(base) };
}
/** NEVER_WRITE's size when C2 was written (price, free flag, storage path, clone, file id, teaser caption, id, created_at):
 *  the list may grow, a shrink is a dropped fence and fails here before the per-column checks below can miss it. */
const NEVER_WRITE_MIN = 8;
/** Sync throw or rejection, both count as refused. */
const refused = async (fn: () => unknown) => { try { await fn(); return false; } catch { return true; } };

test("C1 readOnlyFetch refuses POST, PATCH, PUT, DELETE (any case) and a POST Request object without calling the base fetch", async () => {
  const { calls, f } = recorder();
  for (const method of ["POST", "PATCH", "PUT", "DELETE", "post", "patch"]) {
    assert.ok(await refused(() => f(URL_, { method })), `${method} passed through`);
  }
  assert.ok(await refused(() => f(new Request(URL_, { method: "POST", body: "{}" }))), "POST Request passed through");
  assert.equal(calls.length, 0, `base fetch reached ${calls.length}x`);
});

test("C1 readOnlyFetch passes GET (explicit or default) and HEAD through to the base fetch unchanged", async () => {
  const { calls, f } = recorder();
  await f(URL_);
  await f(URL_, { method: "GET" });
  await f(URL_, { method: "HEAD" });
  assert.deepEqual(calls.map((c) => [c.input, c.method]), [[URL_, undefined], [URL_, "GET"], [URL_, "HEAD"]]);
});

test("C2 assertWritable refuses every NEVER_WRITE column, even when the allow-list names it", () => {
  assert.ok(NEVER_WRITE.length >= NEVER_WRITE_MIN, `NEVER_WRITE has ${NEVER_WRITE.length} columns, fewer than ${NEVER_WRITE_MIN}`);
  for (const c of NEVER_WRITE) {
    assert.throws(() => assertWritable([c]), new RegExp(`refusing to write column ${c}`));
    assert.throws(() => assertWritable([c], [...WRITABLE_FIELDS, ...NEVER_WRITE]), new RegExp(`refusing to write column ${c}`), `${c} accepted when allowed`);
    assert.throws(() => assertWritable(["caption", c], [...ITEM_FIELDS, c]), new RegExp(`refusing to write column ${c}`), `${c} accepted for items`);
  }
});

test("C2 assertWritable accepts the allow-listed fields and refuses one outside the given list", () => {
  assert.doesNotThrow(() => assertWritable([...WRITABLE_FIELDS]));
  assert.doesNotThrow(() => assertWritable([...ITEM_FIELDS], ITEM_FIELDS));
  assert.throws(() => assertWritable(["analysis_status"], ITEM_FIELDS), /refusing to write column analysis_status/);
});
