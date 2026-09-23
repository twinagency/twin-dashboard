import assert from "node:assert/strict";
import sharp from "sharp";
import { preparePhotoForTelegram } from "../lib/photo-prepare";
import { checkPhotoBytes, checkPhotoDimensions } from "../lib/telegram-limits";

async function main() {
  const oversized = await sharp({
    create: { width: 7000, height: 5000, channels: 3, background: "#d15b8f" },
  }).png().toBuffer();

  const prepared = await preparePhotoForTelegram(oversized);
  const metadata = await sharp(prepared).metadata();

  assert.equal(checkPhotoBytes(prepared.byteLength).ok, true);
  assert.equal(checkPhotoDimensions(metadata.width, metadata.height).ok, true);
  assert.equal(prepared.subarray(0, 2).toString("hex"), "ffd8", "prepared media must be JPEG");

  console.log("photo preparation checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
