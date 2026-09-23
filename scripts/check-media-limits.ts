// ── Checks for the photo upload gate ─────────────────────────────────────────
// Run:  npm run test:media
//
// THE CHECK THAT MATTERS: a photo Telegram would refuse must not be able to
// enter the media library. Everything else here is hygiene around that.
//
// The bug this exists for (BACKLOG, 2026-08-08): photo
// 09e900dd-3b7c-4e69-a51c-670f7316fff0 at 2800 stars was accepted by the
// upload path, which checked bytes only, and then rejected by Telegram on
// every send with "Bad Request: PHOTO_INVALID_DIMENSIONS". The send fails safe
// (nothing delivered, nothing charged) but the item was unsellable and the fan
// got nothing, ten times to one fan alone.
//
// So this asserts three separate things, because any one of them alone is
// weak: the rules themselves, the real function on real image bytes, and the
// fact that every upload path actually calls it before it writes anything.

import { readFileSync } from "node:fs";
import sharp from "sharp";
import {
  checkPhotoBytes,
  checkPhotoDimensions,
  PHOTO_LIMITS_HINT,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_DIMENSION_RATIO,
  PHOTO_MAX_TOTAL_DIMENSION,
} from "../lib/telegram-limits";
import { assertPhotoSendable } from "../lib/photo-guard";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        passed++;
      },
      (e) => {
        failures.push(`${name}\n      ${e instanceof Error ? e.message : String(e)}`);
      },
    );
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, what: string): void {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function sourceCode(p: string | URL): string {
  return readFileSync(p, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
// The body of one top-level function, so "the check happens BEFORE the write"
// can be asserted per upload path rather than anywhere in the file.
function functionBody(src: string, decl: string): string {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error(`no such function: ${decl}`);
  const rest = src.slice(start + decl.length);
  const end = rest.search(/\nexport (async )?function |\nfunction /);
  return end < 0 ? rest : rest.slice(0, end);
}
async function jpegOf(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 90 } } })
    .jpeg({ quality: 70 })
    .toBuffer();
}
function rejection(width: number, height: number): { reason: string; message: string } {
  const v = checkPhotoDimensions(width, height);
  if (v.ok) throw new Error(`${width}x${height} was ACCEPTED, Telegram would refuse it`);
  return { reason: v.reason, message: v.message };
}

const tests: Promise<void>[] = [];

// ── the rules ────────────────────────────────────────────────────────────────

tests.push(check("M1 the limits are Telegram's published numbers", () => {
  // Bot API, sendPhoto: "The photo must be at most 10 MB in size. The photo's
  // width and height must not exceed 10000 in total. Width and height ratio
  // must be at most 20."  https://core.telegram.org/bots/api#sendphoto
  // If one of these ever changes, it changes HERE and nowhere else, which is
  // the whole reason the numbers are constants.
  eq(PHOTO_MAX_TOTAL_DIMENSION, 10000, "total width+height ceiling");
  eq(PHOTO_MAX_DIMENSION_RATIO, 20, "width/height ratio ceiling");
  assert(PHOTO_MAX_BYTES < 10 * 1024 * 1024, "the byte ceiling must stay under Telegram's 10 MB");
}));

tests.push(check("M2 an ordinary photo is accepted", () => {
  // The shape of the replacement asset now sitting at the bad photo's path.
  const v = checkPhotoDimensions(2560, 1707);
  assert(v.ok, "a 2560x1707 photo must be sendable");
  const portrait = checkPhotoDimensions(1080, 1920);
  assert(portrait.ok, "a normal portrait photo must be sendable");
}));

tests.push(check("M3 width plus height over 10000 is refused", () => {
  // Ratio 7.5:1, well inside the ratio rule, so only the total rule can catch
  // it. A guard that only checked the ratio would pass this.
  eq(rejection(9000, 1200).reason, "total", "9000x1200 (sum 10200) must fail on the total rule");
  eq(rejection(6000, 6000).reason, "total", "6000x6000 (sum 12000) must fail on the total rule");
}));

tests.push(check("M4 a shape over 20 to 1 is refused", () => {
  // Sum 4150, far inside the total rule, so only the ratio rule can catch it.
  eq(rejection(4000, 150).reason, "ratio", "4000x150 (26.7 to 1) must fail on the ratio rule");
  eq(rejection(150, 4000).reason, "ratio", "the ratio rule must not care which side is longer");
}));

tests.push(check("M5 both ceilings are inclusive, as Telegram words them", () => {
  // "must not exceed 10000" and "at most 20", so exactly at the limit is legal.
  // Off-by-one here would reject perfectly sendable photos, which is its own
  // kind of money bug: an item the operator can never upload.
  assert(checkPhotoDimensions(9000, 1000).ok, "exactly 10000 in total must be accepted");
  eq(rejection(9001, 1000).reason, "total", "10001 in total must be refused");
  assert(checkPhotoDimensions(4000, 200).ok, "exactly 20 to 1 must be accepted");
  eq(rejection(4020, 200).reason, "ratio", "20.1 to 1 must be refused");
}));

tests.push(check("M6 unmeasurable dimensions are a refusal, not a pass", () => {
  // The dangerous default. If sharp cannot read the image, "no dimensions"
  // must not read as "no problem", or the guard opens itself back up on
  // exactly the files it understands least.
  for (const [w, h] of [[0, 100], [100, 0], [undefined, 100], [100, undefined], [NaN, 100], [-5, 100]] as const) {
    const v = checkPhotoDimensions(w as number, h as number);
    assert(!v.ok, `${String(w)}x${String(h)} must be refused`);
    if (!v.ok) eq(v.reason, "unreadable", `${String(w)}x${String(h)} reason`);
  }
}));

tests.push(check("M7 the refusal tells the operator why and what the limit is", () => {
  const total = rejection(9000, 1200);
  const ratio = rejection(4000, 150);
  for (const r of [total, ratio]) {
    assert(r.message.includes("PHOTO_INVALID_DIMENSIONS"), "the message must name Telegram's own error");
    assert(/charged nothing/.test(r.message), "the message must say the fan is charged nothing");
    assert(!r.message.includes("—"), "no em dashes in UI copy (dashboard/CLAUDE.md)");
  }
  assert(total.message.includes("9000 x 1200"), "the message must quote the photo's own size");
  assert(total.message.includes("10200"), "the message must quote the photo's own total");
  assert(total.message.includes(String(PHOTO_MAX_TOTAL_DIMENSION)), "the message must quote the limit");
  assert(ratio.message.includes("4000 x 150"), "the message must quote the photo's own size");
  assert(ratio.message.includes("26.7"), "the message must quote the photo's own ratio");
  assert(ratio.message.includes(String(PHOTO_MAX_DIMENSION_RATIO)), "the message must quote the limit");
  assert(
    PHOTO_LIMITS_HINT.includes(String(PHOTO_MAX_TOTAL_DIMENSION)) && PHOTO_LIMITS_HINT.includes(String(PHOTO_MAX_DIMENSION_RATIO)),
    "the upload hint must be rendered from the same constants",
  );
}));

tests.push(check("M8 the byte ceiling still bites", () => {
  assert(checkPhotoBytes(PHOTO_MAX_BYTES).ok, "exactly at the ceiling is fine");
  const over = checkPhotoBytes(PHOTO_MAX_BYTES + 1);
  assert(!over.ok, "one byte over must be refused");
  if (!over.ok) assert(over.message.includes("10 MB"), "the message must quote Telegram's limit");
}));

// ── the real function, on real image bytes ───────────────────────────────────

tests.push(check("M9 assertPhotoSendable refuses real oversized image bytes", async () => {
  // Not the pure helper: the actual function app/media/actions.ts calls, fed
  // actual JPEGs, so a broken sharp call or a swallowed metadata error shows up.
  const wide = await jpegOf(4000, 150);
  let threw = "";
  try {
    await assertPhotoSendable(wide);
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  assert(threw, "a real 4000x150 JPEG must be refused by the gate");
  assert(threw.includes("PHOTO_INVALID_DIMENSIONS"), `wrong message: ${threw}`);

  const tall = await jpegOf(300, 9900);
  let threw2 = "";
  try {
    await assertPhotoSendable(tall);
  } catch (e) {
    threw2 = e instanceof Error ? e.message : String(e);
  }
  assert(threw2, "a real 300x9900 JPEG (10200 total) must be refused by the gate");
}));

tests.push(check("M10 assertPhotoSendable passes a real sendable photo and reports its size", async () => {
  const ok = await jpegOf(1200, 800);
  const dims = await assertPhotoSendable(ok);
  eq(dims.width, 1200, "measured width");
  eq(dims.height, 800, "measured height");
}));

tests.push(check("M11 assertPhotoSendable refuses bytes it cannot decode", async () => {
  // A .jpg that is not an image at all must not slip through as "no dimensions
  // read, therefore fine".
  let threw = "";
  try {
    await assertPhotoSendable(Buffer.from("this is not an image, it is a text file"));
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  assert(threw, "undecodable bytes must be refused");
  assert(/width and height/.test(threw), `wrong message: ${threw}`);
}));

// ── every upload path actually uses it ───────────────────────────────────────

tests.push(check("M12 every photo upload path gates BEFORE it writes anything", () => {
  // A gate that one path skips is not a gate. This is the check that would have
  // caught the original defect, and it is deliberately per-path rather than
  // "the file mentions the guard somewhere".
  const paths: [string, string][] = [
    ["../app/media/actions.ts", "export async function uploadPhoto"],
    ["../app/media/actions.ts", "export async function addBundleItem"],
  ];
  for (const [file, decl] of paths) {
    const body = functionBody(sourceCode(new URL(file, import.meta.url)), decl);
    // Upload actions may call the strict guard directly, or pass through the
    // normalizer which resizes first and then invokes that same strict guard.
    const directGate = body.indexOf("assertPhotoSendable");
    const normalizedGate = body.indexOf("preparePhotoForTelegram");
    const gate = [directGate, normalizedGate].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? -1;
    const write = body.indexOf(".upload(");
    assert(gate >= 0, `${decl} does not validate or normalize the photo`);
    assert(write >= 0, `${decl} no longer uploads, this check needs rewriting`);
    assert(gate < write, `${decl} uploads the file before checking it, so a refused photo still lands in storage`);
    const insert = body.indexOf(".insert(");
    assert(insert < 0 || gate < insert, `${decl} inserts the row before checking the photo`);
  }
}));

tests.push(check("M13 the bulk importer uses the same gate, not its own copy", () => {
  // import-media.ts mirrors the server actions by hand, which is exactly how a
  // second, laxer set of limits gets born.
  const src = sourceCode(new URL("../scripts/import-media.ts", import.meta.url));
  eq((src.match(/assertPhotoSendable\(/g) ?? []).length, 2, "singles and bundle items must both be gated");
  assert(
    !/PHOTO_MAX_BYTES\s*=/.test(src),
    "the importer must import the limits, not redeclare them",
  );
  const gate = src.indexOf("assertPhotoSendable(");
  const write = src.indexOf(".upload(");
  assert(gate < write, "the importer must check before it uploads");
}));

tests.push(check("M14 the browser pre-flight shares the rules and is not the only gate", () => {
  const ui = sourceCode(new URL("../app/media/MediaManager.tsx", import.meta.url));
  assert(
    /import\s*\{[^}]*checkPhotoDimensions[^}]*\}\s*from\s*"@\/lib\/telegram-limits"/.test(ui),
    "the upload UI must check with the shared rules, not numbers of its own",
  );
  // Both browser entry points for a photo: the single-photo queue and the
  // bundle "+" button. The bundle one had no check of any kind before.
  eq((ui.match(/measurePhoto\(/g) ?? []).length, 3, "measurePhoto must be defined and used by both add paths");
  // And the client must not be trusted: the server action still gates.
  const server = sourceCode(new URL("../app/media/actions.ts", import.meta.url));
  const preparation = sourceCode(new URL("../lib/photo-prepare.ts", import.meta.url));
  assert(server.includes("preparePhotoForTelegram"), "the server action must normalize regardless of the browser check");
  assert(preparation.includes("assertPhotoSendable"), "the server normalizer must still enforce the Telegram guard");
}));

// ─────────────────────────────────────────────────────────────────────────────

Promise.all(tests).then(() => {
  const total = passed + failures.length;
  if (failures.length) {
    console.error(`\n  ${failures.length} of ${total} CHECKS FAILED\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    process.exit(1);
  }
  console.log(`\n  ALL ${total} CHECKS PASSED\n`);
});
