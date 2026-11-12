// KNOWN RED (REVIEW inv 7 money "manual prices only"; W6-app-media-2-plus6 finding 1, HIGH).
// app/media/actions.ts:390,419: updatePhoto/updateVideo write Number(fd.get("star_value") ?? 25|50) with no
// isAllowedPaidOrFreePrice check, unlike upload (:216) and bulk (:528). 1-249 Stars is stored; an emptied price box gives
// Number("") = 0 and :398 turns the paid item FREE; a missing field invents 25/50, both under the 250 floor (lib/pricing.ts:88).
// Condition: an admin or managing agency user saves the edit form with the price cleared or below 250, or a direct call.
// Harness: real updatePhoto/updateVideo/bulkSetMediaPrice, DB faked at the wire (./W6-app-media-2-plus6-harness.ts).
// Run: nice -n 10 node --import tsx --test tests/known-red/W6-app-media-2-plus6-edit-price-floor.test.ts
// Team's Claude owns the fixes. Not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { actions, CLONE, isRest, onWire, wire } from "./W6-app-media-2-plus6-harness";

const ID = "11111111-1111-1111-1111-111111111111";
const form = (fields: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, v); return fd; };
const patches = (table: string) => wire.filter((call) => isRest(call, table, "PATCH")).map((call) => call.body as Record<string, unknown>);

/** Run an edit; return the PATCH body it wrote, or "refused" when it threw before writing a price. */
async function edit(kind: "photo" | "video", fields: Record<string, string>): Promise<Record<string, unknown> | "refused"> {
  onWire(() => undefined);
  const table = kind === "photo" ? "photos" : "videos";
  try {
    await (kind === "photo" ? actions.updatePhoto : actions.updateVideo)(CLONE, ID, form(fields));
  } catch {
    if (!patches(table).length) return "refused";
  }
  const written = patches(table);
  assert.equal(written.length, 1, "one PATCH per edit");
  return written[0];
}

test("control: a valid manual edit price (300) is written as given, item stays paid", async () => {
  const photo = await edit("photo", { star_value: "300", caption: "c" });
  assert.notEqual(photo, "refused");
  assert.equal((photo as Record<string, unknown>).star_value, 300);
  assert.notEqual((photo as Record<string, unknown>).is_free, true);
});

test("control: the bulk path already refuses a 1-Star price (the guard the edit path lacks)", async () => {
  onWire(() => undefined);
  await assert.rejects(actions.bulkSetMediaPrice(CLONE, "photos", [ID], 1), /at least 250/);
  assert.equal(patches("photos").length, 0);
});

test("HIGH: an edit below the 250-Star floor is refused, never stored (photo and video)", async () => {
  const wrote: string[] = [];
  for (const kind of ["photo", "video"] as const) {
    const written = await edit(kind, { star_value: "1" });
    if (written !== "refused") wrote.push(`${kind}: ${JSON.stringify(written)}`);
  }
  assert.deepEqual(wrote, [], "edits stored a 1-Star price");
});

test("HIGH: clearing the price box does not silently make a paid item free", async () => {
  const written = await edit("photo", { star_value: "" });
  assert.ok(written === "refused" || (written.is_free !== true && written.star_value !== 0),
    `an emptied price box wrote ${JSON.stringify(written)}`);
});

test("HIGH: a missing price is refused, never defaulted to an invented 25/50", async () => {
  const wrote: string[] = [];
  for (const kind of ["photo", "video"] as const) {
    const written = await edit(kind, { caption: "only a caption" });
    if (written !== "refused" && Object.hasOwn(written, "star_value")) wrote.push(`${kind}: ${JSON.stringify(written)}`);
  }
  assert.deepEqual(wrote, [], "edits with no star_value invented a price");
});
