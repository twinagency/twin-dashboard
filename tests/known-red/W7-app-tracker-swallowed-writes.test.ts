// KNOWN RED (W7 app-tracker, finding: high 3, write errors discarded, action resolves as success).
// app/tracker/actions.ts:137-141 (addNote insert), :155-164 (addCommit upsert), :297-302 (askBot job insert) and
// :252-256 (updateBatch live: tracker_items cascade) await the Supabase write and never read `error`, then revalidate.
// Condition: the write fails (constraint, FK on a bad id, timeout, 5xx). The action resolves, the UI treats it as saved;
// for updateBatch the batch row is then set live and the board archives it with its items at their old status.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh (lane rule); run:
//   node --import tsx --test tests/known-red/W7-app-tracker-swallowed-writes.test.ts
// Offline: fake at the wire (globalThis.fetch, `.invalid` host, fake non-key service key), no network, no ports.
// Outside a request scope getDashboardAccess() is null (lib/dashboard-access.ts:16-21), so the guard passes as admin.
// Module stub: only `revalidatePath` on next/cache's CJS exports, because it throws "static generation store missing"
// outside Next; it records the path instead. Each red case asserts the rejection AND that nothing was revalidated, so
// an unrelated throw after a swallowed write cannot pass it alone.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

process.env.SUPABASE_URL = "https://tracker-fixture.invalid";
process.env.SUPABASE_SERVICE_KEY = "fixture-not-a-key";
const revalidated: string[] = [];
createRequire(import.meta.url)("next/cache").revalidatePath = (path: string) => { revalidated.push(path); };

type Call = { method: string; table: string };
const calls: Call[] = [];
let failing = ""; // "METHOD /rest/v1/table" that the wire refuses
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  calls.push({ method, table: url.pathname });
  if (`${method} ${url.pathname}` === failing) return json({ code: "23503", message: "fixture: write refused", details: null, hint: null }, 409);
  if (method === "GET") return json([]);
  return new Response(null, { status: 204 });
}) as typeof fetch;

const actions = () => import("../../app/tracker/actions");
const ITEM = "00000000-0000-4000-8000-000000000001", BATCH = "00000000-0000-4000-8000-0000000000b1";
function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
function arm(write: string) { failing = write; calls.length = 0; revalidated.length = 0; }
const reached = (write: string) => calls.some(c => `${c.method} ${c.table}` === write);

test("control: updateItem rejects when its tracker_items PATCH fails", async () => {
  arm("PATCH /rest/v1/tracker_items");
  const { updateItem } = await actions();
  await assert.rejects(updateItem(ITEM, form({ title: "renamed" })), /write refused/);
  assert.ok(reached("PATCH /rest/v1/tracker_items"));
  assert.deepEqual(revalidated, []);
});

test("W7 swallowed-writes: addNote rejects when the tracker_notes insert fails", async () => {
  arm("POST /rest/v1/tracker_notes");
  const { addNote } = await actions();
  const run = addNote(ITEM, form({ body: "seen again on clone 3" }));
  await assert.rejects(run, "a failed note insert must not resolve as saved");
  assert.ok(reached("POST /rest/v1/tracker_notes"));
  assert.deepEqual(revalidated, [], "no revalidate after the failed write");
});

test("W7 swallowed-writes: addCommit rejects when the tracker_commits upsert fails", async () => {
  arm("POST /rest/v1/tracker_commits");
  const { addCommit } = await actions();
  const run = addCommit(ITEM, form({ sha: "abc1234", repo: "bot", subject: "fix" }));
  await assert.rejects(run, "a failed commit upsert must not resolve as saved");
  assert.ok(reached("POST /rest/v1/tracker_commits"));
  assert.deepEqual(revalidated, [], "no revalidate after the failed write");
});

test("W7 swallowed-writes: askBot rejects when the tracker_bot_jobs insert fails", async () => {
  arm("POST /rest/v1/tracker_bot_jobs");
  const { askBot } = await actions();
  await assert.rejects(askBot("triage", ITEM, 7), "a failed job insert must not resolve as queued");
  assert.ok(reached("POST /rest/v1/tracker_bot_jobs"));
  assert.deepEqual(revalidated, [], "no revalidate after the failed write");
});

test("W7 swallowed-writes: updateBatch live rejects when the tracker_items cascade fails", async () => {
  arm("PATCH /rest/v1/tracker_items");
  const { updateBatch } = await actions();
  await assert.rejects(updateBatch(BATCH, form({ status: "live" })), "a failed item cascade must not resolve as live");
  assert.ok(reached("PATCH /rest/v1/tracker_items"));
  assert.deepEqual(revalidated, [], "no revalidate after the failed write");
});
