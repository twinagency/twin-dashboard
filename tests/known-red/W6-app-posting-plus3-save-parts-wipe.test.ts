/**
 * Known red (W6 app-posting-plus3 H2, data loss): `saveSequenceParts` (app/sequences/actions.ts:186-225) DELETEs every
 * part of the revision (:204) and only then INSERTs the new list (:220), two separate requests. `parsePartDrafts`
 * (:117-147) lets through what migration 147 refuses (price_stars 0 or negative, end <= start, negative start,
 * duplicate positions: twin-bot db/migrations/147_video_sequences.sql:111-128), so the INSERT fails after the DELETE
 * committed and the saved clip list is gone. Any other INSERT failure (timeout, 5xx) does the same.
 * Condition: an operator saves a draft or review_required revision with a 0 price, a reversed range or a duplicate
 * position (or the insert fails for any reason). The stored manifest is empty afterwards; only the open tab still has
 * it.
 * Control: a valid save replaces the list. Turns green when a failing save leaves the stored parts untouched
 * (validate before writing and/or replace in one transaction/RPC). Fake at the wire, offline.
 * Run: nice -n 10 node --import tsx --test tests/known-red/W6-app-posting-plus3-save-parts-wipe.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE, REVISION, loadSequenceActions, type Call } from "./W6-app-posting-plus3-harness";

type Part = { position: number; price_stars: number | null; source_start_seconds: number; source_end_seconds: number };
const STORED: Part[] = [
  { position: 0, price_stars: null, source_start_seconds: 0, source_end_seconds: 10 },
  { position: 1, price_stars: 50, source_start_seconds: 10, source_end_seconds: 40 },
];

function harness() {
  let parts: Part[] = STORED.map((p) => ({ ...p }));
  const { actions, wire } = loadSequenceActions((call: Call) => {
    if (call.table === "video_sequence_revisions" && call.method === "GET") {
      return { status: 200, json: [{ id: REVISION, sequence_id: "s1", revision_no: 1, state: "draft", approved_by: null,
        approved_at: null, video_sequences: { clone_id: CLONE, source_video_id: null } }] };
    }
    if (call.table === "video_sequence_parts" && call.method === "DELETE") { parts = []; return { status: 204 }; }
    if (call.table === "video_sequence_parts" && call.method === "POST") {
      const rows = call.body as Part[];
      // migration 147 CHECKs, as the database would apply them
      const bad = rows.some((r) => (r.price_stars !== null && r.price_stars <= 0) || r.source_end_seconds <= r.source_start_seconds)
        || new Set(rows.map((r) => r.position)).size !== rows.length;
      if (bad) return { status: 400, json: { code: "23514", message: "new row violates check constraint" } };
      // unique (revision_id, position): an INSERT never replaces rows the DELETE left behind
      if (rows.some((r) => parts.some((p) => p.position === r.position))) {
        return { status: 409, json: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      parts = [...parts, ...rows.map((r) => ({ ...r }))];
      return { status: 201 };
    }
    throw new Error(`unexpected ${call.method} ${call.table}`);
  });
  return { actions, wire, stored: () => parts };
}
const fd = (list: readonly unknown[]) => { const f = new FormData(); f.set("parts", JSON.stringify(list)); return f; };
const clip = (position: number, priceStars: number | null, start: number, end: number) =>
  ({ position, isPreview: position === 0, caption: null, priceStars, sourceStartSeconds: start, sourceEndSeconds: end, requiresPosition: null });

test("control: a valid save replaces the stored clip list", async () => {
  const h = harness();
  await h.actions.saveSequenceParts(CLONE, REVISION, fd([clip(0, null, 0, 5), clip(1, 30, 5, 20)]));
  assert.deepEqual(h.stored().map((p) => p.source_end_seconds), [5, 20]);
});

for (const [name, list] of [
  ["a 0-Star price", [clip(0, null, 0, 5), clip(1, 0, 5, 20)]],
  ["a reversed time range", [clip(0, null, 0, 5), clip(1, 30, 20, 5)]],
  ["a duplicate position", [clip(0, null, 0, 5), clip(1, 30, 5, 20), clip(1, 40, 20, 30)]],
] as const) {
  test(`HIGH: a save the database refuses (${name}) leaves the stored clips intact`, async () => {
    const h = harness();
    await assert.rejects(h.actions.saveSequenceParts(CLONE, REVISION, fd(list)));
    assert.deepEqual(h.stored(), STORED, "the previous manifest must survive a refused save");
  });
}
