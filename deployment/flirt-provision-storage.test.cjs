"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateTarget, provision } = require("./flirt-provision-storage.cjs");
const project = require("./flirt-project.json");

function storage(initial = []) {
  const buckets = structuredClone(initial);
  const created = [];
  return {
    created,
    listBuckets: async () => ({ data: buckets, error: null }),
    createBucket: async (id, options) => {
      created.push(id);
      buckets.push({ id, name: id, public: options.public, file_size_limit: options.fileSizeLimit, allowed_mime_types: options.allowedMimeTypes || null });
      return { data: { name: id }, error: null };
    },
  };
}

test("storage setup rejects other projects before network access", () => {
  const ref = "abcdefghijklmnopqrst";
  assert.throws(() => validateTarget({ FLIRT_SUPABASE_PROJECT_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_SERVICE_KEY: "sb_secret_synthetic" }), /approved FLIRT project/);
});
test("read-only check never creates missing buckets", async () => {
  const api = storage();
  await assert.rejects(provision(api), /buckets are missing/);
  assert.deepEqual(api.created, []);
});
test("create is private and idempotent with exact limits", async () => {
  const api = storage();
  assert.deepEqual(await provision(api, true), { created: 3, verified: 3 });
  assert.deepEqual(await provision(api, true), { created: 0, verified: 3 });
  assert.equal(api.created.length, 3);
});
test("unsafe existing configuration aborts before any creation", async () => {
  const api = storage([{ ...project.buckets[2], public: true }]);
  await assert.rejects(provision(api, true), /configuration differs/);
  assert.deepEqual(api.created, []);
});
