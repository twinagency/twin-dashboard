// Guards for the bulk video importer (scripts/import-videos.ts).
//
// WHY THIS CHECK EXISTS, SPECIFICALLY:
// The importer writes money values and skips files. Two ways that goes wrong
// quietly, and both are asserted below:
//
//   * A PRICE THAT DID NOT COME FROM THE OPERATOR. Money is code-locked in this
//     project. The AI supplies tags; it must never supply a number. If
//     resolveVideoPrice ever invented a fallback, every other assertion here
//     would still pass and a creator's whole library would import mispriced.
//   * A DEDUP KEY THAT MISSES. The importer stores a .mov as .mp4 under a
//     timestamp prefix, so comparing raw filenames re-imports the entire
//     submission on the second run. Duplicate paid media is a real cost.
//
// It also pins VIDEO_MAX_BYTES to the dashboard's own constant. A cap that
// drifts from app/media/actions.ts is this repo's signature defect: the import
// succeeds and every one of those videos then fails to send.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VIDEO_MAX_BYTES,
  COMPRESSION_LADDER,
  isVideoFile,
  importedStem,
  localStem,
  importedStemVariants,
  alreadyImported,
  scaleFilter,
  validateManualPrice,
  resolveVideoPrice,
  pricingIsUsable,
  priceForDuration,
  PRICE_BAND_SHORT_SECONDS,
  PRICE_BAND_LONG_SECONDS,
} from "../lib/video-import";
import { MIN_PAID_MEDIA_PRICE_STARS } from "../lib/pricing";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// A complete, current guide and a stale one (the shape actually in production
// on 2026-09-09: every value below the 250 floor).
const GOOD_GUIDE = Object.fromEntries(
  ["sfw", "mirror_selfie", "outdoor", "pool", "bed", "shower", "solo", "bikini",
   "lingerie", "topless", "tits", "ass", "feet", "full_nude", "pussy", "anal"].map((k) => [k, 400]),
);
const STALE_GUIDE = { sfw: 15, bed: 25, ass: 55, full_nude: 90 };

check("the size cap matches the dashboard uploader's own constant", () => {
  const actions = readFileSync(resolve(root, "app/media/actions.ts"), "utf8");
  const m = actions.match(/const VIDEO_MAX_BYTES\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
  assert.ok(m, "could not find VIDEO_MAX_BYTES in app/media/actions.ts");
  assert.equal(VIDEO_MAX_BYTES, Number(m![1]) * 1024 * 1024,
    "importer cap drifted from the dashboard cap: imported videos would fail to send");
});

check("video extensions are recognised case-insensitively", () => {
  for (const f of ["a.mp4", "b.MOV", "c.mov", "d.M4V", "e.webm", "f.mkv", "g.avi"]) {
    assert.equal(isVideoFile(f), true, f);
  }
  for (const f of ["a.jpg", "b.HEIC", "c.txt", "noextension", "d.mp4.txt"]) {
    assert.equal(isVideoFile(f), false, f);
  }
});

check("a stored path dedups back to its original name", () => {
  // single timestamp (this importer)
  assert.equal(importedStem("uuid/videos/1787400991300-IMG_4314.mp4"), "img_4314");
  // double timestamp (the dashboard uploader's historical shape)
  assert.equal(importedStem("uuid/videos/1787400598782-1787357021548-IMG_6898.mp4"), "img_6898");
});

check("a .mov submitted twice is not imported twice after transcoding", () => {
  // The file arrives .MOV and is stored .mp4. If the key were extension-aware
  // the second run would re-import and re-charge for the whole submission.
  const stored = importedStem("uuid/videos/1787400875159-copy_9CF237F4-A00D-494C-8130-DF80E8B06586.mp4");
  const local = localStem("copy_9CF237F4-A00D-494C-8130-DF80E8B06586.MOV");
  assert.equal(stored, local);
});

check("an unrelated file is NOT treated as already imported", () => {
  assert.notEqual(
    importedStem("uuid/videos/1787400875159-IMG_6898.mp4"),
    localStem("IMG_6899.mov"),
  );
});

// REGRESSION, 2026-09-09. This exact case duplicated nine of Tru Kait's videos
// in production. A submission export names files 01-clip.MOV, 02-clip.MOV; the
// stored path is <timestamp>-01-clip.mp4; the old two-prefix strip ate the
// "01-" as if it were a second timestamp, so stored read "clip" while the local
// file read "01-clip" and nothing ever matched.
check("an export-prefixed file already imported is NOT imported again", () => {
  const stored = new Set(importedStemVariants(
    "uuid/videos/1788954582234-13-copy_1E1D3CF6-87D1-4A1D-93C1-05B710987B40.mp4"));
  assert.equal(alreadyImported(stored, "13-copy_1E1D3CF6-87D1-4A1D-93C1-05B710987B40.MOV"), true);
});

check("the plain and legacy double-timestamp shapes still dedup", () => {
  assert.equal(alreadyImported(new Set(importedStemVariants("uuid/videos/1787400991300-IMG_4314.mp4")), "IMG_4314.mov"), true);
  assert.equal(alreadyImported(new Set(importedStemVariants("uuid/videos/1787400598782-1787357021548-IMG_6898.mp4")), "IMG_6898.mov"), true);
});

check("a genuinely new file is still imported", () => {
  const stored = new Set([
    ...importedStemVariants("uuid/videos/1788954582234-13-copy_AAAA.mp4"),
    ...importedStemVariants("uuid/videos/1787400991300-IMG_4314.mp4"),
  ]);
  assert.equal(alreadyImported(stored, "14-copy_BBBB.MOV"), false);
  assert.equal(alreadyImported(stored, "IMG_4315.mov"), false);
});

check("an empty library imports everything", () => {
  assert.equal(alreadyImported(new Set<string>(), "01-anything.MOV"), false);
});

check("a manual price must be free or at or above the floor", () => {
  assert.equal(validateManualPrice(undefined), null);
  assert.equal(validateManualPrice("0"), 0);
  assert.equal(validateManualPrice(String(MIN_PAID_MEDIA_PRICE_STARS)), MIN_PAID_MEDIA_PRICE_STARS);
  assert.equal(validateManualPrice("2230"), 2230);
  for (const bad of ["1", "249", "-5", "abc", "12.5"]) {
    assert.throws(() => validateManualPrice(bad), /at least|0 \(free\)/, `should reject ${bad}`);
  }
});

check("the operator's typed price wins and never consults the guide", () => {
  // Stale guide on purpose: a manual price must not be blocked by it, and must
  // not be silently replaced by a guide lookup.
  const price = resolveVideoPrice(2230, { tags: ["ass", "solo"], nsfw: true }, STALE_GUIDE);
  assert.equal(price, 2230);
});

check("with no manual price, a stale guide REFUSES rather than guessing", () => {
  assert.throws(
    () => resolveVideoPrice(null, { tags: ["ass"], nsfw: true }, STALE_GUIDE),
    /missing or outdated/,
  );
  assert.throws(
    () => resolveVideoPrice(null, { tags: ["ass"], nsfw: true }, null),
    /missing or outdated/,
  );
});

check("with no manual price, a current guide supplies the number", () => {
  const price = resolveVideoPrice(null, { tags: ["ass"], nsfw: true }, GOOD_GUIDE);
  assert.equal(typeof price, "number");
  assert.ok(price >= MIN_PAID_MEDIA_PRICE_STARS, `guide-derived price ${price} is under the floor`);
});

check("the run refuses to start when nothing could price a file", () => {
  assert.equal(pricingIsUsable(null, STALE_GUIDE), false);
  assert.equal(pricingIsUsable(null, undefined), false);
  assert.equal(pricingIsUsable(2230, STALE_GUIDE), true);
  assert.equal(pricingIsUsable(null, GOOD_GUIDE), true);
});

check("a price band never escapes the operator's own min and max", () => {
  const min = 769, max = 1538;   // the $10-$20 band at STAR_USD 0.013
  for (const secs of [0, -5, 1, 9, 10, 11, 45, 119, 120, 121, 9999, NaN, Infinity]) {
    const p = priceForDuration(secs, min, max);
    assert.ok(p >= min && p <= max, `duration ${secs} priced ${p}, outside ${min}-${max}`);
  }
});

check("a longer clip never costs less than a shorter one", () => {
  const min = 769, max = 1538;
  let prev = 0;
  for (const secs of [5, 10, 20, 40, 60, 90, 120, 300]) {
    const p = priceForDuration(secs, min, max);
    assert.ok(p >= prev, `price went down at ${secs}s: ${p} after ${prev}`);
    prev = p;
  }
});

check("the band ends are honoured exactly at the anchors", () => {
  const min = 769, max = 1538;
  assert.equal(priceForDuration(PRICE_BAND_SHORT_SECONDS, min, max), min);
  assert.equal(priceForDuration(PRICE_BAND_LONG_SECONDS, min, max), max);
  // An unreadable duration must price at the floor, never the ceiling.
  assert.equal(priceForDuration(0, min, max), min);
});

check("a single-value band is legal and always returns that value", () => {
  for (const secs of [1, 30, 600]) assert.equal(priceForDuration(secs, 800, 800), 800);
});

check("an inverted band is refused rather than silently swapped", () => {
  assert.throws(() => priceForDuration(30, 1538, 769), /below min/);
});

check("every ladder step forces even dimensions for H.264", () => {
  for (const step of COMPRESSION_LADDER) {
    assert.match(scaleFilter(step.scale), /trunc\(iw\/2\)\*2:trunc\(ih\/2\)\*2/);
  }
});

check("the ladder only ever gets harder, never easier", () => {
  for (let i = 1; i < COMPRESSION_LADDER.length; i++) {
    const prev = COMPRESSION_LADDER[i - 1];
    const cur = COMPRESSION_LADDER[i];
    assert.ok(cur.crf >= prev.crf, `crf went backwards at step ${i}`);
    if (prev.scale !== null && cur.scale !== null) {
      assert.ok(cur.scale <= prev.scale, `resolution went up at step ${i}`);
    }
  }
  // The first step must not downscale: a file barely over the cap should lose
  // quality, not resolution.
  assert.equal(COMPRESSION_LADDER[0].scale, null);
});

console.log(`\nvideo import: ${passed} checks passed`);
