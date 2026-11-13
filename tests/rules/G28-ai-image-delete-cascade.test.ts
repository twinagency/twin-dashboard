// Regression guard (G28): was KNOWN RED tests/known-red/W5-app-ai-plus3-ai-image-delete-cascade.test.ts (origin/jaka/fix-sweep-20261112), fixed in this PR (app/ai-models/actions.ts deleteAiImage: count error or null refuses). Harness: tests/rules/G28-harness.ts. Original header below.
// KNOWN RED (W5 app-ai-plus3 F-B1, high, money/data loss): deleteAiImage guards "a fan bought this one" with a
// head+count query and drops its `error` (app/ai-models/actions.ts:218-219):
//   const { count } = await ...from("ai_model_purchases").select("id", { count: "exact", head: true }).eq("image_id", imageId);
//   if ((count ?? 0) > 0) throw ...
// When the count fails (500, statement timeout 57014) `count` is null, `null ?? 0` is 0, and the action removes both
// storage copies and DELETEs the ai_model_images row; `ai_model_purchases.image_id ... on delete cascade`
// (twin-bot db/migrations/20261008140000_ai_models.sql:97) then wipes the fans' Stars purchase rows.
// Control: count=1 (content-range */1) -> rejects "A fan bought this one", no delete, no storage remove (holds).
// Turns green when a failed purchase count refuses the delete (throw on `error`, or treat a null count as unknown).
// Coupling: the fake answers every method on /rest/v1/ai_model_purchases (count via content-range), so a fix that
// switches the HEAD count to a GET select still meets it.
// Harness: W5-app-ai-plus3-harness.ts (declared Next request-store bypass for cookies()/revalidatePath()).
// Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx --test <this file>. Offline: fake Supabase on 127.0.0.1:0.
import { startFakeSupabase, asAdmin, outcome, blockedFetches } from "./G28-harness";
import assert from "node:assert/strict";
import test from "node:test";
// G28 round 2 (Flash): a failed public remove leaves the row and the original in place (retry safe); a missing ai-public
// bucket (lazy) counts as already gone. G28c: order is now public, then private, then the row (see G28c-ai-image-storage-order).
import { deleteAiImage } from "../../app/ai-models/actions";

const MODEL = "aaaaaaaa-1111-4111-8111-111111111111";
const IMAGE = "bbbbbbbb-2222-4222-8222-222222222222";
const row = { id: IMAGE, model_id: MODEL, kind: "photo", storage_path: `${MODEL}/${IMAGE}.jpg`, public_path: `${MODEL}/${IMAGE}.blur.jpg`, status: "approved", access: "locked", price_stars: 50 };

let sb!: Awaited<ReturnType<typeof startFakeSupabase>>;
test.before(async () => { sb = await startFakeSupabase(); });
test.after(() => sb.close());

function seed(purchases: "one" | "none" | "timeout", publicRemove: "ok" | "fails" | "no-bucket" = "ok") {
  sb.reset();
  sb.respond((c) => {
    if (c.path === "/rest/v1/ai_model_images" && c.method === "GET") return { body: [row] };
    if (c.path === "/rest/v1/ai_model_purchases") {
      if (purchases === "timeout") return { status: 500, body: { code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null } };
      return { body: [], headers: { "content-range": purchases === "one" ? "*/1" : "*/0" } };
    }
    if (c.method === "DELETE" && c.path === "/storage/v1/object/ai-public" && publicRemove === "fails") return { status: 500, body: { statusCode: "500", error: "internal", message: "storage backend unavailable" } };
    if (c.method === "DELETE" && c.path === "/storage/v1/object/ai-public" && publicRemove === "no-bucket") return { status: 400, body: { statusCode: "404", error: "Bucket not found", message: "Bucket not found" } };
    if (c.path.startsWith("/storage/v1/object/")) return { body: [] };
    return undefined;
  });
}
const rowDeletes = () => sb.calls.filter((c) => c.method === "DELETE" && c.path === "/rest/v1/ai_model_images");
const storageRemoves = () => sb.calls.filter((c) => c.method === "DELETE" && c.path.startsWith("/storage/v1/object/")).map((c) => `${c.path} ${JSON.stringify(c.body)}`);

test("control: a purchased image (count 1) is refused, nothing removed or deleted", async () => {
  seed("one");
  const result = await outcome(asAdmin(() => deleteAiImage(IMAGE)));
  assert.match(result, /^rejected: A fan bought this one/);
  assert.equal(sb.calls.some((c) => c.path === "/rest/v1/ai_model_purchases"), true, "purchase count was asked");
  assert.deepEqual(rowDeletes(), []);
  assert.deepEqual(storageRemoves(), []);
  assert.deepEqual(blockedFetches, []);
});

test("F-B1: a failed purchase count (57014) must not delete the image row (cascade wipes Stars purchases)", async () => {
  seed("timeout");
  const result = await outcome(asAdmin(() => deleteAiImage(IMAGE)));
  assert.equal(rowDeletes().length, 0, `DELETE /rest/v1/ai_model_images was sent after the purchase count failed (action ${result})`);
  assert.deepEqual(storageRemoves(), [], "storage objects removed after the purchase count failed");
  assert.notEqual(result, "resolved", "deleteAiImage reported success although it could not tell whether a fan bought the image");
  assert.deepEqual(blockedFetches, []);
});

const deletes = () => sb.calls.filter((c) => c.method === "DELETE").map((c) => c.path);

test("F-B3: a failed public remove keeps the row and the private original (retry safe)", async () => {
  seed("none", "fails");
  const result = await outcome(asAdmin(() => deleteAiImage(IMAGE)));
  assert.notEqual(result, "resolved", "deleteAiImage reported success although the public copy is still served");
  assert.deepEqual(rowDeletes(), [], "row deleted although the public copy could not be removed");
  assert.deepEqual(deletes(), ["/storage/v1/object/ai-public"], "only the public remove was attempted; the private original must still exist");
  assert.deepEqual(blockedFetches, []);
});

test("F-B3b: with the ai-public bucket missing the delete goes through: public, then private, then row", async () => {
  seed("none", "no-bucket");
  const result = await outcome(asAdmin(() => deleteAiImage(IMAGE)));
  assert.equal(result, "resolved", "a missing public bucket means nothing public is left, so the delete must not be blocked");
  assert.deepEqual(deletes(), ["/storage/v1/object/ai-public", "/storage/v1/object/ai-private", "/rest/v1/ai_model_images"]);
  assert.deepEqual(blockedFetches, []);
});
