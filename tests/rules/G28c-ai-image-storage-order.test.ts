// G28c (batch rwl 2 on PR #407 + Flash batch 2): app/ai-models/actions.ts orders every image change by direction, so a
// storage or DB failure always leaves the LESS exposed state (REVIEW.md inv 7: a deny is never harder than a go).
// C1  narrowing (reject, Free to Locked) writes the deny first and keeps public_path; storage down = row denied, error shown.
//     widening (Locked to Free) stages the new copy before removing the old one, so an approved row never points at nothing.
// C2  deleteAiImage removes public, then private, then the row; a cleanup failure never masks the real DB error.
// C10 the profile_image_id unset is checked, and runs after the image deny.
// Race: ai_model_purchases.image_id is ON DELETE CASCADE, so delete denies first, counts, and recounts right before the row
//     delete; a purchase landing after the deny is refused, not erased.
// Harness: tests/rules/G28-harness.ts (real server actions, fake Supabase on 127.0.0.1:0, deny-all fetch).
import { startFakeSupabase, asAdmin, outcome, blockedFetches, type WireCall, type Reply } from "./G28-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { deleteAiImage, setImageAccess, setImageStatus, uploadAiMedia } from "../../app/ai-models/actions";

const MODEL = "aaaaaaaa-1111-4111-8111-111111111111";
const IMAGE = "bbbbbbbb-2222-4222-8222-222222222222";
const FREE = `${MODEL}/${IMAGE}.jpg`, BLUR = `${MODEL}/${IMAGE}.blur.jpg`;
const freeRow = { id: IMAGE, model_id: MODEL, kind: "photo", storage_path: `${MODEL}/${IMAGE}.jpg`, public_path: FREE, status: "approved", access: "free", price_stars: null };
const lockedRow = { ...freeRow, access: "locked", price_stars: 50, public_path: BLUR };
const down = { status: 500, body: { statusCode: "500", error: "internal", message: "storage backend unavailable" } };
const dbDown = { status: 500, body: { code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null } };

let sb!: Awaited<ReturnType<typeof startFakeSupabase>>;
test.before(async () => { sb = await startFakeSupabase(); });
test.after(() => sb.close());

function seed(row: object, extra: (c: WireCall) => Reply | undefined = () => undefined) {
  sb.reset();
  sb.respond((c) => {
    const r = extra(c);
    if (r) return r;
    if (c.path === "/rest/v1/ai_model_images" && c.method === "GET") return { body: [row] };
    if (c.path === "/rest/v1/ai_model_purchases") return { body: [], headers: { "content-range": "*/0" } };
    if (c.method === "DELETE" && c.path.startsWith("/storage/v1/object/")) return { body: (c.body?.prefixes ?? []).map((name: string) => ({ name })) };
    if (c.method === "GET" && c.path.startsWith("/storage/v1/object/")) return { body: { bytes: "fixture" } };
    if (c.method === "POST" && c.path.startsWith("/storage/v1/object/")) return { body: { Key: c.path, Id: "obj-1" } };
    return undefined;
  });
}
const label = (c: WireCall) => `${c.method} ${c.path.replace("/storage/v1/object/", "storage:").replace("/rest/v1/", "db:")}${c.method === "PATCH" ? " " + JSON.stringify(c.body) : ""}`;
const trace = () => sb.calls.filter((c) => !(c.method === "GET" && c.path === "/rest/v1/ai_model_images")).map(label);
const imagePatches = () => sb.calls.filter((c) => c.method === "PATCH" && c.path === "/rest/v1/ai_model_images").map((c) => c.body);

test("C1: reject with ai-public down still writes the deny, keeps public_path, and reports the failure", async () => {
  seed(freeRow, (c) => (c.method === "DELETE" && c.path === "/storage/v1/object/ai-public" ? down : undefined));
  const result = await outcome(asAdmin(() => setImageStatus(IMAGE, "rejected")));
  assert.notEqual(result, "resolved", "the public copy is still up, so success must not be claimed");
  assert.deepEqual(imagePatches(), [{ status: "rejected" }], "the deny lands before storage, and public_path is NOT nulled while the copy is still up");
  assert.deepEqual(trace().slice(0, 3), [`PATCH db:ai_model_images {"status":"rejected"}`, `PATCH db:ai_models {"profile_image_id":null}`, "DELETE storage:ai-public"]);
  assert.deepEqual(blockedFetches, []);
});

test("C1: Free to Locked with ai-public down still writes the lock first (price on), public_path kept", async () => {
  seed(freeRow, (c) => (c.method === "DELETE" && c.path === "/storage/v1/object/ai-public" ? down : undefined));
  const result = await outcome(asAdmin(() => setImageAccess(IMAGE, "locked", 50)));
  assert.notEqual(result, "resolved");
  assert.deepEqual(imagePatches(), [{ access: "locked", price_stars: 50 }]);
  assert.deepEqual(blockedFetches, []);
});

test("C1: reject, storage ok: deny, unset profile, remove public copy, then null public_path", async () => {
  seed(freeRow);
  const result = await outcome(asAdmin(() => setImageStatus(IMAGE, "rejected")));
  assert.equal(result, "resolved");
  assert.deepEqual(trace(), [`PATCH db:ai_model_images {"status":"rejected"}`, `PATCH db:ai_models {"profile_image_id":null}`, "DELETE storage:ai-public", `PATCH db:ai_model_images {"public_path":null}`]);
  assert.deepEqual(blockedFetches, []);
});

test("C1 widening: Locked to Free whose upload fails keeps the blurred preview (approved row never points at nothing)", async () => {
  seed(lockedRow, (c) => (c.method === "POST" && c.path.startsWith("/storage/v1/object/ai-public/") ? down : undefined));
  const result = await outcome(asAdmin(() => setImageAccess(IMAGE, "free", null)));
  assert.notEqual(result, "resolved");
  const removed = sb.calls.filter((c) => c.method === "DELETE" && c.path === "/storage/v1/object/ai-public").flatMap((c) => c.body?.prefixes ?? []);
  assert.ok(!removed.includes(BLUR), `the current public preview was removed before its replacement existed (removed ${JSON.stringify(removed)})`);
  assert.deepEqual(imagePatches(), [], "no row write when the new copy could not be staged");
  assert.deepEqual(blockedFetches, []);
});

test("C1 widening: Locked to Free, storage ok: stage Free copy, write row, then remove the old preview", async () => {
  seed(lockedRow);
  const result = await outcome(asAdmin(() => setImageAccess(IMAGE, "free", null)));
  assert.equal(result, "resolved");
  assert.deepEqual(trace(), ["GET storage:ai-private/" + lockedRow.storage_path, "POST storage:ai-public/" + FREE, `PATCH db:ai_model_images {"access":"free","price_stars":null,"public_path":"${FREE}"}`, "DELETE storage:ai-public"]);
  assert.deepEqual(blockedFetches, []);
});

test("C10: a failed profile_image_id unset is surfaced, after the image is already denied, and the takedown still runs", async () => {
  for (const act of [() => setImageStatus(IMAGE, "rejected"), () => setImageAccess(IMAGE, "locked", 50)]) {
    seed(freeRow, (c) => (c.method === "PATCH" && c.path === "/rest/v1/ai_models" ? dbDown : undefined));
    const result = await outcome(asAdmin(act));
    assert.notEqual(result, "resolved", "the model still points at the denied image as its profile pic");
    assert.equal(trace()[0].startsWith("PATCH db:ai_model_images"), true, `image deny must land before the profile unset (trace ${JSON.stringify(trace())})`);
    assert.ok(trace().includes("DELETE storage:ai-public"), `the public takedown was skipped because the profile unset failed (trace ${JSON.stringify(trace())})`);
  }
  assert.deepEqual(blockedFetches, []);
});

test("C2: delete order is deny (reject takedown), public variants, count, private, recount, row; a failed private remove keeps the row", async () => {
  seed(lockedRow);
  assert.equal(await outcome(asAdmin(() => deleteAiImage(IMAGE))), "resolved");
  assert.deepEqual(trace(), [`PATCH db:ai_model_images {"status":"rejected"}`, `PATCH db:ai_models {"profile_image_id":null}`, "DELETE storage:ai-public", `PATCH db:ai_model_images {"public_path":null}`, "DELETE storage:ai-public", "HEAD db:ai_model_purchases", "DELETE storage:ai-private", "HEAD db:ai_model_purchases", "DELETE db:ai_model_images"]);
  seed(lockedRow, (c) => (c.method === "DELETE" && c.path === "/storage/v1/object/ai-private" ? down : undefined));
  const result = await outcome(asAdmin(() => deleteAiImage(IMAGE)));
  assert.notEqual(result, "resolved");
  assert.equal(sb.calls.some((c) => c.method === "DELETE" && c.path === "/rest/v1/ai_model_images"), false, "row deleted although its private original could not be removed (unretryable orphan)");
  assert.deepEqual(blockedFetches, []);
});

test("C2: an upload whose row insert fails reports the DB error even when the cleanup remove also fails", async () => {
  seed(freeRow, (c) => {
    if (c.method === "GET" && c.path === "/rest/v1/ai_models") return { body: [{ id: MODEL }] };
    if (c.method === "POST" && c.path === "/rest/v1/ai_model_images") return dbDown;
    if (c.method === "DELETE" && c.path === "/storage/v1/object/ai-private") return down;
    return undefined;
  });
  const fd = new FormData();
  fd.set("access", "free");
  fd.append("file", new File([Buffer.from("not really a video")], "clip.mp4", { type: "video/mp4" }));
  const result = await outcome(asAdmin(() => uploadAiMedia(MODEL, fd)));
  assert.equal(result, "rejected: Could not save", "the cleanup failure masked the real insert error");
  assert.deepEqual(blockedFetches, []);
});

for (const when of ["after the deny", "during storage removal"] as const) {
  test(`race: a purchase landing ${when} is refused, never erased by the cascade`, async () => {
    let bought = false;
    seed(lockedRow, (c) => {
      if (when === "after the deny" && c.method === "PATCH" && c.path === "/rest/v1/ai_model_images") bought = true;
      if (when === "during storage removal" && c.method === "DELETE" && c.path === "/storage/v1/object/ai-private") bought = true;
      if (c.path === "/rest/v1/ai_model_purchases") return { body: [], headers: { "content-range": bought ? "*/1" : "*/0" } };
      return undefined;
    });
    const result = await outcome(asAdmin(() => deleteAiImage(IMAGE)));
    assert.match(result, /^rejected: A fan bought this one/);
    assert.equal(sb.calls.some((c) => c.method === "DELETE" && c.path === "/rest/v1/ai_model_images"), false, "row DELETE sent, the cascade erased the fan's purchase");
    assert.deepEqual(blockedFetches, []);
  });
}
