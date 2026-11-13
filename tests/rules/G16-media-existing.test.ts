import "../support/admin-route-env";
// Regression guard (G16, Flash on #405): a file whose bytes are already in the library returns early from
// uploadPhoto before star_value / is_free are read, so the route must not count it as uploaded (that claims the
// requested price was applied). Drives the real route and the real uploadPhoto; PostgREST and Storage faked at the
// wire. The same file is uploaded twice: the first creates the object and the photos row, the second hits the
// existing object (Storage 409) and the existing row.
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { CLONE_ID, adminRequest, callJson, fakeClone, inNextRoute, installWire } from "../support/admin-wire";
import { POST } from "../../app/api/admin/v1/media/route";

const jpeg = () => sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 120, g: 60, b: 30 } } }).jpeg().toBuffer();

function wire() {
  const stored = new Set<string>();
  return installWire({
    tables: { clones: [fakeClone()] },
    override: ({ method, url }) => {
      if (!url.pathname.startsWith("/storage/v1/object/")) return undefined;
      if (method !== "POST" && method !== "PUT") return undefined;
      const key = url.pathname;
      if (stored.has(key)) {
        return new Response(JSON.stringify({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      stored.add(key);
      return new Response(JSON.stringify({ Key: key.slice("/storage/v1/object/".length), Id: "x" }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
}

async function upload(bytes: Buffer, name: string, starValue: string) {
  const form = new FormData();
  form.set("clone", CLONE_ID);
  form.set("type", "photo");
  form.set("star_value", starValue);
  form.append("file", new File([new Uint8Array(bytes)], name, { type: "image/jpeg" }));
  return inNextRoute("/api/admin/v1/media", () => callJson(POST, adminRequest("/api/admin/v1/media", { form })));
}

test("control: a new file is uploaded, priced as asked, and inserted once", async () => {
  const w = wire();
  try {
    const { status, body } = await upload(await jpeg(), "a.jpg", "300");
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual(body.uploaded, ["a.jpg"]);
    const rows = w.rest("photos", "POST");
    assert.equal(rows.length, 1);
    assert.equal((rows[0].body as { star_value?: unknown }).star_value, 300);
  } finally { w.restore(); }
});

test("an already-stored file lands in existing, not uploaded, and no new price is written or claimed", async () => {
  const w = wire();
  try {
    const bytes = await jpeg();
    const first = await upload(bytes, "a.jpg", "300");
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const { status, body } = await upload(bytes, "a.jpg", "900");
    assert.deepEqual(body.uploaded ?? [], [], "an existing file is not reported as uploaded");
    assert.deepEqual(body.existing, ["a.jpg"]);
    assert.equal(body.ok, false, "nothing new saved and the price was not applied");
    assert.equal(status, 409);
    assert.equal(w.rest("photos", "POST").length, 1, "no second insert");
    assert.equal(w.calls.filter((c) => c.table === "photos" && c.method === "PATCH").length, 0, "no price write to the existing row");
  } finally { w.restore(); }
});
