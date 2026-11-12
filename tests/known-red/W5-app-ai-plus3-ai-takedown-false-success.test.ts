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
import { startFakeSupabase, asAdmin, outcome, blockedFetches } from "./W5-app-ai-plus3-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { setImageStatus } from "../../app/ai-models/actions";

const MODEL = "aaaaaaaa-1111-4111-8111-111111111111";
const IMAGE = "bbbbbbbb-2222-4222-8222-222222222222";
const FREE = `${MODEL}/${IMAGE}.jpg`;
const row = { id: IMAGE, model_id: MODEL, kind: "photo", storage_path: `${MODEL}/${IMAGE}.jpg`, public_path: FREE, status: "approved", access: "free", price_stars: null };

let sb!: Awaited<ReturnType<typeof startFakeSupabase>>;
test.before(async () => { sb = await startFakeSupabase(); });
test.after(() => sb.close());

function seed(publicRemove: "ok" | "fails") {
  sb.reset();
  sb.respond((c) => {
    if (c.path === "/rest/v1/ai_model_images" && c.method === "GET") return { body: [row] };
    if (c.method === "DELETE" && c.path === "/storage/v1/object/ai-public") {
      if (publicRemove === "fails") return { status: 500, body: { statusCode: "500", error: "internal", message: "storage backend unavailable" } };
      return { body: (c.body?.prefixes ?? []).map((name: string) => ({ name, bucket_id: "ai-public" })) };
    }
    return undefined;
  });
}
const publicRemoves = () => sb.calls.filter((c) => c.method === "DELETE" && c.path === "/storage/v1/object/ai-public");
const publicPathNulls = () => sb.calls.filter((c) => c.method === "PATCH" && c.path === "/rest/v1/ai_model_images" && c.body && "public_path" in c.body && c.body.public_path === null);

test("control: rejecting an approved Free image removes the public copy and clears public_path", async () => {
  seed("ok");
  const result = await outcome(asAdmin(() => setImageStatus(IMAGE, "rejected")));
  assert.equal(result, "resolved");
  assert.equal(publicRemoves().length, 1);
  assert.ok((publicRemoves()[0].body?.prefixes ?? []).includes(FREE), "the Free public copy is asked to be removed");
  assert.equal(publicPathNulls().length, 1, "public_path cleared");
  assert.deepEqual(blockedFetches, []);
});

test("F-B2: a failed public remove must not be recorded as taken down", async () => {
  seed("fails");
  const result = await outcome(asAdmin(() => setImageStatus(IMAGE, "rejected")));
  assert.equal(publicRemoves().length, 1, "the public remove was attempted");
  assert.equal(publicPathNulls().length, 0, `PATCH public_path:null was written although ai-public/${FREE} was not removed (action ${result})`);
  assert.notEqual(result, "resolved", "setImageStatus(rejected) reported success while the public copy is still served");
  assert.deepEqual(blockedFetches, []);
});
