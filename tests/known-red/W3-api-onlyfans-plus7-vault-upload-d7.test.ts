// KNOWN RED (REVIEW.md inv 7 "Unconfirmed is not refused (D7)", docs/RISKS.md D7; W3 api-onlyfans-plus7 finding B-C1).
// Drives the real POST handlers app/api/onlyfans-content/accounts/[accountId]/vault/uploads/[[...path]]/route.ts (create) and
// .../vault/videos/[mediaId]/route.ts as the internal operator (tests/helpers/W3-api-onlyfans-plus7-harness.ts: route.ts, next/headers,
// server-only, supabase-service mocked; the real vaultCommandContext and vault-media-backend run over the fake wire at
// https://backend.invalid). No extra module mocks in this file.
// Trace: vault-media-backend.ts:15,:17 map a network error/timeout and any status outside its refusal list to 502, keep 503/429 as is;
// the routes then answer `vaultRefusal(r.status, r.error)` (uploads :41,:45, videos :26), and vault-route.ts:8 hardcodes
// outcome "refused". A create or video request whose reply was lost may have been applied, so "refused" invites a second action.
// Second half: an upstream 401/403 (the dashboard's SERVICE credential rejected) is relayed as the route's own status, which
// VaultUploader.tsx:26-27 reads as "your session is lost, sign in again" and refreshes the page.
// Fixed looks like: the backend result carries an outcome (refused only for upstream 400/401/403/404/405/409/410/413/422; unconfirmed for
// 5xx, 429, timeout, network, unreadable), the routes forward it (vault/manage/[...resource]/route.ts:26 already does), and an upstream
// 401/403 is answered as 503 (or another non-401/403 status), as lib/onlyfans/reads.ts mapFailure does for reads.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh. Runs with plain commands:
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-vault-upload-d7.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-vault-upload-d7.test.ts   (red, ERR_ASSERTION)
// Synthetic values only.
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { BACKEND, call, calls, ensureModuleMocks, reset, upstream } from "../helpers/W3-api-onlyfans-plus7-harness";

const UPLOADS = "onlyfans-content/accounts/[accountId]/vault/uploads/[[...path]]";
const VIDEOS = "onlyfans-content/accounts/[accountId]/vault/videos/[mediaId]";
const REQUEST = "11111111-1111-4111-8111-111111111111", FILE = "22222222-2222-4222-8222-222222222222";
const create = () => call(UPLOADS, { accountId: "of-a" }, { body: { requestId: REQUEST, expectedConnectionRevision: 3, files: [{ fileId: FILE, name: "synthetic.jpg", size: 1024 }] } });
const video = () => call(VIDEOS, { accountId: "of-a", mediaId: "123" }, { body: { requestId: REQUEST } });
const thrown = () => { throw new TypeError("synthetic network failure"); };
const status = (code: number) => () => Response.json({ ok: false }, { status: code });
const outcome = async (response: Response) => (await response.json() as { outcome?: unknown }).outcome;

if (ensureModuleMocks(import.meta.url, { controls: 2, rest: 5 })) {
  beforeEach(() => reset());

  test("control: an upload create refused 400 upstream is relayed once and answers outcome refused", async () => {
    upstream(status(400));
    const response = await create();
    assert.equal(calls.length, 1, "one upstream create");
    assert.equal(calls[0].url, `${BACKEND}/onlyfans/content/v1/accounts/of-a/vault/uploads`);
    assert.equal(calls[0].method, "POST");
    assert.equal(response.status, 400);
    assert.equal(await outcome(response), "refused");
  });

  test("control: a video request refused 400 upstream is relayed once and answers outcome refused", async () => {
    upstream(status(400));
    const response = await video();
    assert.equal(calls.length, 1, "one upstream video request");
    assert.equal(calls[0].url, `${BACKEND}/onlyfans/content/v1/accounts/of-a/vault/videos/123`);
    assert.equal(response.status, 400);
    assert.equal(await outcome(response), "refused");
  });

  test("B-C1: an upload create whose upstream call throws answers outcome unconfirmed", async () => {
    upstream(thrown);
    const response = await create();
    assert.equal(calls.length, 1);
    assert.equal(await outcome(response), "unconfirmed", `a lost create reply (status ${response.status}) was reported as refused`);
  });

  test("B-C1: an upload create answered 503 upstream answers outcome unconfirmed", async () => {
    upstream(status(503));
    const response = await create();
    assert.equal(calls.length, 1);
    assert.equal(await outcome(response), "unconfirmed", "an upstream 503 after a write was reported as refused");
  });

  test("B-C1: a video request whose upstream call throws answers outcome unconfirmed", async () => {
    upstream(thrown);
    const response = await video();
    assert.equal(calls.length, 1);
    assert.equal(await outcome(response), "unconfirmed", `a lost video reply (status ${response.status}) was reported as refused`);
  });

  test("B-C1: a video request answered 503 upstream answers outcome unconfirmed", async () => {
    upstream(status(503));
    const response = await video();
    assert.equal(calls.length, 1);
    assert.equal(await outcome(response), "unconfirmed", "an upstream 503 after a write was reported as refused");
  });

  test("B-C1: an upstream 401 (service credential rejected) is not answered as the browser's own 401/403", async () => {
    upstream(status(401));
    const response = await create();
    assert.equal(calls.length, 1);
    assert.equal([401, 403].includes(response.status), false, `route answered ${response.status}: the uploader reads it as "sign in again"`);
  });
}
