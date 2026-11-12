// RULE (W4 deploy-creator-sign-in-input-f-plus31): deployment/creator-upload-cleanup.cjs is "dry-run by
// default": without --apply it never claims (rpc) or deletes (storage.remove) even when rows are eligible,
// and it refuses an age cutoff under 24 hours before creating any client.
// Runs inside node:vm via tests/support/w4-deploy-vm.mjs (runUploadCleanup) with an in-memory
// @supabase/supabase-js (query builder over an array, rpc and storage recorders); anything unfaked throws a
// HarnessError. No network, no database. The project used is a fake 20-letter name, not a real ref. Skips if
// the target is retired.
import assert from "node:assert/strict";
import test from "node:test";
import { assertNoHarnessGap, readTarget, runUploadCleanup, UPLOAD_CLEANUP, UPLOAD_CREATOR } from "../support/w4-deploy-vm.mjs";

const SRC = readTarget(UPLOAD_CLEANUP);

const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
const row = (id, state) => ({ id, creator_account_id: UPLOAD_CREATOR, file_id: null, state, lease_until: ago(1), updated_at: ago(100) });

test("without --apply, eligible rows are counted but never claimed (rpc) or deleted (storage)", async (t) => {
  if (SRC === null) return t.skip(`target retired: ${UPLOAD_CLEANUP}`);
  const r = await runUploadCleanup([], [row("a1", "stored"), row("a2", "uploading"), row("a3", "removing")]);
  assertNoHarnessGap(r);
  assert.deepEqual(r.rec.rpc, [], "dry-run called an rpc");
  assert.deepEqual(r.rec.storage, [], "dry-run touched storage");
  assert.equal(r.report?.eligible, 3, "fixture rows must be eligible, or the rule is vacuous");
  assert.equal(r.report.dry_run, true);
  assert.equal(r.report.removed, 0);
  assert.equal(r.report.passed, true);
});

test("--older-than-hours=23 is refused before any client is created", async (t) => {
  if (SRC === null) return t.skip(`target retired: ${UPLOAD_CLEANUP}`);
  const r = await runUploadCleanup(["--older-than-hours=23", "--apply"], [row("a1", "stored")]);
  assertNoHarnessGap(r);
  assert.equal(r.rec.createClient.length, 0);
  assert.equal(r.exitCode, 1);
  assert.equal(r.report?.passed, false);
  assert.match(r.report.error, /at least 24 hours/);
});
