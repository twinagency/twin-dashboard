// KNOWN RED (W4 F16, F17; docs/review/W4/deploy-creator-sign-in-input-f-plus31.md):
// F16 deployment/creator-upload-cleanup.cjs accepts the old-prod Supabase ref (live paying users) as
// --project whenever SUPABASE_URL agrees; only shape + agreement are checked before createClient.
// F17 it reads `.order('id').limit(100)` and applies the age cutoff in JS, so young expired-lease rows with
// lower ids hide older eligible ones (any fixed limit does; the fixture outnumbers a plausible larger one).
// Owner = team's Claude. Not wired into npm scripts; init.sh does not run it yet (orchestrator wires it at
// window close). Runs inside node:vm via tests/support/w4-deploy-vm.mjs (runUploadCleanup) with an in-memory
// @supabase/supabase-js (query builder over an array, rpc and storage recorders). No network, no database.
// Refs are derived at runtime, never written here.
// Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/known-red/W4-deploy-creator-sign-in-input-f-plus31-upload-cleanup.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { assertNoHarnessGap, FAKE_PROJECT, projectRefs, requireTarget, runUploadCleanup, UPLOAD_CLEANUP, UPLOAD_CREATOR } from "../support/w4-deploy-vm.mjs";

const FINDINGS = "F16, F17";
const run = (project, rows = []) => runUploadCleanup([], rows, { project });

const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
const row = (id, updatedHoursAgo) => ({ id, creator_account_id: UPLOAD_CREATOR, file_id: null, state: "stored", lease_until: ago(1), updated_at: ago(updatedHoursAgo) });

test("control F16: a non-prod 20-letter project with matching SUPABASE_URL reaches createClient and passes", async () => {
  requireTarget(UPLOAD_CLEANUP, FINDINGS);
  assert.ok(!projectRefs().all.includes(FAKE_PROJECT), "fixture project must not be a real ref");
  const r = await run(FAKE_PROJECT);
  assertNoHarnessGap(r);
  assert.equal(r.rec.createClient.length, 1);
  assert.equal(r.report?.passed, true, JSON.stringify(r.report));
});

test("F16: the old-prod project ref is refused before createClient", async () => {
  requireTarget(UPLOAD_CLEANUP, FINDINGS);
  const r = await run(projectRefs().oldProd);
  assertNoHarnessGap(r);
  assert.equal(r.rec.createClient.length, 0, `old-prod ref accepted: createClient called, report ${JSON.stringify({ passed: r.report?.passed, error: r.report?.error })}`);
});

test("control F17: three old expired-lease rows are all counted eligible in dry-run", async () => {
  requireTarget(UPLOAD_CLEANUP, FINDINGS);
  const r = await run(FAKE_PROJECT, [row("a1", 100), row("a2", 100), row("a3", 100)]);
  assertNoHarnessGap(r);
  assert.equal(r.report?.dry_run, true);
  assert.equal(r.report?.eligible, 3, JSON.stringify(r.report));
});

test("F17: 5000 young rows with lower ids do not hide 5 older eligible rows", async () => {
  requireTarget(UPLOAD_CLEANUP, FINDINGS);
  const young = Array.from({ length: 5000 }, (_, i) => row(`a${String(i).padStart(4, "0")}`, 1));
  const old = Array.from({ length: 5 }, (_, i) => row(`z${i}`, 100));
  const r = await run(FAKE_PROJECT, [...young, ...old]);
  assertNoHarnessGap(r);
  assert.equal(r.report?.eligible, 5, `old eligible rows hidden behind young ones by a fixed limit: ${JSON.stringify(r.report)}`);
});
