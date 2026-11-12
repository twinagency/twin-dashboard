/**
 * Known red (W6 app-posting-plus3 H3, money / ownership): `createSequence` (app/sequences/actions.ts:150-183) gives an
 * ungrouped source video a fresh content_family_id with `await supabaseAdmin.from("videos").update(...)` (:168) and
 * never reads the result. If that update fails, the sequence is still inserted with a family id the video does not
 * carry, so owning the full recording no longer blocks buying its clips ("Owning it blocks its clips being resold",
 * app/sequences/page.tsx:83). The update is also not conditioned on content_family_id IS NULL (the agency proxy is,
 * lib/agency-sequence.ts:202-204), so two concurrent creates leave the first sequence on an orphan family.
 * Condition: internal admin creates a sequence from a video with no family while the videos PATCH errors (transient
 * PostgREST/network error) or races a second create.
 * Control: when the PATCH succeeds the sequence carries the same family id. Turns green when a failed family update
 * stops the create (throws, no video_sequences insert). Fake at the wire, offline.
 * Run: nice -n 10 node --import tsx --test tests/known-red/W6-app-posting-plus3-family-update-ignored.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE, loadSequenceActions, type Call } from "./W6-app-posting-plus3-harness";

const VIDEO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
function harness(patchStatus: number) {
  return loadSequenceActions((call: Call) => {
    if (call.table === "videos" && call.method === "GET") return { status: 200, json: [{ id: VIDEO, clone_id: CLONE, content_family_id: null }] };
    if (call.table === "videos" && call.method === "PATCH") {
      return patchStatus < 300 ? { status: patchStatus } : { status: patchStatus, json: { message: "upstream timeout" } };
    }
    if (call.table === "video_sequences" && call.method === "POST") return { status: 201, json: [{ id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }] };
    if (call.table === "video_sequence_revisions" && call.method === "POST") return { status: 201 };
    throw new Error(`unexpected ${call.method} ${call.table}`);
  });
}
const form = () => { const f = new FormData(); f.set("title", "Shower"); f.set("sourceVideoId", VIDEO); return f; };

test("control: the sequence and the source video get the same content family", async () => {
  const { actions, wire } = harness(204);
  await actions.createSequence(CLONE, form());
  const family = (wire.find((c) => c.table === "videos" && c.method === "PATCH")!.body as { content_family_id: string }).content_family_id;
  const seq = wire.find((c) => c.table === "video_sequences" && c.method === "POST")!.body as { content_family_id: string };
  assert.equal(seq.content_family_id, family);
});

test("HIGH: a failed family update on the source video stops the create (no sequence on an orphan family)", async () => {
  const { actions, wire } = harness(503);
  await assert.rejects(actions.createSequence(CLONE, form()));
  assert.equal(wire.filter((c) => c.table === "video_sequences" && c.method === "POST").length, 0,
    "a sequence whose family the video does not carry lets a full-video owner buy its clips");
});
