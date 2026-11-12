// KNOWN RED (W3-lib-onlyfans-2 C2C1, C3S F2, C3C N1; REVIEW.md inv 7 "No false success" + known failure mode
// "OF session expiry ... re-auth signal"): an upstream 401/403 means the DASHBOARD's service credential was rejected,
// not the operator's session. The configuration and control backends echo that status as their own:
//   lib/onlyfans/launch/native-backend.ts:58-67   configuration GET/POST: 401/403 -> {status: 401|403, outcome:"refused"}
//   lib/onlyfans/launch/native-backend.ts:184-193 control / ledger/retry / ledger/resolve: 401/403 -> same
// Routes forward the status (a-route.ts:38,46; b-native-routes.ts:30-31; account-controls-route.ts:63), and the browser
// reads 401/403 as "your session is denied" (b-common.ts:49-50 -> BAutomationPanel.tsx:83 setManage(false), STOP disabled).
// The read backend already maps upstream 401 to 503 (native-backend.ts:130), the shape the control test pins.
// Fixed: status is never 401/403 for an upstream credential rejection (e.g. 503 or 502); a write stays "refused" (D7:
// 401/403 prove the write was not applied) on a non-2xx status (a-shared.tsx:58-60 and b-common.ts:52 read 2xx as
// ok/unconfirmed whatever the outcome says).
// The N1 reds drive the ROUTE layer, not NativeResult, so a fix in the transport or in the forwarding helpers both close
// them: configuration write/read and ledger/retry, ledger/resolve through dispatchLaunch (a-route.ts) over the real
// createLaunchBackend; the account emergency stop through the real accountControls handler in the route child harness
// (W3-lib-onlyfans-2-route.child.ts, scenarios account-stop-401/403).
// th4 (same shape, READ path): native-backend.ts:131 passes upstream 400/403/404/409 through as their own status (only
// 401 is mapped to 503 at :130); a-route.ts:38 forwards it and components/onlyfans-launch/a-shared.tsx:35 turns 403
// into "denied" (clears lastSuccess, "Sign in again"). Measured: upstream 403 on GET readiness -> dispatchLaunch 403.
// dispatchLaunch tests stub the `server-only` package (resolution hook, restored after) because a-route.ts -> route.ts ->
// plan-c-owner.ts:1 imports it and it is not installed; that crash is D3, pinned in W3-lib-onlyfans-2-d3-b-native-routes.
// Team's Claude owns the fix; not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { Module } from "node:module";
import { createNativeReadBackend } from "../../lib/onlyfans/launch/native-backend";
import type { LaunchCall } from "../../lib/onlyfans/launch/a-route";
import { runRoute } from "./W3-lib-onlyfans-2-route.spawn";

const BASE = "https://backend.invalid";
const TOKEN = "synthetic-token";
const SESSION_STATUSES = [401, 403];

function answering(status: number) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ ok: false, error: "synthetic upstream answer" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test("control: the read backend maps an upstream 401 to 503 unavailable", async () => {
  const fake = answering(401);
  const read = createNativeReadBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: fake.fetchImpl });
  const result = await read("of-a", "readiness");
  assert.equal(fake.calls.length, 1, "the fake backend was reached once");
  assert.equal(fake.calls[0], `${BASE}/onlyfans/api/v1/accounts/of-a/readiness`);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.outcome, "unavailable");
  }
});

type Resolver = { _resolveFilename: (request: string, ...rest: unknown[]) => string; _cache: Record<string, unknown> };
async function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const resolver = Module as unknown as Resolver;
  const original = resolver._resolveFilename;
  resolver._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === "server-only" ? "server-only-stub" : original.call(this, request, ...rest);
  };
  resolver._cache["server-only-stub"] = { id: "server-only-stub", filename: "server-only-stub", loaded: true, exports: {} };
  try {
    return await run();
  } finally {
    resolver._resolveFilename = original;
  }
}

/** The real dispatchLaunch over the real createLaunchBackend; every purpose token is set, the wire is `fake`. */
async function launch(fake: ReturnType<typeof answering>, call: Omit<LaunchCall, "accountId" | "query">) {
  return withServerOnlyStub(async () => {
    const { dispatchLaunch } = await import("../../lib/onlyfans/launch/a-route");
    const { createLaunchBackend } = await import("../../lib/onlyfans/launch/a-backend");
    const backend = createLaunchBackend({ baseUrl: BASE, token: TOKEN, apiToken: TOKEN, controlToken: TOKEN, fetchImpl: fake.fetchImpl });
    return dispatchLaunch({ ...call, accountId: "of-a", query: new URLSearchParams() }, backend);
  });
}
const outcome = (body: unknown) => (body as { outcome?: unknown } | null)?.outcome;
/** A refused write must answer non-2xx: a-shared.tsx:58-60 postCommand and b-common.ts:52 read any 2xx as ok/unconfirmed. */
const is2xx = (status: number) => status >= 200 && status < 300;

const APPROVE = { path: "personality/approve", id: null, body: { expectedRevision: 3, expectedBindingId: "binding-a",
  acknowledgements: { mixedAuthorship: true, runtimeRules: true, factsVerified: true } } };
const LEDGER = {
  "ledger/retry": { path: "ledger/retry", id: null, body: { expectedConnectionRevision: 2, expectedScanFingerprint: "e".repeat(64) } },
  "ledger/resolve": { path: "ledger/resolve", id: null, body: { expectedFingerprint: "e".repeat(64), reason: "synthetic check", evidenceHash: "d".repeat(64) } },
} as const;

test("N1: a personality write answered 401/403 upstream is refused without a session status at the launch route", async () => {
  for (const status of SESSION_STATUSES) {
    const fake = answering(status);
    const answer = await launch(fake, { method: "POST", path: ["command"], actor: "operator:synthetic", canManage: true, body: APPROVE });
    assert.deepEqual(fake.calls, [`${BASE}/onlyfans/configuration/v1/accounts/of-a/personality/approve`], `${status}: the fake backend was reached once`);
    assert.ok(!SESSION_STATUSES.includes(answer.status), `upstream ${status}: native-backend.ts:58 + a-route.ts:46 answer HTTP ${answer.status} (a-shared.tsx:59 -> denied)`);
    assert.ok(!is2xx(answer.status), `upstream ${status}: a refused write answered HTTP ${answer.status} reads ok/unconfirmed (a-shared.tsx:58-60)`);
    assert.equal(outcome(answer.body), "refused", `upstream ${status}: D7, 401/403 prove the write was not applied`);
  }
});

test("N1: a personality read answered 401/403 upstream is not a session status at the launch route", async () => {
  for (const status of SESSION_STATUSES) {
    const fake = answering(status);
    const answer = await launch(fake, { method: "GET", path: ["personality"], actor: null, canManage: false });
    assert.deepEqual(fake.calls, [`${BASE}/onlyfans/configuration/v1/accounts/of-a/personality`], `${status}: the fake backend was reached once`);
    assert.ok(!SESSION_STATUSES.includes(answer.status), `upstream ${status}: native-backend.ts:58 + a-route.ts:38 answer HTTP ${answer.status} (a-shared.tsx:35 -> denied)`);
  }
});

test("N1: a ledger retry/resolve answered 401/403 upstream is refused without a session status at the launch route", async () => {
  for (const status of SESSION_STATUSES) {
    for (const path of ["ledger/retry", "ledger/resolve"] as const) {
      const fake = answering(status);
      const answer = await launch(fake, { method: "POST", path: ["command"], actor: "operator:synthetic", canManage: true, body: LEDGER[path] });
      assert.deepEqual(fake.calls, [`${BASE}/onlyfans/control/v1/accounts/of-a/${path}`], `${status} ${path}: the fake backend was reached once`);
      assert.ok(!SESSION_STATUSES.includes(answer.status), `upstream ${status} on ${path}: native-backend.ts:184 + a-route.ts:46 answer HTTP ${answer.status}`);
      assert.ok(!is2xx(answer.status), `upstream ${status} on ${path}: a refused write answered HTTP ${answer.status} reads ok/unconfirmed (a-shared.tsx:58-60)`);
      assert.equal(outcome(answer.body), "refused", `upstream ${status} on ${path}: D7, 401/403 prove the write was not applied`);
    }
  }
});

test("N1: an account emergency stop answered 401/403 upstream is refused without a session status (real accountControls)", () => {
  for (const status of SESSION_STATUSES) {
    const r = runRoute(status === 401 ? "account-stop-401" : "account-stop-403");
    assert.deepEqual(r.calls.map(c => `${c.method} ${c.path}`), ["POST /onlyfans/control/v1/accounts/of-a/control"], `${status}: relayed once`);
    assert.equal(r.body.ok, false);
    assert.ok(!SESSION_STATUSES.includes(r.status), `upstream ${status}: native-backend.ts:184 + account-controls-route.ts:63 answer HTTP ${r.status} (b-common.ts:49-50 -> denied)`);
    assert.ok(!is2xx(r.status), `upstream ${status}: a refused stop answered HTTP ${r.status} reads ok (b-common.ts:52)`);
    assert.ok(r.body.outcome === "refused" || r.body.code === "refused", `upstream ${status}: D7 refused, got ${JSON.stringify(r.body)}`);
  }
});

test("th4: an upstream 403 on a launch read is not answered as a session denial", async () => {
  const fake = answering(403);
  const answer = await launch(fake, { method: "GET", path: ["readiness"], actor: null, canManage: false });
  assert.deepEqual(fake.calls, [`${BASE}/onlyfans/api/v1/accounts/of-a/readiness`], "the fake backend was reached once");
  assert.ok(!SESSION_STATUSES.includes(answer.status), `native-backend.ts:131 + a-route.ts:38 answer upstream 403 as HTTP ${answer.status} (a-shared.tsx:35 -> denied)`);
});
