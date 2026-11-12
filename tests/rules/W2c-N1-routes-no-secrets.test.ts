// Rule (W2c N1 step 3 of 3 + W3 C-C3; rule "OnlyFans session data never reaches the browser"): the capture-from-curl reply
// and the Browserbase status GET are by-name projections. The capture (cookies[].value, headers.x_bc, any unknown key) and the X-Hash stay
// server-side in lib/onlyfans-connections/capture-store.ts; the browser gets ownerId + captureId only.
// Drives the REAL routes through tests/helpers/W2c-delta-route-harness.ts (lib/onlyfans/route.ts, next/headers, server-only,
// supabase-service mocked; real connectionCommandContext/connectionSessionContext, backend and parsers over a fake wire).
// No extra module mocks. Synthetic values only (tests/helpers/W2-F1-N2-owner-guard-fixtures.ts, per-run randomUUID sentinels).
// Run: nice -n 10 node --import tsx --test tests/rules/W2c-N1-routes-no-secrets.test.ts (re-runs itself under --experimental-test-module-mocks)
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { BACKEND, call, calls, ensureModuleMocks, ready, reset, upstream } from "../helpers/W2c-delta-route-harness";
import { capture, doneJob, jobId, sentinel } from "../helpers/W2-F1-N2-owner-guard-fixtures";

const ACCOUNT = "of-a", OWNER = 111, EXTRA = "syntheticExtraSentinel";
const STATUS = "onlyfans-connections/accounts/[accountId]/browserbase-login/[jobId]";
const CURL = "onlyfans-connections/accounts/[accountId]/capture-from-curl";
const WIRE = `${BACKEND}/onlyfans/connection/v1/accounts/${ACCOUNT}`;
type Body = { ok?: unknown; state?: unknown; ownerId?: unknown };
/** A valid capture for OWNER plus one unknown upstream key, with its secret values. */
const held = () => { const c = { ...capture(OWNER), [EXTRA]: "synthetic-extra-value" };
  return { c, secrets: [c.cookies[0].value, c.headers.x_bc, EXTRA] }; };
const done = () => { const job = jobId(), { c, secrets } = held(), answer = { ...doneJob(job, OWNER), capture: c };
  upstream(() => Response.json(answer)); return { job, secrets: [...secrets, answer.xHash] }; };
const converted = () => { const { c, secrets } = held(), xHash = sentinel("xh");
  upstream(() => Response.json({ ok: true, capture: c, xHash, ownerId: OWNER })); return [...secrets, xHash]; };
const paste = () => call(CURL, { accountId: ACCOUNT }, { body: { curl: "curl 'https://example.invalid/api2/v2/users/me' -H 'synthetic: 1'" } });
const leaks = (text: string, secrets: string[]) => secrets.filter(s => text.includes(s));

if (ensureModuleMocks(import.meta.url, { controls: 2, rest: 3 })) {
  beforeEach(async () => { reset(); await ready(); });

  test("control: a done Browserbase job is answered 200 ok with state done after one upstream status GET", async () => {
    const { job } = done();
    const response = await call(STATUS, { accountId: ACCOUNT, jobId: job });
    assert.equal(response.status, 200);
    const body = await response.json() as Body;
    assert.equal(body.ok, true); assert.equal(body.state, "done"); assert.equal(body.ownerId, OWNER);
    assert.deepEqual(calls.map(c => [c.method, c.url]), [["GET", `${WIRE}/browserbase-login/${job}`]]);
  });

  test("the Browserbase status GET never returns the capture cookie, x_bc, an unknown capture key or the X-Hash", async () => {
    const { job, secrets } = done();
    const response = await call(STATUS, { accountId: ACCOUNT, jobId: job });
    assert.equal(response.status, 200);
    assert.deepEqual(leaks(await response.text(), secrets), [], "OnlyFans session data reached the browser");
  });

  test("control: a pasted curl is converted once upstream and answered 200 ok with the owner", async () => {
    converted();
    const response = await paste();
    assert.equal(response.status, 200);
    const body = await response.json() as Body;
    assert.equal(body.ok, true); assert.equal(body.ownerId, OWNER);
    assert.deepEqual(calls.map(c => [c.method, c.url]), [["POST", `${WIRE}/capture-from-curl`]]);
  });

  test("C-C3: the converted capture's cookie value, x_bc and X-Hash never reach the browser", async () => {
    const secrets = converted().filter(s => s !== EXTRA);
    const response = await paste();
    assert.equal(response.status, 200);
    assert.deepEqual(leaks(await response.text(), secrets), [], "OnlyFans session data reached the browser");
  });

  test("C-C3: an unknown upstream key inside the capture is not echoed (allowlist projection)", async () => {
    converted();
    const response = await paste();
    assert.equal(response.status, 200);
    assert.equal((await response.text()).includes(EXTRA), false, "an unchecked upstream key reached the browser");
  });
}
