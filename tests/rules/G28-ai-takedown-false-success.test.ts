// Regression guard (G28): was KNOWN RED tests/known-red/W5-app-ai-plus3-ai-takedown-false-success.test.ts (origin/jaka/fix-sweep-20261112), fixed in this PR (app/ai-models/actions.ts removeObjects: storage remove error throws). Harness: tests/rules/G28-harness.ts. Original header below.
// KNOWN RED (W5 app-ai-plus3 F-B2, high, content exposure + false success): removeObjects ignores the `{ error }` that
// storage.remove returns (app/ai-models/actions.ts:40-43); syncPublic calls it for the stale public copies (:66) and then
// writes `public_path: null` (:67). So setImageStatus(id, "rejected") (:180-182) on an approved Free image resolves and
// records "no public copy" while ai-public/<model>/<id>.jpg is still in the public bucket, readable by anyone with the URL,
// and nothing will ever try to remove it again (the row now says there is nothing to remove).
// Control: storage remove succeeds -> resolves, PATCH ai_model_images {public_path:null} (holds).
// Turns green when a failed public remove rejects the action (or at least keeps public_path pointing at the copy).
// Coupling: storage-js issues remove as DELETE /storage/v1/object/<bucket> with JSON {prefixes:[...]}; the fake fails
// only that call on bucket ai-public. A fix that removes objects one by one on the same path still meets the fake.
// Harness: W5-app-ai-plus3-harness.ts (declared Next request-store bypass for cookies()/revalidatePath()).
// Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx --test <this file>. Offline: fake Supabase on 127.0.0.1:0.
// G28c (batch rwl 2 C1, supersedes G28 round 2): a takedown writes the deny (status/access) FIRST, keeping public_path, then
// removes the public copy, then nulls public_path; a failed remove leaves the row denied with the stale path recorded and
// rejects. A missing ai-public bucket (created lazily on first upload) means nothing is public, so it must not block a takedown.
import { startFakeSupabase, asAdmin, outcome, blockedFetches } from "./G28-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { setImageAccess, setImageStatus } from "../../app/ai-models/actions";

const MODEL = "aaaaaaaa-1111-4111-8111-111111111111";
const IMAGE = "bbbbbbbb-2222-4222-8222-222222222222";
const FREE = `${MODEL}/${IMAGE}.jpg`;
const row = { id: IMAGE, model_id: MODEL, kind: "photo", storage_path: `${MODEL}/${IMAGE}.jpg`, public_path: FREE, status: "approved", access: "free", price_stars: null };

let sb!: Awaited<ReturnType<typeof startFakeSupabase>>;
test.before(async () => { sb = await startFakeSupabase(); });
test.after(() => sb.close());

function seed(publicRemove: "ok" | "fails" | "no-bucket") {
  sb.reset();
  sb.respond((c) => {
    if (c.path === "/rest/v1/ai_model_images" && c.method === "GET") return { body: [row] };
    if (c.method === "DELETE" && c.path === "/storage/v1/object/ai-public") {
      if (publicRemove === "fails") return { status: 500, body: { statusCode: "500", error: "internal", message: "storage backend unavailable" } };
      if (publicRemove === "no-bucket") return { status: 400, body: { statusCode: "404", error: "Bucket not found", message: "Bucket not found" } };
      return { body: (c.body?.prefixes ?? []).map((name: string) => ({ name, bucket_id: "ai-public" })) };
    }
    return undefined;
  });
}
const publicRemoves = () => sb.calls.filter((c) => c.method === "DELETE" && c.path === "/storage/v1/object/ai-public");
const publicPathNulls = () => sb.calls.filter((c) => c.method === "PATCH" && c.path === "/rest/v1/ai_model_images" && c.body && "public_path" in c.body && c.body.public_path === null);
const imagePatches = () => sb.calls.filter((c) => c.method === "PATCH" && c.path === "/rest/v1/ai_model_images").map((c) => c.body);

test("control: rejecting an approved Free image writes the deny, removes the public copy, then nulls public_path", async () => {
  seed("ok");
  const result = await outcome(asAdmin(() => setImageStatus(IMAGE, "rejected")));
  assert.equal(result, "resolved");
  assert.equal(publicRemoves().length, 1);
  assert.ok((publicRemoves()[0].body?.prefixes ?? []).includes(FREE), "the Free public copy is asked to be removed");
  assert.equal(publicPathNulls().length, 1, "public_path cleared");
  assert.deepEqual(imagePatches(), [{ status: "rejected" }, { public_path: null }], "deny first, public_path nulled only after the remove");
  assert.ok(sb.calls.indexOf(publicRemoves()[0]) < sb.calls.indexOf(publicPathNulls()[0]), "remove before PATCH");
  assert.deepEqual(blockedFetches, []);
});

test("F-B2: a failed public remove must not be recorded as taken down, and the row stays denied", async () => {
  seed("fails");
  const result = await outcome(asAdmin(() => setImageStatus(IMAGE, "rejected")));
  assert.equal(publicRemoves().length, 1, "the public remove was attempted");
  assert.equal(publicPathNulls().length, 0, `PATCH public_path:null was written although ai-public/${FREE} was not removed (action ${result})`);
  assert.deepEqual(imagePatches(), [{ status: "rejected" }], "the deny lands before storage; public_path still records the stale copy");
  assert.notEqual(result, "resolved", "setImageStatus(rejected) reported success while the public copy is still served");
  assert.deepEqual(blockedFetches, []);
});

test("F-B2b: Free to Locked with a failed public remove still locks the row, public_path kept", async () => {
  seed("fails");
  const result = await outcome(asAdmin(() => setImageAccess(IMAGE, "locked", 50)));
  assert.equal(publicRemoves().length, 1, "the Free public copy remove was attempted");
  assert.ok((publicRemoves()[0].body?.prefixes ?? []).includes(FREE));
  assert.deepEqual(imagePatches(), [{ access: "locked", price_stars: 50 }], "the lock lands before storage; public_path is not rewritten while the Free copy is up");
  assert.notEqual(result, "resolved");
  assert.deepEqual(blockedFetches, []);
});

test("F-B2c: a missing ai-public bucket means nothing is public, so the reject still goes through", async () => {
  seed("no-bucket");
  const result = await outcome(asAdmin(() => setImageStatus(IMAGE, "rejected")));
  assert.equal(result, "resolved", "a takedown must never be harder than a go");
  assert.deepEqual(imagePatches(), [{ status: "rejected" }, { public_path: null }]);
  assert.deepEqual(blockedFetches, []);
});

test("F-B2d: Locked to Free whose row PATCH fails withdraws the new Free copy (row still says Locked)", async () => {
  const BLUR = `${MODEL}/${IMAGE}.blur.jpg`;
  sb.reset();
  sb.respond((c) => {
    if (c.path === "/rest/v1/ai_model_images" && c.method === "GET") return { body: [{ ...row, access: "locked", price_stars: 50, public_path: BLUR }] };
    if (c.path === "/rest/v1/ai_model_images" && c.method === "PATCH") return { status: 500, body: { code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null } };
    if (c.method === "DELETE" && c.path === "/storage/v1/object/ai-public") return { body: (c.body?.prefixes ?? []).map((name: string) => ({ name, bucket_id: "ai-public" })) };
    if (c.method === "GET" && c.path.startsWith("/storage/v1/object/")) return { body: { bytes: "fixture" } };
    if (c.method === "POST" && c.path.startsWith("/storage/v1/object/ai-public/")) return { body: { Key: `ai-public/${FREE}`, Id: "obj-1" } };
    return undefined;
  });
  const result = await outcome(asAdmin(() => setImageAccess(IMAGE, "free", null)));
  assert.notEqual(result, "resolved");
  assert.ok(sb.calls.some((c) => c.method === "POST" && c.path === `/storage/v1/object/ai-public/${FREE}`), "the Free copy was uploaded (harness proof)");
  const removed = publicRemoves().flatMap((c) => c.body?.prefixes ?? []);
  assert.ok(removed.includes(FREE), `the Free copy of a still-Locked image was left public (removed: ${JSON.stringify(removed)})`);
  assert.deepEqual(blockedFetches, []);
});
