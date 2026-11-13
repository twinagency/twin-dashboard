// G45: regression guard promoted from known-red (fix-sweep tests/known-red/w1-10-*); the "KNOWN RED" lines below are history.
// KNOWN RED (W1 lane 10 harness-config F3; REVIEW.md Structure "new test suites are wired into npm test or CI, or the PR
// says why not"). The drop added seven suites (package.json:11-17) that no gate runs. Static reads only.
//  Offline suites (5) must run from `npm test` or `test:offline`: reached by name via `npm run` (transitively), or every
//  file they run appears in a script reached from those two.
//  Suites with outside inputs (2: commercial-category-http needs the backend repo, engine-browser needs Chromium) must be
//  invoked by a workflow run line: `npm run X` (or `npm test`, transitively) or the direct command. An `integration:*`
//  script nobody calls does not count (final Codex check, Rf-2).
// Fix-proof: tests/rules/mutations/W1-harness-config/k1-fixproof.
// KNOWN RED: team's Claude owns the fix; not wired into npm scripts on purpose (init.sh reports it at window Close).
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT, WORKFLOWS, npmRuns, packageScripts, runLines } from "./G45-run";

/** Suite -> the files it runs today (package.json:11-17), so an inlined command counts as wired too. */
const OFFLINE: Record<string, string[]> = {
  "test:engine-contracts": ["tests/contracts/facade.test.mjs", "tests/contracts/engine-status.test.mjs", "tests/contracts/engine-operator.test.ts",
    "tests/contracts/engine-environment.test.ts", "tests/contracts/engine-backend.test.ts", "tests/contracts/engine-catalogue.test.ts"],
  "test:plan-c-contracts": ["tests/contracts/plan-c.test.ts"],
  "test:preparation-ui": ["tests/components/preparation-failure.test.tsx"],
  "test:plan-c-ui": ["tests/components/plan-c-ui.test.tsx"],
  "test:engine-ui": ["tests/components/engine-ui.test.tsx"],
};
const EXTERNAL: Record<string, string[]> = {
  "test:commercial-category-http": ["scripts/check-commercial-category-http.ts"],
  "test:engine-browser": ["tests/browser/build-engine-journey.mjs", "tests/browser/check-engine-journey.mjs"],
};
/** G45: outside-input suites deliberately left out of every workflow, each with why. An entry that becomes wired fails. */
const UNWIRED: Record<string, string> = {
  "test:commercial-category-http": "needs the twin-onlyfans-backend commercial fixture server on :18787; no workflow starts one",
  "test:engine-browser": "check half red: expects 'Reply completed' for a completed request whose send is still `ready`, which G47 (#376) labels 'Request in progress'",
};

const scripts = packageScripts();
const workflowLines = () => readdirSync(WORKFLOWS).filter(f => /\.ya?ml$/.test(f)).flatMap(runLines);
/** Every script reachable from the roots by following `npm run X` transitively. */
function reach(roots: string[]): Set<string> {
  const seen = new Set<string>(), todo = [...roots];
  while (todo.length) { const s = todo.pop()!; if (seen.has(s) || !(s in scripts)) continue; seen.add(s); todo.push(...npmRuns(scripts[s])); }
  return seen;
}
const wired = (suites: Record<string, string[]>, reached: Set<string>, extraLines: string[]) => {
  const text = [...[...reached].map(s => scripts[s]), ...extraLines];
  return Object.entries(suites).filter(([name, files]) => !reached.has(name) && !files.every(f => text.some(l => l.includes(f)))).map(([name]) => name);
};

test("control: package.json has test and test:offline, ci.yml runs test:offline, and every suite file exists", () => {
  assert.ok(scripts.test && scripts["test:offline"], "package.json test / test:offline missing");
  assert.ok(runLines("ci.yml").some(l => npmRuns(l).includes("test:offline")), "ci.yml test:offline step not found (extractor changed?)");
  const missing = Object.values({ ...OFFLINE, ...EXTERNAL }).flat().filter(f => !existsSync(path.join(ROOT, f)));
  assert.deepEqual(missing, [], "suite file list is stale; update OFFLINE/EXTERNAL");
});

test("F3: offline drop suites run from npm test or test:offline", () => {
  const unwired = wired(OFFLINE, reach(["test", "test:offline"]), []);
  assert.deepEqual(unwired, [], `offline suites run by neither npm test nor test:offline (${unwired.length}/${Object.keys(OFFLINE).length}): ${unwired.join(", ")}`);
});

test("F3: suites with outside inputs are invoked by a workflow run line", () => {
  const lines = workflowLines();
  const roots = [...lines.flatMap(npmRuns), ...(lines.some(l => /\bnpm\s+(?:t|test)\b/.test(l)) ? ["test"] : [])];
  const unwired = wired(EXTERNAL, reach(roots), lines);
  const unexplained = unwired.filter(name => !(name in UNWIRED)), stale = Object.keys(UNWIRED).filter(name => !unwired.includes(name));
  assert.deepEqual(unexplained, [], `outside-input suites invoked by no workflow run line and not in UNWIRED: ${unexplained.join(", ")}`);
  assert.deepEqual(stale, [], `UNWIRED entries that are now wired (or no longer EXTERNAL); drop them: ${stale.join(", ")}`);
});
