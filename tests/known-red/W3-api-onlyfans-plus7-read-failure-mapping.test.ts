// KNOWN RED (W3 api-onlyfans-plus7 finding A-S3, bug-ish). Drives the real GET handlers app/api/onlyfans/accounts/[accountId]/operations,
// .../workspace/[section] and app/api/onlyfans/earnings against the canonical conversations list route
// (app/api/onlyfans/accounts/[accountId]/conversations, readConversations -> lib/onlyfans/reads.ts mapFailure), all as the internal
// operator (tests/helpers/W3-api-onlyfans-plus7-harness.ts: route.ts, next/headers, server-only, supabase-service mocked; the REAL read
// backend configuredOnlyFansBackend runs over the fake wire at https://backend.invalid). No extra module mocks.
// Trace: an upstream 401 means the dashboard's own service credential was rejected. mapFailure (reads.ts:148,:152-153) reports that as 503
// "unavailable", deliberately ("an operational problem on our side, not a refusal of this operator"). operations/route.ts:15-16,
// workspace/[section]/route.ts:17 and earnings/route.ts:32 hand-map instead and relay status 401 (state "denied"), which the browser
// reads as its own session being lost.
// REFUTED half: the brief also expected an upstream 502 to read 503 "unavailable". It does not on the canonical route either:
// backend.ts read() maps any non-listed upstream status (502 included) to backend_error before mapFailure sees it (500 at HEAD), and
// the three routes answer the same status. Only that parity is kept below as a control, not a red; the absolute status is not pinned.
// Fixed looks like the three routes using mapFailure (or the same mapping): upstream 401 -> 503 "unavailable".
// Team's Claude owns the fix. Not wired into npm scripts or init.sh. Runs with plain commands:
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-read-failure-mapping.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-read-failure-mapping.test.ts   (red, ERR_ASSERTION)
// Synthetic values only.
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { call, calls, ensureModuleMocks, reset, upstream } from "../helpers/W3-api-onlyfans-plus7-harness";

const DAY = 86_400_000;
const end = new Date(Math.floor(Date.now() / DAY) * DAY - DAY).toISOString(), start = new Date(Date.parse(end) - 7 * DAY).toISOString();
const reads = {
  conversations: () => call("onlyfans/accounts/[accountId]/conversations", { accountId: "of-a" }),
  operations: () => call("onlyfans/accounts/[accountId]/operations", { accountId: "of-a" }),
  workspace: () => call("onlyfans/accounts/[accountId]/workspace/[section]", { accountId: "of-a", section: "sales" }),
  earnings: () => call("onlyfans/earnings", {}, { query: `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` }),
};
type Answer = { status: number; state: unknown };
async function answered(name: keyof typeof reads, upstreamStatus: number): Promise<Answer> {
  upstream(() => Response.json({ ok: false }, { status: upstreamStatus }));
  const response = await reads[name]();
  assert.ok(calls.length >= 1, `${name} reached upstream`);
  const body = await response.json() as { state?: unknown };
  return { status: response.status, state: body.state };
}

if (ensureModuleMocks(import.meta.url, { controls: 2, rest: 3 })) {
  beforeEach(() => reset());

  test("control: the canonical conversations list answers an upstream 401 as 503 unavailable", async () => {
    assert.deepEqual(await answered("conversations", 401), { status: 503, state: "unavailable" });
  });

  test("control: an upstream 502 reads the same status on all four routes (REFUTED half of A-S3)", async () => {
    const canonical = await answered("conversations", 502);
    for (const name of ["operations", "workspace", "earnings"] as const) assert.equal((await answered(name, 502)).status, canonical.status, name);
  });

  for (const name of ["operations", "workspace"] as const) {
    test(`A-S3: ${name} answers an upstream 401 like the conversations list (503 unavailable)`, async () => {
      const canonical = await answered("conversations", 401);
      const own = await answered(name, 401);
      assert.deepEqual(own, canonical, `${name} relayed the service-credential 401 as status ${own.status} state ${String(own.state)}`);
    });
  }

  test("A-S3: earnings answers an upstream 401 with the conversations list's status (503)", async () => {
    const canonical = await answered("conversations", 401);
    const own = await answered("earnings", 401);
    assert.equal(own.status, canonical.status, `earnings relayed the service-credential 401 as status ${own.status}`);
  });
}
