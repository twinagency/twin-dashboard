// KNOWN RED (W1 lane 2 finding 10, docs/review/W1/lib-onlyfans-engine.md; REVIEW inv 7 "A refusal the dashboard raises
// before calling upstream is refused"): submitEngineOperatorCommand (lib/onlyfans/engine-operator-client.ts:14) accepts
// "refused" only with schemaVersion. The three denials requireOnlyFansRead raises before any upstream call
// (lib/onlyfans/route.ts:43-49, :67, :71, all via denialResponse :22-24 -> denialBody) carry none, so an expired session,
// read-only team access or unconfigured agency scope reads "unconfirmed" ("may have happened") instead of "refused".
// This pins the client-side fix; a route-side fix (route wraps denials in refuse()) needs a TEST-CHANGE here.
// Team's Claude owns the fix. Not run by init.sh or npm yet: listed under '## Wiring (orchestrator)' in
// docs/review/W1/lib-onlyfans-engine.md. Offline: fetchImpl fake, nothing leaves the process.
import assert from "node:assert/strict";
import test from "node:test";
import { submitEngineOperatorCommand } from "../../lib/onlyfans/engine-operator-client";
import { denialBody, type ReadDenial } from "../../lib/onlyfans/reads";

// Literal copies of the ReadDenial objects in lib/onlyfans/route.ts. The body is built by the real denialBody; the
// wrapper denialResponse (route.ts:22-24) is not imported because route.ts fails under tsx on `server-only` (RISKS D3).
const DENIALS: ReadDenial[] = [
  { ok: false, status: 401, state: "denied", code: "session_unavailable", error: "Your dashboard session could not be verified. Sign in again." }, // route.ts:43-49
  { ok: false, status: 403, state: "denied", code: "agency_read_only", error: "Your team access is read-only." }, // route.ts:67
  { ok: false, status: 503, state: "unavailable", code: "agency_unavailable", error: "Scoped agency access is not configured." }, // route.ts:71
];
const submit = (reply: () => Response) => submitEngineOperatorCommand({ accountId: "of-a", conversationId: "of-a:42",
  requestId: "0a1b2c3d-1111-4222-8333-444455556661", action: "complete", expectedRevision: 4, note: "checked", environment: "live",
  fetchImpl: (async () => reply()) as typeof fetch });

test("control: the engine route's own refusal (schemaVersion, outcome refused) reads refused", async () => {
  const result = await submit(() => Response.json({ schemaVersion: "of-engine-operator.v1", ok: false, outcome: "refused", error: "Your team access is read-only." }, { status: 403 }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "refused");
});

test("finding 10: each dashboard denial raised before any upstream call reads refused, not unconfirmed", async () => {
  // Every denial is submitted before asserting, so a red run lists all of them.
  const misread: string[] = [];
  for (const denial of DENIALS) {
    const result = await submit(() => Response.json(denialBody(denial), { status: denial.status }));
    if (result.ok || result.outcome !== "refused") misread.push(`${denial.status} ${denial.code}: ${result.ok ? "ok" : result.outcome}`);
  }
  assert.deepEqual(misread, [], "a denial raised before any upstream call proves nothing was applied");
});
