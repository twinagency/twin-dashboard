// KNOWN RED (W1 lane 7b F16, found by the H3 holds test; REVIEW.md inv 7 "Stale work: a 409 is shown"): Preparation.tsx:60 shows a
// refusal with `setNotice(body.error)` and then `await read()`, whose success path runs `setNotice("")` (:39), so the refusal is erased as
// soon as the status read answers. The operator sees the form unchanged and no reason. Fixed (copy not pinned: backend text or a status/alert saying refused/changed/not saved…) = the refusal stays visible after the read.
// The read answers one render later here, as a real network read does. Team's Claude owns the fix.
// Not wired into npm scripts; init.sh does not run it yet. Offline: jsdom, global fetch stubbed, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { openPreparation, pageText, refusalShown, preparationConfigured, preparationRead, savePreparationLimits, settle, stubFetch } from "../helpers/w1-7b-dom";

async function save(answer: () => Response) {
  const stub = stubFetch({ read: () => preparationRead(preparationConfigured("fixture")), post: answer, holdReadsAfter: 1 });
  await openPreparation(stub);
  await savePreparationLimits();
  stub.release();
  await settle();
  assert.equal(stub.posts.length, 1);
}

test("control: an unconfirmed outcome stays visible", async () => {
  await save(() => Response.json({ ok: false, outcome: "unconfirmed" }, { status: 502 }));
  assert.match(pageText(), /unconfirmed/i);
});

test("F16: a 409 refusal is still shown after the status read answers", async () => {
  await save(() => Response.json({ ok: false, error: "Preparation changed. Refresh before saving." }, { status: 409 }));
  const { shown, seen } = refusalShown(document.body, "Preparation changed. Refresh before saving."); // copy not pinned
  assert.equal(shown, true, `the refusal must stay visible after the status read; ${seen}`);
});
