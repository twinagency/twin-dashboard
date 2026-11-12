// Rule (W2c N1, step 1 of 3, additive): the capture routes also hold the OnlyFans capture server-side under `captureId`, and a save may
// send `payload.captureRef` instead of capture + xHash. The ref resolves only for the same account and operator session, for 15 minutes,
// newest 64 kept; the stored capture/xHash are swapped in before validation and before the commandKey is hashed, `captureRef` never
// goes upstream, and the handle is deleted only once the backend acks the save. Only action "save" takes a ref. Saves without a ref are unchanged.
// Drives the REAL routes (capture-from-curl, browserbase-login/[jobId], accounts/[accountId]) through tests/helpers/W2c-delta-route-harness.ts
// (lib/onlyfans/route.ts, next/headers, server-only, supabase-service mocked; real connectionCommandContext over a fake wire).
// No extra module mocks. Expiry uses node:test mock.timers on Date only. Synthetic values only (tests/helpers/W2-F1-N2-owner-guard-fixtures.ts).
// Run: nice -n 10 node --import tsx --test tests/rules/W2c-N1-capture-ref.test.ts (re-runs itself under --experimental-test-module-mocks)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { beforeEach, mock } from "node:test";
import { BACKEND, call, calls, ensureModuleMocks, operatorActor, ready, reset, state, upstream, type Call } from "../helpers/W2c-delta-route-harness";
import { capture, doneJob, jobId, sentinel } from "../helpers/W2-F1-N2-owner-guard-fixtures";
import { canonicalConnection } from "../../lib/onlyfans-connections/contract";

const A = "of-a", B = "of-b", OWNER = 111, SCHEMA = "of-connections.v1";
const ACCOUNT = "onlyfans-connections/accounts/[accountId]";
const wire = (account: string) => `${BACKEND}/onlyfans/connection/v1/accounts/${account}`;
type Reply = Record<string, unknown> & { captureId?: unknown; code?: unknown; ok?: unknown };
const ack = (c: Call) => { const b = c.body as Record<string, unknown>;
  return Response.json({ schemaVersion: SCHEMA, ok: true, applied: true, accountId: c.path.split("/").pop(), commandKey: b.commandKey,
    recordedRevision: (b.expectedRevision as number) + 1, action: b.action }); };
/** Backend: converts curl to a fresh capture, answers saves with `save` (default: ack). */
function backend(save: (c: Call) => Response = ack) {
  upstream(c => c.path.endsWith("/capture-from-curl")
    ? Response.json({ ok: true, capture: capture(OWNER), xHash: sentinel("xh"), ownerId: OWNER }) : save(c));
}
async function mint(account = A) {
  const r = await call(`${ACCOUNT}/capture-from-curl`, { accountId: account }, { body: { curl: "curl 'https://fixture.invalid/'" } });
  assert.equal(r.status, 200); const body = await r.json() as Reply & { capture: unknown; xHash: string };
  return { ref: body.captureId as string, capture: body.capture, xHash: body.xHash };
}
const payload = (extra: Record<string, unknown>) => ({ ownerId: OWNER, proxyUrl: null, expiresAt: "2030-01-01T00:00:00Z", model: null, ...extra });
const save = (extra: Record<string, unknown>, account = A) => call(ACCOUNT, { accountId: account }, { body: { action: "save", expectedRevision: 3, payload: payload(extra) } });
const saves = () => calls.filter(c => c.url === wire(A) || c.url === wire(B));
async function expired(r: Response) { assert.equal(r.status, 410); const b = await r.json() as Reply; assert.equal(b.ok, false); assert.equal(b.code, "capture_expired"); }
async function otherSession() { const old = state.session; const { signSession } = await import("../../lib/session");
  while (state.session === old) { await new Promise(r => setTimeout(r, 2)); state.session = await signSession(); } return old; }

if (ensureModuleMocks(import.meta.url, { controls: 1, rest: 11 })) {
  beforeEach(async () => { reset(); await ready(); });

  test("control: a save without captureRef is forwarded exactly as before, and the strict contract still refuses a missing capture", async () => {
    backend(); const body = { action: "save", expectedRevision: 3, payload: payload({ capture: capture(OWNER), xHash: sentinel("xh") }) };
    const r = await call(ACCOUNT, { accountId: A }, { body }); assert.equal(r.status, 200);
    const actor = operatorActor(), commandKey = createHash("sha256").update(canonicalConnection([actor, A, body])).digest("hex");
    assert.deepEqual(saves().map(c => c.body), [{ ...body, actor, commandKey }]);
    calls.length = 0;
    assert.equal((await save({ xHash: sentinel("xh") })).status, 400);
    assert.equal(saves().length, 0);
  });

  test("curl reply keeps capture/xHash/ownerId and adds an unguessable captureId", async () => {
    backend(); const one = await mint(), two = await mint();
    assert.match(one.ref, /^[A-Za-z0-9_-]{22,}$/); assert.notEqual(one.ref, two.ref);
    assert.ok(one.capture && one.xHash);
  });

  test("a done Browserbase status adds captureId (stable across polls); a running one does not", async () => {
    const job = jobId(); upstream(() => Response.json({ ok: true, jobId: job, state: "waiting_login", liveViewUrl: null }));
    const running = await (await call(`${ACCOUNT}/browserbase-login/[jobId]`, { accountId: A, jobId: job })).json() as Reply;
    assert.equal(running.ok, true); assert.equal("captureId" in running, false);
    const done = doneJob(job, OWNER); upstream(() => Response.json(done));
    const poll = async () => await (await call(`${ACCOUNT}/browserbase-login/[jobId]`, { accountId: A, jobId: job })).json() as Reply;
    const first = await poll(), second = await poll();
    assert.match(String(first.captureId), /^[A-Za-z0-9_-]{22,}$/); assert.equal(second.captureId, first.captureId);
    assert.deepEqual(first.capture, done.capture);
    backend(); assert.equal((await save({ captureRef: first.captureId })).status, 200);
    assert.deepEqual((saves()[0].body as { payload: { capture: unknown } }).payload.capture, done.capture);
  });

  test("save with captureRef forwards the stored capture/xHash, no captureRef, and a commandKey over the swapped body", async () => {
    backend(); const m = await mint(); calls.length = 0;
    const r = await save({ captureRef: m.ref }); assert.equal(r.status, 200);
    const [sent] = saves(); assert.ok(sent);
    const expected = { action: "save", expectedRevision: 3, payload: payload({ capture: m.capture, xHash: m.xHash }) };
    const actor = operatorActor(), commandKey = createHash("sha256").update(canonicalConnection([actor, A, expected])).digest("hex");
    assert.deepEqual(sent.body, { ...expected, actor, commandKey });
    assert.equal(JSON.stringify(sent.body).includes("captureRef"), false);
    assert.equal(JSON.stringify(sent.body).includes(m.ref), false);
  });

  test("an acked save deletes the handle: the same ref then answers capture_expired and sends nothing", async () => {
    backend(); const m = await mint();
    assert.equal((await save({ captureRef: m.ref })).status, 200); calls.length = 0;
    await expired(await save({ captureRef: m.ref })); assert.equal(saves().length, 0);
  });

  test("a refused or unconfirmed upstream save keeps the handle so Retry works", async () => {
    backend(() => Response.json({ ok: false }, { status: 409 })); const m = await mint();
    assert.equal((await save({ captureRef: m.ref })).status, 409);
    backend(() => Response.json({ ok: false }, { status: 500 }));
    assert.equal((await save({ captureRef: m.ref })).status, 502);
    backend(() => Response.json({ ok: true })); // 200 but not an ack: unconfirmed
    assert.equal((await save({ captureRef: m.ref })).status, 502);
    backend(); assert.equal((await save({ captureRef: m.ref })).status, 200);
  });

  test("another operator session cannot use the ref, and does not consume it", async () => {
    backend(); const m = await mint(); const owner = await otherSession(); calls.length = 0;
    await expired(await save({ captureRef: m.ref })); assert.equal(saves().length, 0);
    state.session = owner; assert.equal((await save({ captureRef: m.ref })).status, 200);
  });

  test("another account cannot use the ref", async () => {
    backend(); const m = await mint(A); calls.length = 0;
    await expired(await save({ captureRef: m.ref }, B)); assert.equal(saves().length, 0);
    assert.equal((await save({ captureRef: m.ref }, A)).status, 200);
  });

  test("an unknown ref and a ref older than 15 minutes answer capture_expired", async () => {
    backend(); await expired(await save({ captureRef: "A".repeat(22) }));
    mock.timers.enable({ apis: ["Date"], now: Date.now() });
    try {
      const m = await mint(); mock.timers.tick(14 * 60_000);
      const n = await mint(); mock.timers.tick(60_000 + 1); calls.length = 0;
      await expired(await save({ captureRef: m.ref })); assert.equal(saves().length, 0);
      assert.equal((await save({ captureRef: n.ref })).status, 200);
    } finally { mock.timers.reset(); }
  });

  test("an ownerId that is not the captured owner fails validation (400) and keeps the handle", async () => {
    backend(); const m = await mint(); calls.length = 0;
    const r = await call(ACCOUNT, { accountId: A }, { body: { action: "save", expectedRevision: 3, payload: { ...payload({ captureRef: m.ref }), ownerId: OWNER + 1 } } });
    assert.equal(r.status, 400); assert.equal(saves().length, 0);
    assert.equal((await save({ captureRef: m.ref })).status, 200);
  });

  test("captureRef is refused (400) on the session action and when it is not a string", async () => {
    backend(); const m = await mint(); calls.length = 0;
    const session = { ownerId: OWNER, captureRef: m.ref, expiresAt: "2030-01-01T00:00:00Z" };
    assert.equal((await call(ACCOUNT, { accountId: A }, { body: { action: "session", expectedRevision: 3, payload: session } })).status, 400);
    for (const captureRef of [123, null, { id: m.ref }]) assert.equal((await save({ captureRef })).status, 400);
    assert.equal(saves().length, 0);
    assert.equal((await save({ captureRef: m.ref })).status, 200);
  });

  test("the store keeps the newest 64: the 65th capture evicts the oldest", async () => {
    backend(); const refs: string[] = [];
    for (let i = 0; i < 65; i++) refs.push((await mint()).ref);
    await expired(await save({ captureRef: refs[0] }));
    assert.equal((await save({ captureRef: refs[1] })).status, 200);
    assert.equal((await save({ captureRef: refs[64] })).status, 200);
  });
}
