// Operator corrections must be authoritative for what the bots consume (visual_facts), with no auto-approval.
// Pure: no network, no database. The V2 matcher logic is a copy in scripts/fixtures/v2-evidence.ts.
// Run: npm run test:media
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyFactEdit, completeReviewUpdate } from "../lib/media-analysis-row";
import { FACT_KEYS } from "../lib/media-analysis-contract";
import { evidenceOf, v2Matches } from "./fixtures/v2-evidence";

const NOW = "2026-10-12T01:00:00.000Z";
const allNo = Object.fromEntries(FACT_KEYS.map((k) => [k, "no"]));
const facts = (ev: Record<string, string> = {}, visible: string[] = ["black bikini top", "bedroom"]) =>
  ({ v: 2, evidence: { ...allNo, ...ev }, visible });
const stored = (over: Record<string, unknown> = {}) => ({
  caption: null, tags: ["solo", "topless", "tits", "bed"], auto_desc: "topless woman on bed", visual_description: "A woman lies topless on a bed.",
  explicitness: "explicit", is_nude: true, nsfw: true, analysis_status: "analysed",
  visual_facts: facts({ nipples: "yes", suggestive_pose: "yes" }, ["bare breasts", "white bed"]), ...over,
});
// What updatePhoto would hand to the write: the form's unchanged values + the operator's change.
const form = (row: ReturnType<typeof stored>, over: Record<string, unknown>) => ({
  caption: row.caption, tags: row.tags, auto_desc: row.auto_desc, visual_description: row.visual_description,
  explicitness: row.explicitness, is_nude: row.is_nude, star_value: 500, is_free: false, image_name: "x", ...over,
});
const edit = (row: ReturnType<typeof stored>, over: Record<string, unknown>) => {
  const update = form(row, over) as Record<string, unknown>;
  applyFactEdit(row as unknown as Record<string, unknown>, update, NOW);
  return update;
};
const after = (row: ReturnType<typeof stored>, update: Record<string, unknown>) => ({ ...row, ...update });
const ev = (u: Record<string, unknown>) => {
  assert.ok(u.visual_facts, "the correction must write visual_facts (the bots read it); the edit left them untouched");
  return (u.visual_facts as { evidence: Record<string, string> }).evidence;
};

// ---- 1. removing the topless/tits tags: V2 must stop matching nipples ----
{
  const row = stored();
  assert.equal(v2Matches(row, "topless"), true, "precondition: V2 matches the uncorrected row");
  const u = edit(row, { tags: ["solo", "bed"] });
  const next = after(row, u);
  assert.equal(ev(u).nipples, "no", "tags removed -> the fact key is no");
  assert.equal(v2Matches(next, "topless"), false, "V2 no longer offers it as topless");
  assert.equal(v2Matches(next, "nipples"), false);
  assert.equal(v2Matches(next, "boobs"), false);
  assert.doesNotMatch(evidenceOf(next).text, /bare breasts/, "the visible phrase that claims it is dropped too");
  assert.equal((u.visual_facts as { edited?: boolean }).edited, true);
  assert.equal((u.visual_facts as { edited_at?: string }).edited_at, NOW);
  assert.equal(u.metadata_edited_at, NOW);
  assert.equal("analysis_status" in u, false, "an edit never writes analysis_status");
  assert.equal(ev(u).suggestive_pose, "yes", "unrelated keys are untouched");
}

// ---- 2. the description says nipples are not visible ----
{
  const row = stored();
  const u = edit(row, { visual_description: "A woman lies on a bed. Her nipples are not visible.", auto_desc: "woman on bed" });
  assert.equal(ev(u).nipples, "no");
  assert.equal(v2Matches(after(row, u), "topless"), false);
  // a description that merely changes wording but still affirms nothing negated leaves the facts alone
  const w = edit(row, { visual_description: "A woman lies on a large white bed." });
  assert.equal(ev(w).nipples, "yes", "rewording is not a denial");
  assert.equal((w.visual_facts as { edited?: boolean }).edited, true, "but the row is marked as hand-edited");
}

// ---- 3. one of two tags removed: the other still speaks for the key ----
{
  const row = stored();
  assert.equal(ev(edit(row, { tags: ["solo", "tits", "bed"] })).nipples, "yes");
}

// ---- 4. tags added -> yes; is_nude=false denies nudity keys ----
{
  const row = stored({ tags: ["solo"], visual_facts: facts({ lingerie: "no" }) });
  const u = edit(row, { tags: ["solo", "lingerie"] });
  assert.equal(ev(u).lingerie, "yes");
  const n = stored({ visual_facts: facts({ nipples: "yes", bare_buttocks: "yes", full_nudity: "yes" }) });
  const un = edit(n, { is_nude: false });
  assert.deepEqual([ev(un).nipples, ev(un).bare_buttocks, ev(un).full_nudity], ["no", "no", "no"]);
}

// ---- 5. price / free / name edits and an unchanged re-save touch nothing ----
{
  const row = stored();
  for (const over of [{}, { star_value: 900 }, { is_free: true }, { image_name: "renamed" }]) {
    const u = edit(row, over);
    assert.equal("visual_facts" in u, false, `no facts write for ${JSON.stringify(over)}`);
    assert.equal("metadata_edited_at" in u, false);
    assert.equal("analysis_status" in u, false);
  }
}

// ---- 6. needs_review stays needs_review until completeReview ----
{
  const row = stored({ analysis_status: "needs_review", visual_facts: facts({ nipples: "yes", genitals: "unclear" }) });
  const u = edit(row, { tags: ["solo", "bed"] });
  assert.equal("analysis_status" in u, false);
  assert.equal(evidenceOf(after(row, u)).trusted, false, "V2 still ignores the row");
  // the explicit action
  const done = completeReviewUpdate(after(row, u) as unknown as Record<string, unknown>, NOW);
  assert.equal(done.analysis_status, "analysed");
  assert.equal(done.analysis_error, null);
  assert.equal(done.metadata_edited_at, NOW);
  const f = done.visual_facts as { reviewed: boolean; reviewed_at: string; evidence: Record<string, string> };
  assert.equal(f.reviewed, true);
  assert.equal(f.reviewed_at, NOW);
  assert.equal(f.evidence.nipples, "no", "corrected facts survive the approval");
  const final = { ...after(row, u), ...done };
  assert.equal(evidenceOf(final).trusted, true);
  assert.equal(v2Matches(final, "topless"), false, "after review the corrected row no longer matches the removed attribute");
  // only needs_review rows can be completed
  for (const st of ["analysed", "failed", "pending", "legacy", null]) {
    assert.throws(() => completeReviewUpdate({ analysis_status: st, visual_facts: facts() }, NOW), /needs review/i, String(st));
  }
  assert.throws(() => completeReviewUpdate({ analysis_status: "needs_review", visual_facts: null }, NOW), /no analysis facts/i);
}

// ---- 7. legacy rows (visual_facts null) are null-safe ----
{
  const legacy = stored({ visual_facts: null, analysis_status: "legacy" });
  const u = edit(legacy, { tags: ["solo"] });
  assert.equal("visual_facts" in u, false);
  assert.equal(u.metadata_edited_at, NOW);
  assert.equal(applyFactEdit(null, { tags: [] }, NOW), undefined);
}

// ---- 8. wiring: the action reads facts + status, and exposes the explicit review action ----
{
  const actions = readFileSync(new URL("../app/media/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /export async function completeReview\(/);
  assert.match(actions, /visual_facts, analysis_status/, "the pre-edit read includes the facts and status");
  const upd = actions.slice(actions.indexOf("export async function updatePhoto"), actions.indexOf("export async function completeReview"));
  assert.doesNotMatch(upd, /analysis_status/, "updatePhoto/updateVideo never write the status");
  const ui = readFileSync(new URL("../app/media/MediaManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /completeReview/, "the manager offers the review action");
}

console.log("Media correction checks passed: facts follow operator corrections, no auto-approval, explicit completeReview, V2 matcher fixture.");

