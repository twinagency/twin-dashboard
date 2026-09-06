import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  cloneCohortEnrollmentLabel,
  cloneCohortFromPromotionFlag,
  cloneMatchesCohort,
} from "../lib/clone-cohort";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("Clone cohort overview checks");

check("only the live enabled flag enters the New System cohort", () => {
  assert.equal(cloneCohortFromPromotionFlag(true), "new-system");
  assert.equal(cloneCohortFromPromotionFlag(false), "control");
  assert.equal(cloneCohortFromPromotionFlag(null), "control");
  assert.equal(cloneCohortFromPromotionFlag(undefined), "control");
});

check("cohort filters include only their matching cards", () => {
  assert.equal(cloneMatchesCohort("new-system", "all"), true);
  assert.equal(cloneMatchesCohort("control", "all"), true);
  assert.equal(cloneMatchesCohort("new-system", "new-system"), true);
  assert.equal(cloneMatchesCohort("control", "new-system"), false);
  assert.equal(cloneMatchesCohort("control", "control"), true);
  assert.equal(cloneMatchesCohort("new-system", "control"), false);
});

check("enrollment labels use the timestamp only after the flag enables the cohort", () => {
  const enabledAt = "2026-09-06T12:30:00.000Z";
  assert.equal(cloneCohortEnrollmentLabel("new-system", enabledAt), "Enrolled 6 Sept 2026");
  assert.equal(cloneCohortEnrollmentLabel("control", enabledAt), "Not enrolled");
  assert.equal(cloneCohortEnrollmentLabel("new-system", null), "Enrollment date unavailable");
  assert.equal(cloneCohortEnrollmentLabel("new-system", "not-a-date"), "Enrollment date unavailable");
});

check("the overview reads the authoritative database column", () => {
  const page = readFileSync(new URL("../app/clones/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\.select\([^\n]*intent_classic_promotions_enabled/);
  assert.match(page, /\.select\([^\n]*intent_classic_promotions_enabled_at/);
  assert.match(page, /cloneCohortFromPromotionFlag\(c\.intent_classic_promotions_enabled\)/);
  assert.match(page, /cohortEnrolledAt: c\.intent_classic_promotions_enabled_at/);
});

check("every card renders a visible cohort label and exposes a cohort filter", () => {
  const grid = readFileSync(new URL("../components/ClonesGrid.tsx", import.meta.url), "utf8");
  assert.match(grid, /"New System"\s*:\s*"Control"/);
  assert.match(grid, /aria-label="Filter creators by system"/);
  assert.match(grid, /cloneMatchesCohort\(c\.cohort, cohortFilter\)/);
  assert.match(grid, /cloneCohortEnrollmentLabel\(c\.cohort, c\.cohortEnrolledAt\)/);
});

check("the all-creators Flows table also exposes the cohort and enrollment", () => {
  const flows = readFileSync(new URL("../app/flows/page.tsx", import.meta.url), "utf8");
  assert.match(flows, />Conversion system</);
  assert.match(flows, /cloneCohortFromPromotionFlag\(c\.intent_classic_promotions_enabled\)/);
  assert.match(flows, /cloneCohortEnrollmentLabel\(cohort, c\.intent_classic_promotions_enabled_at\)/);
});

console.log(`\n${passed} clone cohort overview checks passed.`);
