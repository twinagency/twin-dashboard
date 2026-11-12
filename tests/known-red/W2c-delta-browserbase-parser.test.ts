// KNOWN RED (W2c-delta findings N7, N8; docs/review/W2c/delta.md). Pure unit test of the real parseBrowserbaseJob
// (lib/onlyfans-connections/browserbase.ts), the one parser the backend adapter (backend.ts:70,79) and the editor
// (ConnectionEditor.tsx:176,201) both use. No mocks, no network.
// N7 trace: browserbase.ts:29-30 keeps backend `error` free text after only a [\x20-\x7e] strip and a 300-char cut; the editor renders it
//   (ConnectionEditor.tsx:338). Upstream text can carry session, proxy or URL material. Fixed: known codes map to fixed copy; backend
//   free text is never returned for display.
// N8 trace: browserbase.ts:27 keeps `liveViewUrl` (bearer-like: whoever holds it drives the hosted browser) in every state, including
//   done/failed/cancelled/expired. Fixed: liveViewUrl is null unless the job is still live (starting, waiting_login, capturing).
// Run: nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W2c-delta-browserbase-parser.test.ts  (green)
//      nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W2c-delta-browserbase-parser.test.ts  (red)
// Synthetic values only (tests/helpers/W2c-delta-fixtures.ts); the live-view URL is never fetched.
import assert from "node:assert/strict";
import test from "node:test";
import { parseBrowserbaseJob } from "../../lib/onlyfans-connections/browserbase";
import { doneJob, jobId, LIVE, sentinel } from "../helpers/W2c-delta-fixtures";

const OWNER = 111;
const failedWith = (job: string, error: string) => ({ ok: true, jobId: job, state: "failed", liveViewUrl: null, error });

// ── N7: backend free text shown to the operator ──
test("control N7: a failed job carrying a backend error parses as failed", () => {
  const job = jobId();
  const parsed = parseBrowserbaseJob(failedWith(job, `upstream said ${sentinel()}`), job);
  assert.ok(parsed, "a failed job with an error is accepted");
  assert.equal(parsed.state, "failed");
});

test("RED N7: backend error free text (here a per-run sentinel standing for session/proxy material) is not returned for display", () => {
  const job = jobId(), secret = sentinel();
  const parsed = parseBrowserbaseJob(failedWith(job, `login step failed, upstream detail ${secret}`), job);
  assert.ok(parsed);
  assert.equal(String(parsed.error ?? "").includes(secret), false, `backend free text reached the operator: ${parsed.error}`);
});

// ── N8: live-view URL kept in terminal states ──
const terminal = (job: string) => ({
  failed: { ok: true, jobId: job, state: "failed", liveViewUrl: LIVE, error: null },
  cancelled: { ok: true, jobId: job, state: "cancelled", liveViewUrl: LIVE },
  expired: { ok: true, jobId: job, state: "expired", liveViewUrl: LIVE },
  done: doneJob(job, OWNER, { liveViewUrl: LIVE }),
});

test("control N8: terminal jobs with an allowed live-view host parse to their state", () => {
  const job = jobId();
  for (const [state, value] of Object.entries(terminal(job))) {
    const parsed = parseBrowserbaseJob(value, job);
    assert.ok(parsed, `${state} parses`);
    assert.equal(parsed.state, state);
  }
  // and a live job keeps its view (the fix must not drop it here)
  assert.equal(parseBrowserbaseJob({ ok: true, jobId: job, state: "waiting_login", liveViewUrl: LIVE }, job)?.liveViewUrl, LIVE);
});

test("RED N8: a terminal job (done, failed, cancelled, expired) carries no live-view URL", () => {
  const job = jobId();
  const kept = Object.entries(terminal(job)).filter(([, value]) => parseBrowserbaseJob(value, job)?.liveViewUrl != null).map(([state]) => state);
  assert.deepEqual(kept, [], `liveViewUrl kept in terminal states: ${kept.join(", ")}`);
});
