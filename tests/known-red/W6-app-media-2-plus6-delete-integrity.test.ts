// KNOWN RED (data-risk; W6-app-media-2-plus6 findings 2, 3 and 4, HIGH).
// 2: deletePhoto/deleteVideo (app/media/actions.ts:459-497) and removeBundleItem (:726-733) remove the storage path the
//    BROWSER sent and discard the storage error, so a failed file removal still deletes the row and reports success, and a
//    mismatched path removes some other object. The agency guard checks the path (lib/agency-management.ts:122,131); the
//    internal admin path (access === null, :61) does not. bulkDeleteMedia (:547) already reads paths from the clone-scoped
//    row and checks storageError (comment :544-546).
// 3: every delete path removes Storage BEFORE the row delete; a failed row delete leaves a live row pointing at a deleted file.
// 4: paths are content-addressed (lib/media-storage-path.ts), so one object can back a photo row AND a bundle item (or two
//    bundles' items). Delete paths remove the object with no reference check.
// Conditions: 2 internal admin (or any dev-server caller, RISKS R4) with a stale path, or any storage error; 3 any DB error
// on the row delete; 4 operator reuses one photo in two places, then deletes one.
// Harness: real actions, DB + Storage faked at the wire (./W6-app-media-2-plus6-harness.ts).
// Run: nice -n 10 node --import tsx --test tests/known-red/W6-app-media-2-plus6-delete-integrity.test.ts
// Team's Claude owns the fixes. Not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { actions, CLONE, OTHER_CLONE, isRest, isStorageRemove, onWire, removedPaths, wire } from "./W6-app-media-2-plus6-harness";

const ID = "22222222-2222-2222-2222-222222222222";
const OWN_PATH = `${CLONE}/photos/${"a".repeat(64)}-mine.jpg`;
const FOREIGN_PATH = `${OTHER_CLONE}/photos/${"b".repeat(64)}-theirs.jpg`;
const SHARED_PATH = `${CLONE}/photos/${"c".repeat(64)}-shared.jpg`;
const rowDeletes = (table: string) => wire.filter((call) => isRest(call, table, "DELETE"));
const firstIndex = (pred: (i: number) => boolean) => wire.findIndex((_, i) => pred(i));
// Stateful fake: once the photo row is deleted, later reads (e.g. a reference check) no longer see it.
const photoRow = (call: Parameters<typeof isRest>[0], path: string) => isRest(call, "photos", "GET")
  ? { status: 200, body: rowDeletes("photos").length ? [] : [{ id: ID, storage_path: path }] } : undefined;

test("control: bulkDeleteMedia removes the path read from the clone-scoped row, then deletes the row", async () => {
  onWire((call) => photoRow(call, OWN_PATH));
  assert.equal(await actions.bulkDeleteMedia(CLONE, "photos", [ID]), 1);
  assert.deepEqual(removedPaths(), [OWN_PATH]);
  assert.equal(rowDeletes("photos").length, 1);
});

test("control: bulkDeleteMedia surfaces a storage error instead of reporting success", async () => {
  onWire((call) => photoRow(call, OWN_PATH)
    ?? (isStorageRemove(call) ? { status: 500, body: { statusCode: "500", error: "boom", message: "storage down" } } : undefined));
  await assert.rejects(actions.bulkDeleteMedia(CLONE, "photos", [ID]));
});

test("HIGH(2): deletePhoto never removes a storage path other than the row's own", async () => {
  onWire((call) => photoRow(call, OWN_PATH));
  try { await actions.deletePhoto(CLONE, ID, FOREIGN_PATH); } catch { /* refusing is fine */ }
  assert.ok(!removedPaths().includes(FOREIGN_PATH), `deletePhoto removed another clone's object: ${JSON.stringify(removedPaths())}`);
});

test("HIGH(2): deletePhoto with a failing storage removal is surfaced, never reported as success", async () => {
  onWire((call) => photoRow(call, OWN_PATH) ?? (isStorageRemove(call) ? { status: 500, body: { statusCode: "500", error: "boom", message: "storage down" } } : undefined));
  // A throw AFTER the row delete is accepted: rows-first then a surfaced storage error is the safe order (HIGH(3)).
  let threw = false;
  try { await actions.deletePhoto(CLONE, ID, OWN_PATH); } catch { threw = true; }
  assert.ok(threw || rowDeletes("photos").length === 0,
    "storage removal failed, yet the row was deleted and the action resolved (orphan object, false success)");
});

test("HIGH(3): a failing row delete never leaves the row pointing at an already-removed file (bulk delete)", async () => {
  onWire((call) => isRest(call, "photos", "GET") ? { status: 200, body: [{ id: ID, storage_path: OWN_PATH }] }
    : isRest(call, "photos", "DELETE") ? { status: 500, body: { code: "57014", message: "statement timeout" } } : undefined);
  await assert.rejects(actions.bulkDeleteMedia(CLONE, "photos", [ID]));
  assert.deepEqual(removedPaths(), [], "storage object removed although its row survived the failed delete");
});

test("HIGH(3): storage is removed only after the row delete succeeded (single photo delete)", async () => {
  onWire((call) => photoRow(call, OWN_PATH));
  await actions.deletePhoto(CLONE, ID, OWN_PATH);
  const rowAt = firstIndex((i) => isRest(wire[i], "photos", "DELETE"));
  const fileAt = firstIndex((i) => isStorageRemove(wire[i]));
  assert.ok(rowAt >= 0 && fileAt >= 0, "both a row delete and a storage removal are expected");
  assert.ok(rowAt < fileAt, `storage removed (request ${fileAt}) before the row delete (request ${rowAt})`);
});

test("HIGH(4): removing a bundle item keeps an object another row still references", async () => {
  // The same content-addressed object backs a single photo (photos.storage_path) and this bundle item.
  onWire((call) => {
    if (isRest(call, "photos", "GET")) return { status: 200, body: [{ id: ID, storage_path: SHARED_PATH }] };
    // Stateful: once the item row is deleted it no longer counts as a reference; only the photo row keeps the object alive.
    if (isRest(call, "photo_bundle_items", "GET")) return { status: 200, body: rowDeletes("photo_bundle_items").length ? [] : [{ id: "item-1", storage_path: SHARED_PATH }] };
    return undefined;
  });
  await actions.removeBundleItem(CLONE, "33333333-3333-3333-3333-333333333333", SHARED_PATH);
  assert.ok(!removedPaths().includes(SHARED_PATH), "removed an object a photo row still uses: that PPV now points at nothing");
});
