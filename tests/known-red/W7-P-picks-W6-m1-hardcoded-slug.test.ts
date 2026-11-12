// KNOWN RED (W6 app-media-1 F41, CLAUDE.md rule 4 "A clone is a database row. No per-clone code paths."; REVIEW inv 5).
// lib/catalogue-core.ts:47 `catalogueItemVisible` branches on `slug !== 'alanna-pow'`: an uncaptioned item is listed
// in every catalogue except that one creator's, so one hard-coded slug decides what fans can buy.
// Green when visibility no longer depends on the slug string (e.g. a typed clones column passed in instead).
// Executes the real pure function; no DB, no network. Written by W7 P-picks (not the finding lane).
// Run: nice -n 10 node --import tsx --test tests/known-red/W7-P-picks-W6-m1-hardcoded-slug.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { catalogueItemVisible } from "../../lib/catalogue-core";

const captioned = { caption: "Beach set" };
const uncaptioned = { caption: null };

test("control: a captioned row is visible and a missing row is not, for any slug", () => {
  for (const slug of ["alanna-pow", "other-creator"]) {
    assert.equal(catalogueItemVisible(captioned, slug), true, `captioned row visible for ${slug}`);
    assert.equal(catalogueItemVisible(null, slug), false, `null row hidden for ${slug}`);
  }
});

test("F41: the same uncaptioned row gets the same visibility whatever the creator's slug (no per-clone code path)", () => {
  const bySlug = Object.fromEntries(["alanna-pow", "other-creator"].map(s => [s, catalogueItemVisible(uncaptioned, s)]));
  assert.equal(bySlug["alanna-pow"], bySlug["other-creator"],
    `visibility of one row differs by hard-coded slug: ${JSON.stringify(bySlug)} (lib/catalogue-core.ts:47)`);
});
