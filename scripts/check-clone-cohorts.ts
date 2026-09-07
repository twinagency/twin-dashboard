import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  cloneCohortEnrollmentLabel,
  cloneCohortFromPromotionFlag,
  cloneCohortLabel,
  cloneMatchesCohort,
} from "../lib/clone-cohort";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("Clone cohort overview checks");

check("the enabled flag and explicit version distinguish V3, V2, V1 and Control", () => {
  assert.equal(cloneCohortFromPromotionFlag(true, 3), "new-system-v3");
  assert.equal(cloneCohortFromPromotionFlag(true, 2), "new-system-v2");
  assert.equal(cloneCohortFromPromotionFlag(true, 1), "new-system-v1");
  assert.equal(cloneCohortFromPromotionFlag(true, null), "new-system-v1");
  assert.equal(cloneCohortFromPromotionFlag(false), "control");
  assert.equal(cloneCohortFromPromotionFlag(null), "control");
  assert.equal(cloneCohortFromPromotionFlag(undefined), "control");
});

check("cohort filters include only their matching cards", () => {
  assert.equal(cloneMatchesCohort("new-system-v3", "all"), true);
  assert.equal(cloneMatchesCohort("new-system-v2", "all"), true);
  assert.equal(cloneMatchesCohort("new-system-v1", "all"), true);
  assert.equal(cloneMatchesCohort("control", "all"), true);
  assert.equal(cloneMatchesCohort("new-system-v2", "new-system-v2"), true);
  assert.equal(cloneMatchesCohort("new-system-v3", "new-system-v3"), true);
  assert.equal(cloneMatchesCohort("new-system-v1", "new-system-v2"), false);
  assert.equal(cloneMatchesCohort("control", "new-system-v2"), false);
  assert.equal(cloneMatchesCohort("control", "control"), true);
  assert.equal(cloneMatchesCohort("new-system-v2", "control"), false);
  assert.equal(cloneCohortLabel("new-system-v2"), "New System V2");
  assert.equal(cloneCohortLabel("new-system-v3"), "New System V3");
  assert.equal(cloneCohortLabel("new-system-v1"), "V1");
});

check("enrollment labels use the timestamp only after the flag enables the cohort", () => {
  const enabledAt = "2026-09-06T12:30:00.000Z";
  assert.equal(cloneCohortEnrollmentLabel("new-system-v2", enabledAt), "Enrolled 6 Sept 2026");
  assert.equal(cloneCohortEnrollmentLabel("new-system-v3", enabledAt), "Enrolled 6 Sept 2026");
  assert.equal(cloneCohortEnrollmentLabel("new-system-v1", enabledAt), "Enrolled 6 Sept 2026");
  assert.equal(cloneCohortEnrollmentLabel("control", enabledAt), "Not enrolled");
  assert.equal(cloneCohortEnrollmentLabel("new-system-v2", null), "Enrollment date unavailable");
  assert.equal(cloneCohortEnrollmentLabel("new-system-v1", "not-a-date"), "Enrollment date unavailable");
});

check("the overview reads the authoritative database column", () => {
  const page = readFileSync(new URL("../app/clones/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\.select\([^\n]*intent_classic_promotions_enabled/);
  assert.match(page, /\.select\([^\n]*intent_classic_promotions_enabled_at/);
  assert.match(page, /intent_classic_promotion_version/);
  assert.match(page, /cloneCohortFromPromotionFlag\([\s\S]*c\.intent_classic_promotion_version/);
  assert.match(page, /cohortEnrolledAt: c\.intent_classic_promotions_enabled_at/);
});

check("creator cards omit ambiguous revenue and user totals", () => {
  const page = readFileSync(new URL("../app/clones/page.tsx", import.meta.url), "utf8");
  const grid = readFileSync(new URL("../components/ClonesGrid.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /from\("star_transactions"\)/);
  assert.doesNotMatch(page, /from\("message_purchases"\)/);
  assert.doesNotMatch(page, /from\("users"\)/);
  assert.doesNotMatch(grid, /MoneyAmount|Stars earned|Gross value|Total fans/);
});

check("every card renders a visible cohort label and exposes a cohort filter", () => {
  const grid = readFileSync(new URL("../components/ClonesGrid.tsx", import.meta.url), "utf8");
  assert.match(grid, /"New System V2"/);
  assert.match(grid, /"New System V3"/);
  assert.match(grid, /"V1"/);
  assert.match(grid, /aria-label="Filter creators by system"/);
  assert.match(grid, /cloneMatchesCohort\(c\.cohort, cohortFilter\)/);
  assert.match(grid, /cloneCohortEnrollmentLabel\(c\.cohort, c\.cohortEnrolledAt\)/);
});

check("the all-creators Flows table also exposes the cohort and enrollment", () => {
  const flows = readFileSync(new URL("../app/flows/page.tsx", import.meta.url), "utf8");
  assert.match(flows, />Conversion system</);
  assert.match(flows, /intent_classic_promotion_version/);
  assert.match(flows, /cloneCohortFromPromotionFlag\(/);
  assert.match(flows, /cloneCohortEnrollmentLabel\(cohort, c\.intent_classic_promotions_enabled_at\)/);
  assert.match(flows, /IntentOfferFunnelSummary/);
  assert.match(flows, /intent_offer_events/);
  assert.match(flows, /intent_experiment_assignments/);
});

console.log(`\n${passed} clone cohort overview checks passed.`);
