// KNOWN RED (W7 app-tracker, finding: high 4, deleteItem removes screenshots before the row delete, unchecked).
// app/tracker/actions.ts:118-124: storage objects are removed first (:122), then the tracker_items DELETE runs (:123)
// and its error is never read. Condition: admin deletes an item and the row delete fails (FK, RLS, timeout): the
// screenshots are permanently gone while the item stays on the board linking to them.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh (lane rule); run:
//   node --import tsx --test tests/known-red/W7-app-tracker-delete-order.test.ts
// Offline: fake at the wire (globalThis.fetch, `.invalid` host, fake non-key service key), PostgREST and storage
// calls recorded, no network, no ports. Outside a request scope getDashboardAccess() is null
// (lib/dashboard-access.ts:16-21), so the guard passes as admin.
// Module stub: only `revalidatePath` on next/cache's CJS exports, because it throws "static generation store missing"
// outside Next; it is a no-op here. Red asserts both halves: storage spared AND the action rejects (failed delete
// must not resolve as success).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

process.env.SUPABASE_URL = "https://tracker-fixture.invalid";
process.env.SUPABASE_SERVICE_KEY = "fixture-not-a-key";
createRequire(import.meta.url)("next/cache").revalidatePath = () => {};

const ITEM = "00000000-0000-4000-8000-000000000001";
const PATHS = [`tracker/${ITEM}/1-a.png`, `tracker/${ITEM}/2-b.png`];
type Call = { method: string; path: string; search: string; body: unknown };
const calls: Call[] = [];
let rowDeleteFails = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  calls.push({ method, path: url.pathname, search: url.search, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
  if (method === "GET" && url.pathname === "/rest/v1/tracker_attachments") return json(PATHS.map(path => ({ path })));
  if (url.pathname.startsWith("/storage/v1/")) return json(PATHS.map(name => ({ name })));
  if (method === "DELETE" && url.pathname === "/rest/v1/tracker_items") {
    return rowDeleteFails ? json({ code: "23503", message: "fixture: row delete refused", details: null, hint: null }, 409) : new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204 });
}) as typeof fetch;

const storageDeletes = () => calls.filter(c => c.method === "DELETE" && c.path.startsWith("/storage/v1/"));
const rowDeletes = () => calls.filter(c => c.method === "DELETE" && c.path === "/rest/v1/tracker_items");

async function remove(failRow: boolean) {
  rowDeleteFails = failRow;
  calls.length = 0;
  const { deleteItem } = await import("../../app/tracker/actions");
  return deleteItem(ITEM).then(() => "resolved", (error: Error) => `rejected: ${error.message}`);
}

test("control: a successful delete removes the item's screenshots from storage and deletes the row", async () => {
  assert.equal(await remove(false), "resolved");
  const removed = storageDeletes();
  assert.equal(removed.length, 1, "one storage remove call");
  assert.equal(removed[0].path, "/storage/v1/object/media");
  assert.deepEqual(removed[0].body, { prefixes: PATHS });
  assert.equal(rowDeletes().length, 1);
  assert.match(rowDeletes()[0].search, new RegExp(`id=eq.${ITEM}`));
});

test("W7 delete-order: no storage delete happens when the item row delete fails", async () => {
  const result = await remove(true);
  assert.deepEqual(storageDeletes().map(c => c.body), [], "screenshots must not be removed if the item row was not deleted");
  assert.match(result, /^rejected: /, "a failed row delete must reject, not resolve as deleted");
});
