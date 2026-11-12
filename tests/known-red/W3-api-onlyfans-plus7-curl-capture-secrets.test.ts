// KNOWN RED (REVIEW.md inv 6 "Secrets: OnlyFans session data never reaches the browser"; W3 api-onlyfans-plus7 finding C-C3 = codex X1/DA1).
// Drives the real POST app/api/onlyfans-connections/accounts/[accountId]/capture-from-curl/route.ts as the internal operator
// (tests/helpers/W3-api-onlyfans-plus7-harness.ts: route.ts, next/headers, server-only, supabase-service mocked; the real
// connectionCommandContext, verifySessionToken, configuredConnectionBackend and captureFromCurl run over a fake wire at
// https://backend.invalid). No extra module mocks in this file.
// Trace: capture-from-curl/route.ts:20 `connectionAnswer({ ..., ...result.data })` spreads backend.ts:56 `{ capture: body.capture, xHash,
// ownerId }` to the browser. `capture` holds the OnlyFans session: cookies[].value, headers.x_bc, user_agent. contract.ts:2 claims
// "Credentials are write-only". connectionCapture (contract.ts:44) is not exact-keyed, so an unknown upstream key inside capture is
// echoed verbatim too.
// Fixed looks like: the converted capture stays server-side (e.g. sealed by the backend and referenced by an opaque id the later save
// sends back), and the response is a by-name projection such as { ok, ownerId } with no cookie, x_bc or unknown key. The UI
// (components/onlyfans-preview/ConnectionEditor.tsx:103-107) currently needs `capture` back, so the fix spans route + editor.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh. Runs with plain commands (the file re-runs itself under
// --experimental-test-module-mocks, see ensureModuleMocks):
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-curl-capture-secrets.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-curl-capture-secrets.test.ts   (red, ERR_ASSERTION)
// Synthetic values only. The cookie value, x_bc and xHash sentinels are generated per run (randomUUID), so nothing cookie or session
// header shaped is committed (REVIEW.md inv 6); the cookie name is a neutral literal.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { beforeEach } from "node:test";
import { BACKEND, call, calls, ensureModuleMocks, reset, upstream } from "../helpers/W3-api-onlyfans-plus7-harness";

const ROUTE = "onlyfans-connections/accounts/[accountId]/capture-from-curl";
const COOKIE = `s-${randomUUID()}`, XBC = `b-${randomUUID()}`, XHASH = `h-${randomUUID()}`, EXTRA = "syntheticExtraSentinel";
/** A capture that passes contract.ts connectionCapture for owner 123, plus one unknown key. */
const capture = {
  headers: { user_id: "123", user_agent: "synthetic-agent", x_bc: XBC, x_of_rev: "synthetic-rev" },
  signing: { rules: { static_param: "synthetic", start: "1", end: "2", checksum_indexes: Array.from({ length: 32 }, (_, i) => i), checksum_constant: 7 } },
  cookies: [{ name: "c", value: COOKIE }],
  [EXTRA]: "synthetic-extra-value",
};
const converted = () => Response.json({ ok: true, capture, xHash: XHASH, ownerId: 123 });
const paste = () => call(ROUTE, { accountId: "of-a" }, { body: { curl: "curl 'https://example.invalid/api2/v2/users/me' -H 'synthetic: 1'" } });

if (ensureModuleMocks(import.meta.url, { controls: 1, rest: 2 })) {
  beforeEach(() => reset());

  test("control: a pasted curl is converted once upstream and answered 200 ok", async () => {
    upstream(converted);
    const response = await paste();
    assert.equal(response.status, 200);
    const body = await response.json() as { ok?: unknown; ownerId?: unknown };
    assert.equal(body.ok, true);
    assert.equal(body.ownerId, 123);
    assert.equal(calls.length, 1, "exactly one upstream conversion");
    assert.equal(calls[0].url, `${BACKEND}/onlyfans/connection/v1/accounts/of-a/capture-from-curl`);
    assert.equal(calls[0].method, "POST");
  });

  test("C-C3: the converted capture's cookie value and x_bc never reach the browser", async () => {
    upstream(converted);
    const response = await paste();
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text.includes(COOKIE), false, "the OnlyFans session cookie value was returned to the browser");
    assert.equal(text.includes(XBC), false, "the OnlyFans x_bc session header was returned to the browser");
  });

  test("C-C3: an unknown upstream key inside the capture is not echoed (allowlist projection)", async () => {
    upstream(converted);
    const response = await paste();
    assert.equal(response.status, 200);
    assert.equal((await response.text()).includes(EXTRA), false, "an unchecked upstream key reached the browser");
  });
}
