import "../support/admin-route-env";
// Regression guard (G16): promoted from known-red tests/known-red/W4-api-admin-plus1-media-false-success.test.ts as a regression guard. Original header below.
/**
 * KNOWN RED (W4 api-admin-plus1 F5, docs/review/W4/api-admin-plus1.md): POST /api/admin/v1/media answers 200
 * `ok:true` even when every file failed and nothing was saved (false success). Drives the real route and the real
 * uploadPhoto server action; PostgREST faked at the wire (tests/support/admin-wire.ts); the files are not images, so
 * the action's own image conversion (lib/photo-prepare.ts) refuses each one. Control: each failed file is named in
 * `failed` with that conversion error. Turns green when an all-failed upload is non-2xx or ok:false.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, adminRequest, callJson, fakeClone, inNextRoute, installWire } from "../support/admin-wire";
import { POST } from "../../app/api/admin/v1/media/route";

function upload() {
  const form = new FormData();
  form.set("clone", CLONE_ID);
  form.set("type", "photo");
  form.append("file", new File([new Uint8Array(32).fill(7)], "not-a-photo-1.jpg", { type: "image/jpeg" }));
  form.append("file", new File([new Uint8Array(32).fill(8)], "not-a-photo-2.jpg", { type: "image/jpeg" }));
  return inNextRoute("/api/admin/v1/media", () => callJson(POST, adminRequest("/api/admin/v1/media", { form })));
}

test("control: every unreadable file is named in failed with the image-conversion error, none in uploaded", async () => {
  const w = installWire({ tables: { clones: [fakeClone()] } });
  try {
    const { body } = await upload();
    assert.deepEqual(body.uploaded ?? [], []);
    assert.deepEqual(body.failed.map((f: { file: string }) => f.file), ["not-a-photo-1.jpg", "not-a-photo-2.jpg"]);
    for (const f of body.failed as { error: string }[]) assert.match(f.error, /image could not be read/i, "failed for the conversion, not the harness");
    assert.equal(w.rest("photos", "POST").length, 0, "nothing inserted");
  } finally { w.restore(); }
});

test("F5: an upload where every file failed is not reported as 200 ok:true", async () => {
  const w = installWire({ tables: { clones: [fakeClone()] } });
  try {
    const { status, body } = await upload();
    assert.equal((body.uploaded ?? []).length, 0, "fixture: nothing saved");
    assert.ok(!(status === 200 && body.ok === true), `all-failed upload answered ${status} ok:${body.ok}`);
  } finally { w.restore(); }
});
