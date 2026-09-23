// Guards for lib/media-storage-path.ts — the storage path builder shared by
// app/media/actions.ts (uploadPhoto, uploadVideo, addBundleItem) and the bulk
// importers (scripts/import-media.ts, import-video-media.ts, import-videos.ts).
//
// THE BUG THIS EXISTS FOR, measured 2026-09-16: every call site built its path
// as `${cloneId}/${type}/${Date.now()}-${filename}`. That makes EVERY call
// produce a unique path, so a retry, a double-submit, or a re-run of a bulk
// import over the same folder never recognised the object it already wrote —
// it just wrote a second one. Fleet-wide in the `media` bucket: 2,618 objects
// collapsed to 2,142 canonical files once the timestamp prefix was stripped
// (450 duplicate groups, ~1,353MB wasted), and 481 objects (1,051MB) are now
// orphaned because a later cleanup deleted the duplicate DB rows with no way
// to tell which of several timestamped copies was "the" object to keep.
//
// THE CHECK THAT MATTERS: the same bytes uploaded twice must resolve to the
// SAME path, so a create-only retry can reuse the object instead of accumulating.
// Everything else here is the guard the old Date.now() prefix was actually
// providing, proven to still hold: two DIFFERENT files that share an original
// filename must NOT collide on one path.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mediaStoragePath, mediaContentHash } from "../lib/media-storage-path";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function sourceCode(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}
// Same file, with comments stripped, for counting occurrences in actual code
// rather than in the explanatory comments sitting next to them.
function codeOnly(rel: string): string {
  return sourceCode(rel).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const bytesA = Buffer.from("this is the first photo's actual bytes, once");
const bytesA2 = Buffer.from("this is the first photo's actual bytes, once"); // same content, separate buffer
const bytesB = Buffer.from("this is a completely different photo's bytes");

check("THE bug: the same logical upload retried twice produces ONE path, not two", () => {
  const first = mediaStoragePath("clone-1", "photos", "IMG_001.jpg", bytesA);
  // Simulates a retry: the browser resubmits after a timeout, or a bulk import
  // is re-run over the same folder after a partial failure — same clone, same
  // filename, same bytes, called again.
  const retry = mediaStoragePath("clone-1", "photos", "IMG_001.jpg", bytesA2);
  assert.equal(first, retry, "a retried upload of identical bytes must resolve to the same storage path");
});

check("the guard Date.now() used to provide still holds: same filename, different content, different path", () => {
  // Two different photo shoots both exporting "IMG_001.jpg" must not collide.
  const a = mediaStoragePath("clone-1", "photos", "IMG_001.jpg", bytesA);
  const b = mediaStoragePath("clone-1", "photos", "IMG_001.jpg", bytesB);
  assert.notEqual(a, b, "two different files with the same original filename must not share a path");
});

check("different clones never collide even with identical bytes and filename", () => {
  const a = mediaStoragePath("clone-1", "photos", "IMG_001.jpg", bytesA);
  const b = mediaStoragePath("clone-2", "photos", "IMG_001.jpg", bytesA);
  assert.notEqual(a, b, "the clone id must still namespace the path");
});

check("photos and videos of the same clone never collide even with identical bytes and filename", () => {
  const a = mediaStoragePath("clone-1", "photos", "x.jpg", bytesA);
  const b = mediaStoragePath("clone-1", "videos", "x.jpg", bytesA);
  assert.notEqual(a, b, "the media type must still namespace the path");
});

check("the path is content-derived, not clock-derived", () => {
  const a = mediaStoragePath("clone-1", "photos", "IMG_001.jpg", bytesA);
  const b = mediaStoragePath("clone-1", "photos", "IMG_001.jpg", bytesA);
  assert.equal(a, b, "two calls with identical inputs back to back must not differ (rules out Date.now())");
  assert.equal(a.includes(mediaContentHash(bytesA)), true, "the path must contain the content hash");
});

check("the filename is still sanitised into the path", () => {
  const p = mediaStoragePath("clone-1", "photos", "weird name!! (final).jpg", bytesA);
  assert.doesNotMatch(p, /[^a-zA-Z0-9._/-]/, `path has unsafe characters: ${p}`);
});

check("app/media/actions.ts uses create-only storage and handles safe retries", () => {
  const src = codeOnly("app/media/actions.ts");
  assert.ok(!/upsert:\s*true/.test(src), "agency uploads must never request storage replacement");
  const uploads = (src.match(/\.upload\(/g) ?? []).length;
  assert.equal(uploads, 1, "all dashboard media writes must use the shared upload helper");
  assert.match(src, /uploadContentAddressedMedia/, "dashboard uploads must use the retry-safe helper");
  assert.match(src, /isExistingStorageObject/, "the helper must distinguish an existing object from a real failure");
  assert.equal((src.match(/upsert:\s*false/g) ?? []).length, 1, "the shared helper must explicitly use create-only storage");
});

check("app/media/actions.ts does not redeclare its own storage-path builder", () => {
  const src = codeOnly("app/media/actions.ts");
  assert.ok(!/\$\{cloneId\}\/\$\{type\}\/\$\{Date\.now\(\)\}/.test(src),
    "app/media/actions.ts must not reintroduce the old wall-clock storage-path template");
  assert.ok(src.includes("@/lib/media-storage-path"),
    "app/media/actions.ts must build paths through the shared, content-derived helper");
});

check("the bulk importers share the same helper instead of a hand-copied Date.now() one", () => {
  for (const file of ["scripts/import-media.ts", "scripts/import-video-media.ts", "scripts/import-videos.ts"]) {
    const src = codeOnly(file);
    assert.ok(!/\$\{cloneId\}\/(videos|\$\{type\})\/\$\{Date\.now\(\)\}/.test(src),
      `${file} must not build its own timestamp-prefixed storage path`);
    assert.ok(src.includes("@/lib/media-storage-path"), `${file} must import the shared storage-path helper`);
  }
});

console.log(`\nmedia storage paths: ${passed} checks passed`);
