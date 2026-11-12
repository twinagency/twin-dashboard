// KNOWN RED (W4 F15; docs/review/W4/deploy-creator-sign-in-input-f-plus31.md): REVIEW invariant 1, lane
// scripts hard-code Supabase project refs outside the deny list (expected URL should come from workflow env).
// Owner = team's Claude. Not wired into npm scripts; init.sh does not run it yet (orchestrator wires it at
// window close). Text scan only. The two deny-listed refs are derived at runtime (tests/support/w4-deploy-vm.mjs
// projectRefs) and never written here; messages label matches, they never quote them.
// Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/known-red/W4-deploy-creator-sign-in-input-f-plus31-hardcoded-refs.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { projectRefs, readTarget } from "../support/w4-deploy-vm.mjs";

// The non-SQL paths of review lane W4 deploy-creator-sign-in-input-f-plus31 (other deployment files belong to
// other lanes). A file that has since been deleted is skipped.
const LANE = [
  "deployment/creator-sign-in-input-fix.py",
  "deployment/creator-sign-in-mobile-fix.cjs",
  "deployment/creator-sign-in-mobile-fix.py",
  "deployment/creator-sign-in-resize.cjs",
  "deployment/creator-sign-in-upgrade-preflight.cjs",
  "deployment/creator-upload-cleanup.cjs",
  "deployment/creator-upload-idle.py",
  "deployment/crm-resolution-worker-20261028.py",
  "deployment/full-history-audit.mjs",
  "deployment/full-history-audit.py",
  "deployment/instagram-reader-pagination-20261030.py",
  "deployment/live-overview-check.cjs",
  "deployment/live-overview-check.py",
  "deployment/live-telegram-check.cjs",
  "deployment/live-telegram-check.py",
  "deployment/messages-history-cache.cjs",
  "deployment/messages-load-check.cjs",
  "deployment/messages-load-check.py",
  "deployment/messages-monitor-fleet-cache.cjs",
  "deployment/messages-monitor-parity.cjs",
  "deployment/messages-monitor-release-host.py",
  "deployment/messages-monitor-release.py",
  "deployment/promote-crm-release-20261028.py",
  "deployment/v2-history-release-host.py",
  "deployment/v2-history-release.py",
];
// An explicit refusal of a ref (the natural F15 fix) is a deny construct, not a hard-coded target. Word-anchored so
// `--retry-connrefused` is not a refusal; it exempts ONLY the old-prod label on that line (a live, other-host or
// quoted ref next to "never"/"refusing", e.g. an embedded script's `--pull','never'`, is still flagged).
const DENY_LINE = /\b(?:deny|denied|forbid|refus|never)/i;
const HOST = /\b([a-z]{20})\.supabase\.co\b/g;
const QUOTED = /(['"`])([a-z]{20})\1/g;

const present = () => LANE.map((f) => [f, readTarget(f)]).filter(([, t]) => t !== null);

/** Labels of the project refs hard-coded on one line (empty when none). */
function scanLine(line, { oldProd, live }) {
  const labels = new Set();
  if (line.includes(oldProd) && !DENY_LINE.test(line)) labels.add("old-prod");
  if (line.includes(live)) labels.add("live-Twin");
  for (const m of line.matchAll(HOST)) if (m[1] !== oldProd && m[1] !== live) labels.add("other project host");
  if (/project|supabase/i.test(line)) for (const m of line.matchAll(QUOTED)) if (m[2] !== oldProd && m[2] !== live) labels.add("other quoted project ref");
  return [...labels];
}

test("control: both refs derive from settings + CLAUDE.md and at least one lane file still exists", () => {
  const { all, oldProd, live } = projectRefs();
  assert.equal(all.length, 2);
  assert.ok(oldProd && live && live !== oldProd);
  assert.ok(present().length >= 1, "no lane file left to scan");
});

test("control: the scanner flags a live ref on a refusal line and exempts an old-prod-only deny line", () => {
  const refs = projectRefs();
  assert.deepEqual(scanLine(`refusing to run unless SUPABASE_URL is https://${refs.live}.supabase.co`, refs), ["live-Twin"]);
  assert.deepEqual(scanLine(`curl --retry-connrefused https://${refs.oldProd}.supabase.co`, refs), ["old-prod"]);
  assert.deepEqual(scanLine(`if project == "${refs.oldProd}": raise SystemExit("refusing old prod")`, refs), []);
});

test("F15: no lane .py/.cjs/.mjs file hard-codes a Supabase project ref", () => {
  const refs = projectRefs();
  const offenders = [];
  for (const [file, text] of present().filter(([f]) => /\.(py|cjs|mjs)$/.test(f))) {
    text.split("\n").forEach((line, i) => {
      const labels = scanLine(line, refs);
      if (labels.length) offenders.push(`${file}:${i + 1} (${labels.join(", ")})`);
    });
  }
  assert.deepEqual(offenders, [], `hard-coded project refs: ${offenders.join("; ")}`);
});
