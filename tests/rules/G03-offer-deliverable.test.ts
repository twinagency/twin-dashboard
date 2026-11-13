/**
 * R2 FL5: an offer part is shown only with terms the backend could deliver, the same rules it enforces before any send:
 * a catalogue item (approval.py:146 compares catalog_item_id with the verified item), 1..35 unique media
 * (twin-onlyfans-backend service/onlyfans_runtime/media_delivery.py:15,23,25) and previews that are unique, inside the media and
 * not all of it (media_delivery.py:63-64). A blank caption is not refused: the provider accepts blank text with media (fans_api_adapter/protocol.py:253).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanCDraft } from "../../lib/onlyfans/plan-c";
import { MOCK_ACCOUNT, seedOffer } from "./plan-c-fixtures";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`);
const offer = (extra: Record<string, unknown>) => { const raw = seedOffer(); Object.assign(raw.parts[1], extra); return parsePlanCDraft(raw, MOCK_ACCOUNT); };

test("control: 35 unique media with a preview subset parse, and so does a blank caption", () => {
  assert.ok(offer({ media_ids: ids(35), preview_ids: ["m1", "m2"] }));
  assert.ok(offer({ media_ids: [1, 2], preview_ids: [2] }), "integer ids as the backend stores them");
  assert.ok(offer({ body: "" }));
});

test("FL5: an offer with no catalogue item is refused", () => {
  assert.equal(offer({ catalog_item_id: null }), null);
});

test("FL5: an offer with 0 or 36 media, or a repeated media id, is refused", () => {
  for (const media_ids of [[], ids(36), ["m1", "m1"], [1, "1"]]) assert.equal(offer({ media_ids }), null, JSON.stringify(media_ids));
});

test("FL5: previews that repeat, fall outside the media or cover all of it are refused", () => {
  for (const [media_ids, preview_ids] of [[ids(3), ["m1", "m1"]], [ids(2), ["m3"]], [ids(2), ["m1", "m2"]], [ids(1), ["m1"]]])
    assert.equal(offer({ media_ids, preview_ids }), null, JSON.stringify({ media_ids, preview_ids }));
});
