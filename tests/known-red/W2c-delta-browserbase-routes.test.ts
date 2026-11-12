// KNOWN RED (W2c-delta findings N1, N3, N4, N9; docs/review/W2c/delta.md). Drives the REAL Browserbase proxy routes
//   app/api/onlyfans-connections/accounts/[accountId]/browserbase-login/route.ts              (POST start)
//   app/api/onlyfans-connections/accounts/[accountId]/browserbase-login/[jobId]/route.ts      (GET status)
//   app/api/onlyfans-connections/accounts/[accountId]/browserbase-login/[jobId]/cancel/route.ts (POST cancel)
// as the internal operator through tests/helpers/W2c-delta-route-harness.ts (copy of the W3 p7 harness: lib/onlyfans/route.ts,
// next/headers, server-only and supabase-service mocked; the real connectionCommandContext/connectionSessionContext, verifySessionToken,
// configuredConnectionBackend, createConnectionBackend and parseBrowserbaseJob run over a fake wire at https://backend.invalid).
// No extra module mocks in this file.
// N1 trace: [jobId]/route.ts:17 spreads `...result.data`; backend.ts:80 returns the whole parsed job; browserbase.ts:34 passes
//   `capture` and `xHash` through. The OnlyFans session (cookies[].value, headers.x_bc) and X-Hash reach the browser on every GET.
//   Fixed: the route answers a by-name projection ({state, liveViewUrl?, ownerId, error/code}) and the capture stays server-side.
// N9 trace: backend.ts:79-82, a done job whose capture fails connectionCapture (here: capture for another owner) makes
//   parseBrowserbaseJob return null and the route answers 503 "status could not be read", so the editor keeps polling.
//   Fixed: a non-503 4xx refusal naming the invalid capture (e.g. 422 {state:"done", code:"capture_invalid"}). The RED asserts the
//   status only (not 503, 400-499), not the wording.
// N3 trace: route.ts:10 connectionRefusal hard-codes outcome "refused". Start: backend.ts:69 lists a codeless 503 as refused, :73 a
//   thrown fetch as 502; both relayed via connectionRefusal (browserbase-login/route.ts:19). Cancel: backend.ts:85 post() yields 502
//   `unconfirmed` (upstream 5xx or throw), relayed via connectionRefusal (cancel/route.ts:18). An upstream 401 (our service token) is
//   relayed as 401, which the editor (ConnectionEditor.tsx:169) treats as operator session loss.
//   Fixed: outcome "refused" only for REVIEW inv 7 D7 statuses; otherwise "unconfirmed" (the four D7 REDs assert outcome === "unconfirmed");
//   upstream 401/403 mapped to 502.
// N4 trace: backend.ts:63 start POST sends body "{}": no idempotency key, ctx.identity unused. REVIEW inv 7 needs a key a USER RETRY
//   REUSES; a fresh server-side randomUUID per request would not stop a duplicate paid session. The RED sends the same client body
//   {commandKey: K} twice (K = per-run randomUUID, the retry) and requires both starts answered ok and both upstream POSTs to carry K
//   (body commandKey, body idempotencyKey, or an Idempotency-Key header; any of the three). Today browserbase-login/route.ts:13 refuses
//   any non-empty body with 400, so it stays red until the route accepts and forwards the client key. The `{}` control is kept.
// Run (the file re-runs itself under --experimental-test-module-mocks, see ensureModuleMocks):
//   nice -n 10 node --import tsx --test --experimental-test-module-mocks --test-name-pattern='^control' tests/known-red/W2c-delta-browserbase-routes.test.ts  (green)
//   nice -n 10 node --import tsx --test --experimental-test-module-mocks --test-skip-pattern='^control' tests/known-red/W2c-delta-browserbase-routes.test.ts  (red)
// Synthetic values only: cookie, x_bc, X-Hash and job ids are generated per run (tests/helpers/W2c-delta-fixtures.ts).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { beforeEach } from "node:test";
import { BACKEND, call, calls, ensureModuleMocks, reset, upstream } from "../helpers/W2c-delta-route-harness";
import { doneJob, jobId, sentinel } from "../helpers/W2c-delta-fixtures";

const ACCOUNT = "of-a", OWNER = 111;
const START = "onlyfans-connections/accounts/[accountId]/browserbase-login";
const STATUS = "onlyfans-connections/accounts/[accountId]/browserbase-login/[jobId]";
const CANCEL = "onlyfans-connections/accounts/[accountId]/browserbase-login/[jobId]/cancel";
const WIRE = `${BACKEND}/onlyfans/connection/v1/accounts/${ACCOUNT}/browserbase-login`;
const start = () => call(START, { accountId: ACCOUNT }, { body: {} });
const status = (job: string) => call(STATUS, { accountId: ACCOUNT, jobId: job });
const cancel = (job: string) => call(CANCEL, { accountId: ACCOUNT, jobId: job }, { body: {} });
const offline = () => { throw new TypeError("synthetic network failure"); };
type Body = { ok?: unknown; state?: unknown; outcome?: unknown; error?: unknown; code?: unknown };

if (ensureModuleMocks(import.meta.url, { controls: 8, rest: 8 })) {
  beforeEach(() => reset());

  // ── N1: status GET echoes the OnlyFans session ──
  const n1 = () => { const job = jobId(), cookie = sentinel("ck"), xbc = sentinel("xbc"), xHash = sentinel("xh");
    upstream(() => Response.json(doneJob(job, OWNER, { cookie, xbc, xHash }))); return { job, cookie, xbc, xHash }; };

  test("control N1: a done job is answered 200 ok with state done after one upstream status GET", async () => {
    const { job } = n1();
    const response = await status(job);
    assert.equal(response.status, 200);
    const body = await response.json() as Body;
    assert.equal(body.ok, true); assert.equal(body.state, "done");
    assert.deepEqual(calls.map(c => [c.method, c.url]), [["GET", `${WIRE}/${job}`]]);
  });

  test("RED N1: the status GET never returns the capture cookie, x_bc or X-Hash to the browser", async () => {
    const { job, cookie, xbc, xHash } = n1();
    const response = await status(job);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text.includes(cookie), false, "the OnlyFans session cookie value was returned to the browser");
    assert.equal(text.includes(xbc), false, "the OnlyFans x_bc header was returned to the browser");
    assert.equal(text.includes(xHash), false, "the X-Hash was returned to the browser");
  });

  // ── N9: done-but-invalid capture reads as an unreadable status ──
  const n9 = () => { const job = jobId(); upstream(() => Response.json(doneJob(job, OWNER, { captureOwner: OWNER + 1 }))); return job; };

  test("control N9: a done job whose capture belongs to another owner is not answered ok", async () => {
    const job = n9();
    const response = await status(job);
    assert.ok(response.status >= 400, `status ${response.status}`);
    assert.notEqual((await response.json() as Body).ok, true);
    assert.equal(calls.length, 1, "one upstream status GET");
  });

  test("RED N9: an invalid done capture is refused as invalid, not reported as an unreadable status (503)", async () => {
    const job = n9();
    const response = await status(job);
    assert.notEqual(response.status, 503, "a done job with an invalid capture was relayed as 503 'could not be read'; the editor keeps polling");
    assert.ok(response.status >= 400 && response.status < 500, `expected a 4xx refusal naming the invalid capture, got ${response.status}`);
  });

  // ── N3: unconfirmed relayed as refused; upstream 401 relayed as session loss ──
  test("control N3: start with a codeless upstream 503 is not ok", async () => {
    upstream(() => Response.json({ ok: false }, { status: 503 }));
    const response = await start();
    assert.equal((await response.json() as Body).ok, false);
    assert.deepEqual(calls.map(c => [c.method, c.url]), [["POST", WIRE]]);
  });
  test("RED N3: start with a codeless upstream 503 is answered unconfirmed, not refused (D7)", async () => {
    upstream(() => Response.json({ ok: false }, { status: 503 }));
    const body = await (await start()).json() as Body;
    assert.equal(body.outcome, "unconfirmed", "503 does not prove the start was not applied (REVIEW inv 7 D7)");
  });

  test("control N3: start whose upstream fetch throws is not ok", async () => {
    upstream(offline);
    const response = await start();
    assert.equal((await response.json() as Body).ok, false);
    assert.equal(calls.length, 1, "one upstream start attempt, no retry");
  });
  test("RED N3: start whose upstream fetch throws is answered unconfirmed, not refused (D7)", async () => {
    upstream(offline);
    const body = await (await start()).json() as Body;
    assert.equal(body.outcome, "unconfirmed", "a lost start reply is unconfirmed; a paid Browserbase session may exist");
  });

  test("control N3: cancel whose upstream answers 500 is not ok", async () => {
    const job = jobId(); upstream(() => Response.json({ ok: false }, { status: 500 }));
    const response = await cancel(job);
    assert.equal((await response.json() as Body).ok, false);
    assert.deepEqual(calls.map(c => [c.method, c.url]), [["POST", `${WIRE}/${job}/cancel`]]);
  });
  test("RED N3: cancel whose upstream answers 500 (post() unconfirmed 502) is answered unconfirmed, not refused", async () => {
    const job = jobId(); upstream(() => Response.json({ ok: false }, { status: 500 }));
    const body = await (await cancel(job)).json() as Body;
    assert.equal(body.outcome, "unconfirmed", "backend post() said unconfirmed; the route relabelled it refused");
  });

  test("control N3: cancel whose upstream fetch throws is not ok", async () => {
    const job = jobId(); upstream(offline);
    const response = await cancel(job);
    assert.equal((await response.json() as Body).ok, false);
    assert.equal(calls.length, 1);
  });
  test("RED N3: cancel whose upstream fetch throws is answered unconfirmed, not refused", async () => {
    const job = jobId(); upstream(offline);
    const body = await (await cancel(job)).json() as Body;
    assert.equal(body.outcome, "unconfirmed");
  });

  test("control N3: start whose upstream answers 401 (service token rejected) is not ok", async () => {
    upstream(() => Response.json({ ok: false }, { status: 401 }));
    const response = await start();
    assert.equal((await response.json() as Body).ok, false);
    assert.equal(calls.length, 1);
  });
  test("RED N3: an upstream 401 on start is not relayed as 401/403 (the editor reads that as operator session loss)", async () => {
    upstream(() => Response.json({ ok: false }, { status: 401 }));
    const response = await start();
    assert.ok(![401, 403].includes(response.status), `upstream service-token 401 relayed to the browser as ${response.status}`);
  });

  // ── N4: start carries no idempotency key ──
  test("control N4: a start makes exactly one upstream POST and is answered 200 ok", async () => {
    const job = jobId(); upstream(() => Response.json({ ok: true, jobId: job, state: "starting", liveViewUrl: null }));
    const response = await start();
    assert.equal(response.status, 200);
    assert.deepEqual(calls.map(c => [c.method, c.url]), [["POST", WIRE]]);
  });
  test("RED N4: a user retry of the same start reuses the client's key upstream (same key K on both upstream POSTs)", async () => {
    const key = randomUUID();
    upstream(() => Response.json({ ok: true, jobId: jobId(), state: "starting", liveViewUrl: null }));
    const first = await call(START, { accountId: ACCOUNT }, { body: { commandKey: key } });
    const second = await call(START, { accountId: ACCOUNT }, { body: { commandKey: key } });
    assert.deepEqual([first.status, second.status], [200, 200], "a start carrying the client's commandKey was not accepted");
    const sent = calls.filter(c => c.method === "POST" && c.url === WIRE).map(c => {
      const body = (c.body ?? {}) as { commandKey?: unknown; idempotencyKey?: unknown };
      return body.commandKey ?? body.idempotencyKey ?? c.headers.get("idempotency-key");
    });
    assert.deepEqual(sent, [key, key], "both upstream start POSTs must carry the client's key so the backend can dedupe the retry");
  });
}
