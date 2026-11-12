// Rule (W2c N1-follow-a; "OnlyFans session data never reaches the browser"): the Browserbase status GET never forwards the backend
// job's free-text `error` (arbitrary `ExceptionType: message`, not enumerable); it answers `error: null` and the editor shows its fixed copy.
// Same harness as W2c-N1-routes-no-secrets.test.ts. Run: nice -n 10 node --import tsx --test tests/rules/W2c-N1-follow-a-bb-error.test.ts
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { call, ensureModuleMocks, ready, reset, upstream } from "../helpers/W2c-delta-route-harness";
import { doneJob, jobId } from "../helpers/W2-F1-N2-owner-guard-fixtures";

const ACCOUNT = "of-a", OWNER = 111, STATUS = "onlyfans-connections/accounts/[accountId]/browserbase-login/[jobId]";
const SECRETS = ["x_bc=synthetic-secret", "sess=abc", "synthetic-secret"];

if (ensureModuleMocks(import.meta.url, { controls: 1, rest: 1 })) {
  beforeEach(async () => { reset(); await ready(); });

  test("control: a done Browserbase job still answers its captureId", async () => {
    const job = jobId(); upstream(() => Response.json(doneJob(job, OWNER)));
    const response = await call(STATUS, { accountId: ACCOUNT, jobId: job });
    assert.equal(response.status, 200);
    const body = await response.json() as { state?: unknown; captureId?: unknown };
    assert.equal(body.state, "done"); assert.equal(typeof body.captureId, "string");
  });

  test("a failed job's upstream error text never reaches the browser; error is null", async () => {
    const job = jobId();
    upstream(() => Response.json({ ok: true, jobId: job, state: "failed", liveViewUrl: null, error: "x_bc=synthetic-secret; sess=abc" }));
    const response = await call(STATUS, { accountId: ACCOUNT, jobId: job });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.deepEqual(SECRETS.filter(s => text.includes(s)), [], "upstream error text reached the browser");
    const body = JSON.parse(text) as { state?: unknown; error?: unknown };
    assert.equal(body.state, "failed"); assert.equal(body.error, null);
  });
}
