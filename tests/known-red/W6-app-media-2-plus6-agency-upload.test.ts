// KNOWN RED (configured but inert; W6-app-media-2-plus6 finding 5, HIGH).
// Managing agencies are allowed uploadPhoto/uploadVideo (lib/agency-management.ts:117), and supabaseAdmin sends their writes
// through dashboardFetch -> scopeAgencyWrite (lib/agency-fetch.ts:78-84). The photos/videos POST field allowlist
// (lib/agency-write.ts:13-14) lacks every column analysisRowFields adds (analysis_status, analysis_version, analysis_model,
// analysis_provider, analysis_error, analysed_at, visual_facts), so the row insert of EVERY agency upload is refused, after the
// storage object was written. The originals/<path> backup (actions.ts:83) also fails assignedStoragePath, whose first path
// segment must be an assigned clone id (lib/agency-management.ts:11-14).
// Condition: a managing agency (e.g. Moxy with can_manage, Tether, LYNQ) uploads a photo or video.
// Harness: the REAL uploadPhoto builds the row (admin session, DB faked at the wire); the REAL scopeAgencyWrite and
// assignedStoragePath judge it as the agency write layer would. Offline; no agency session or cookie is created.
// Run: nice -n 10 node --import tsx --test tests/known-red/W6-app-media-2-plus6-agency-upload.test.ts
// Team's Claude owns the fix (allowlist: lib/agency-write.ts, programme lane 64). Not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { scopeAgencyWrite } from "../../lib/agency-write";
import { assignedStoragePath } from "../../lib/agency-management";
import { TETHER_PORTAL } from "../../lib/partner-portals";
import { actions, CLONE, isRest, onWire, wire } from "./W6-app-media-2-plus6-harness";

const agency = { id: TETHER_PORTAL.id, name: "Tether", cloneIds: [CLONE], canManage: true };
const ROW_URL = new URL("https://offline.supabase.invalid/rest/v1/photos");

/** The exact row the real uploadPhoto inserts (vision offline -> a "failed" analysis, manual price 300). */
async function uploadedRow(): Promise<Record<string, unknown>> {
  onWire((call) => isRest(call, "clones", "GET")
    ? { status: 200, body: { vision_model: null, photo_vision_model: null, category_pricing: null } }
    : call.method === "POST" && call.path.startsWith("/storage/v1/object/media/") ? { status: 200, body: { Key: "media/x" } }
    : isRest(call, "photos", "POST") ? { status: 201 } : undefined);
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3])], "beach.jpg", { type: "image/jpeg" }));
  fd.set("star_value", "300");
  const result = await actions.uploadPhoto(CLONE, fd);
  assert.deepEqual(result, { ok: true }, "the admin upload itself must succeed in the harness");
  const inserts = wire.filter((call) => isRest(call, "photos", "POST"));
  assert.equal(inserts.length, 1);
  return inserts[0].body as Record<string, unknown>;
}

test("control: the agency write layer admits a legacy-shaped photo row for an assigned clone", async () => {
  const row = await uploadedRow();
  const legacy = { clone_id: row.clone_id, storage_path: row.storage_path, star_value: row.star_value, is_free: row.is_free, image_name: row.image_name, teaser_caption: null };
  await scopeAgencyWrite(ROW_URL, "POST", legacy, agency);
  assert.equal(assignedStoragePath(agency, row.storage_path), row.storage_path);
});

test("HIGH: the row a real upload inserts is admitted by the agency write layer", async () => {
  const row = await uploadedRow();
  await assert.doesNotReject(scopeAgencyWrite(ROW_URL, "POST", row, agency),
    `agency upload insert refused; row keys: ${Object.keys(row).sort().join(",")}`);
});

test("HIGH: the originals/ backup path of an assigned clone's upload is admitted for that agency", async () => {
  const row = await uploadedRow();
  assert.doesNotThrow(() => assignedStoragePath(agency, `originals/${row.storage_path}`),
    "a compressed agency upload stores the main object, then the originals backup is denied and the insert never runs");
});
