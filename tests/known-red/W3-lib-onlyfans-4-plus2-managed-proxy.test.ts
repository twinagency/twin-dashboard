// KNOWN RED (REVIEW.md inv 7 D7, CORRECTNESS-REVIEW claim 2, security; W3 lib-onlyfans-4-plus2 F7, F8, F11).
// Lib layer only: lib/onlyfans-managed-proxy/backend.ts over a synthetic broker (http://broker.invalid). No network.
// F7  backend.ts:19,21: POST /v1/assign claims an inventory IP (a write). A lost reply (:19), a broker 5xx, a definite broker refusal
//     (400/422) and our own rejected token (401/403) all become ManagedProxyError(503) with no outcome (only the message text differs), and
//     the sign-in route :20 serializes it as outcome "refused" (connectionRefusal). Refused and unconfirmed cannot be told apart.
// F8  backend.ts:41: the assigned proxyUrl is accepted on any dotted quad, including loopback/RFC1918/link-local (defence in depth: only
//     the authenticated broker supplies it; W3 api-onlyfans-plus7 F2 is the user-reachable raw path).
// F11 (W3 lib-onlyfans-1 F24 handoff) backend.ts:47-53: ONLYFANS_MANAGED_PROXY_TOKEN equal to any of the six ONLYFANS_*_TOKEN
//     purpose tokens or ONLYFANS_SIGNIN_TOKEN is accepted; configuredBackendPurpose (backend-transport.ts:17-18) and onlyfans-sign-in/backend.ts refuse a shared token.
// Fixed looks like: ManagedProxyError carries outcome (D7 statuses refused with their status, else unconfirmed) and routes forward it;
// a shared private-address refusal for proxy hosts; one configuredService(urlEnv, tokenEnv) that refuses token reuse.
// Team's Claude owns the fix. Wired into the init.sh known-red loop at W3 close. backend.ts imports 'server-only'; this file resolves it
// to the shared stub scripts/server-only.ts in-process (same pattern as W3-lib-onlyfans-3-offer-import), so no TSX_TSCONFIG_PATH is needed:
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-lib-onlyfans-4-plus2-managed-proxy.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-lib-onlyfans-4-plus2-managed-proxy.test.ts   (red, ERR_ASSERTION)
// Synthetic values only.
import assert from "node:assert/strict";
import test from "node:test";
import Module, { createRequire } from "node:module";

// backend.ts imports the bundler-only `server-only` marker; resolve it to the repo's stub for this process only, then load backend.ts.
const resolver = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const requireHere = createRequire(import.meta.url), resolveOriginal = resolver._resolveFilename, serverOnlyStub = requireHere.resolve("../../scripts/server-only.ts");
resolver._resolveFilename = (request, ...rest) => request === "server-only" ? serverOnlyStub : resolveOriginal(request, ...rest);
const lib = requireHere("../../lib/onlyfans-managed-proxy/backend") as typeof import("../../lib/onlyfans-managed-proxy/backend");

const SELECTION = { countryCode: "US", handle: "synthetic_creator" };
const ACTOR = "op-session:" + "a".repeat(64);
const broker = (answer: () => Response | Promise<Response>) => {
  const calls: string[] = [];
  const client = lib.createManagedProxyBackend({ baseUrl: "http://broker.invalid", token: "synthetic-token-".padEnd(40, "x"),
    fetchImpl: (async (url: string | URL) => { calls.push(String(url)); return answer(); }) as typeof fetch });
  return { calls, client };
};
async function failure(answer: () => Response | Promise<Response>) {
  const b = broker(answer);
  try { await b.client.assign("creator-a", SELECTION, ACTOR); } catch (error) {
    assert.ok(error instanceof lib.ManagedProxyError); assert.equal(b.calls.length, 1, "attempted once");
    const e = error as InstanceType<typeof lib.ManagedProxyError>;
    return { status: e.status, outcome: (error as unknown as { outcome?: string }).outcome, message: e.message };
  }
  assert.fail("assign should have failed");
}
const assigned = (proxyUrl: string) => () => Response.json({ ok: true, proxyUrl });

test("control: a broker 409 is relayed as 409 after one POST", async () => {
  const r = await failure(() => Response.json({ ok: false, code: "proxy_stock_empty" }, { status: 409 }));
  assert.equal(r.status, 409);
});
test("control: a public assigned proxy is returned", async () => {
  const b = broker(assigned("http://user:pass@8.8.4.4:12323"));
  assert.equal(await b.client.assign("creator-a", SELECTION, ACTOR), "http://user:pass@8.8.4.4:12323");
});
for (const refusal of [400, 422]) test(`F7: a definite broker refusal (${refusal}) is marked refused`, async () => {
  const refused = await failure(() => Response.json({ ok: false, code: "invalid_request" }, { status: refusal }));
  assert.deepEqual({ status: refused.status, outcome: refused.outcome }, { status: refusal, outcome: "refused" }, "D7: a 400/422 proves the assign was not applied; keep its status");
});
const unconfirmed: Array<[string, () => Response]> = [
  ["a lost reply", () => { throw new TypeError("fetch failed"); }],
  ["a broker 503", () => Response.json({ ok: false }, { status: 503 })],
];
for (const [name, answer] of unconfirmed) test(`F7: ${name} to assign is marked unconfirmed`, async () => {
  const r = await failure(answer);
  assert.equal(r.outcome, "unconfirmed");
});
for (const host of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.9", "169.254.169.254", "0.0.0.0"]) {
  test(`F8: an assigned proxy on ${host} is refused`, async () => {
    const b = broker(assigned(`http://user:pass@${host}:12323`));
    await assert.rejects(() => b.client.assign("creator-a", SELECTION, ACTOR), lib.ManagedProxyError);
  });
}

const PURPOSE_TOKENS = ["API", "CONTROL", "CONFIGURATION", "CAMPAIGN", "CONTENT", "CONNECTION", "SIGNIN"].map(p => `ONLYFANS_${p}_TOKEN`); // backend-transport.ts:11 + sign-in
const ENV = ["ONLYFANS_MANAGED_PROXY_BASE_URL", "ONLYFANS_MANAGED_PROXY_TOKEN", ...PURPOSE_TOKENS];
function withEnv(values: Record<string, string>, run: () => void) {
  const saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  Object.assign(process.env, values);
  try { run(); } finally { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}
const SHARED = "synthetic-shared-token-".padEnd(40, "s");
test("control: a distinct managed-proxy token configures the broker", () => withEnv({
  ONLYFANS_MANAGED_PROXY_BASE_URL: "http://broker.invalid", ONLYFANS_MANAGED_PROXY_TOKEN: SHARED, ONLYFANS_CONNECTION_TOKEN: "synthetic-other-".padEnd(40, "o"),
}, () => assert.notEqual(lib.configuredManagedProxyBackend(), null)));
for (const purpose of PURPOSE_TOKENS) {
  test(`F11: a managed-proxy token equal to ${purpose} reads as not configured`, () => withEnv({
    ONLYFANS_MANAGED_PROXY_BASE_URL: "http://broker.invalid", ONLYFANS_MANAGED_PROXY_TOKEN: SHARED, [purpose]: SHARED,
  }, () => assert.equal(lib.configuredManagedProxyBackend(), null)));
}
